import { and, between, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { sendTrialExpiredEmail, sendTrialExpiringEmail } from "@/lib/email";
import { PaymentHooks } from "../hooks";
import type {
  ExpireTrialsResponse,
  NotifyExpiringTrialsResponse,
} from "./jobs.model";

const DAYS_BEFORE_NOTIFICATION = 3;
const DAYS_NOTIFICATION_WINDOW = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type OrganizationOwner = {
  email: string;
  name: string | null;
};

export abstract class JobsService {
  private static async findOrganizationOwner(
    organizationId: string
  ): Promise<OrganizationOwner | null> {
    const [owner] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
      .where(
        and(
          eq(schema.members.organizationId, organizationId),
          eq(schema.members.role, "owner")
        )
      )
      .limit(1);

    return owner ?? null;
  }

  static async expireTrials(): Promise<ExpireTrialsResponse> {
    const now = new Date();

    const trialsToExpire = await db
      .select({
        subscription: schema.orgSubscriptions,
        organization: schema.organizations,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.organizations,
        eq(schema.orgSubscriptions.organizationId, schema.organizations.id)
      )
      .where(
        and(
          eq(schema.orgSubscriptions.status, "trial"),
          lt(schema.orgSubscriptions.trialEnd, now)
        )
      );

    const expiredIds: string[] = [];

    for (const { subscription, organization } of trialsToExpire) {
      await db
        .update(schema.orgSubscriptions)
        .set({ status: "expired" })
        .where(eq(schema.orgSubscriptions.id, subscription.id));

      expiredIds.push(subscription.id);

      const owner = await JobsService.findOrganizationOwner(
        subscription.organizationId
      );

      if (owner?.email) {
        try {
          await sendTrialExpiredEmail({
            to: owner.email,
            userName: owner.name ?? "Usuário",
            organizationName: organization.name,
          });
        } catch (error) {
          console.error(
            `[Jobs] Failed to send trial expired email for ${subscription.id}:`,
            error
          );
        }
      }

      PaymentHooks.emit("trial.expired", { subscription });
    }

    console.log(`[Jobs] Expired ${expiredIds.length} trials`);

    return {
      success: true as const,
      data: {
        processed: trialsToExpire.length,
        expired: expiredIds,
      },
    };
  }

  static async notifyExpiringTrials(): Promise<NotifyExpiringTrialsResponse> {
    const now = new Date();
    const notificationStart = new Date(
      now.getTime() + DAYS_BEFORE_NOTIFICATION * MS_PER_DAY
    );
    const notificationEnd = new Date(
      now.getTime() + DAYS_NOTIFICATION_WINDOW * MS_PER_DAY
    );

    const expiringTrials = await db
      .select({
        subscription: schema.orgSubscriptions,
        organization: schema.organizations,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.organizations,
        eq(schema.orgSubscriptions.organizationId, schema.organizations.id)
      )
      .where(
        and(
          eq(schema.orgSubscriptions.status, "trial"),
          between(
            schema.orgSubscriptions.trialEnd,
            notificationStart,
            notificationEnd
          )
        )
      );

    const notifiedIds: string[] = [];

    for (const { subscription, organization } of expiringTrials) {
      const owner = await JobsService.findOrganizationOwner(
        subscription.organizationId
      );

      if (!(owner?.email && subscription.trialEnd)) {
        continue;
      }

      const daysRemaining = Math.ceil(
        (subscription.trialEnd.getTime() - now.getTime()) / MS_PER_DAY
      );

      try {
        await sendTrialExpiringEmail({
          to: owner.email,
          userName: owner.name ?? "Usuário",
          organizationName: organization.name,
          daysRemaining,
          trialEndDate: subscription.trialEnd,
        });

        notifiedIds.push(subscription.id);

        PaymentHooks.emit("trial.expiring", {
          subscription,
          daysRemaining,
        });
      } catch (error) {
        console.error(
          `[Jobs] Failed to notify trial expiring for ${subscription.id}:`,
          error
        );
      }
    }

    console.log(`[Jobs] Notified ${notifiedIds.length} expiring trials`);

    return {
      success: true as const,
      data: {
        processed: expiringTrials.length,
        notified: notifiedIds,
      },
    };
  }
}
