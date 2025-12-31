import { and, between, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { sendTrialExpiringEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { PaymentHooks } from "@/modules/payments/hooks";
import { PlanChangeService } from "@/modules/payments/plan-change/plan-change.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type {
  ExpireTrialsData,
  NotifyExpiringTrialsData,
  ProcessScheduledCancellationsData,
  ProcessScheduledPlanChangesData,
  SuspendExpiredGracePeriodsData,
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

  static async expireTrials(): Promise<ExpireTrialsData> {
    const now = new Date();

    // Batch query to find expired trials
    const trialsToExpire = await db
      .select({
        subscription: schema.orgSubscriptions,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(
        and(
          eq(schema.subscriptionPlans.isTrial, true),
          eq(schema.orgSubscriptions.status, "active"),
          lt(schema.orgSubscriptions.trialEnd, now)
        )
      );

    const expiredIds: string[] = [];

    for (const { subscription } of trialsToExpire) {
      try {
        // Delegate to SubscriptionService which handles:
        // - Status update
        // - Event emission (trial.expired)
        // - Email is sent by the listener
        await SubscriptionService.expireTrial(subscription.id);
        expiredIds.push(subscription.id);
      } catch (error) {
        logger.error({
          type: "job:expire-trial:failed",
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info({
      type: "job:expire-trials:complete",
      processed: trialsToExpire.length,
      expired: expiredIds.length,
    });

    return {
      processed: trialsToExpire.length,
      expired: expiredIds,
    };
  }

  static async notifyExpiringTrials(): Promise<NotifyExpiringTrialsData> {
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
        plan: schema.subscriptionPlans,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.organizations,
        eq(schema.orgSubscriptions.organizationId, schema.organizations.id)
      )
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(
        and(
          eq(schema.subscriptionPlans.isTrial, true),
          eq(schema.orgSubscriptions.status, "active"),
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
        logger.error({
          type: "job:email:trial-expiring:failed",
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info({
      type: "job:notify-expiring-trials:complete",
      processed: expiringTrials.length,
      notified: notifiedIds.length,
    });

    return {
      processed: expiringTrials.length,
      notified: notifiedIds,
    };
  }

  static async processScheduledCancellations(): Promise<ProcessScheduledCancellationsData> {
    const now = new Date();

    // Batch query to find subscriptions scheduled for cancellation
    const subscriptionsToCancel = await db
      .select({
        subscription: schema.orgSubscriptions,
      })
      .from(schema.orgSubscriptions)
      .where(
        and(
          eq(schema.orgSubscriptions.cancelAtPeriodEnd, true),
          lt(schema.orgSubscriptions.currentPeriodEnd, now),
          eq(schema.orgSubscriptions.status, "active")
        )
      );

    const canceledIds: string[] = [];

    for (const { subscription } of subscriptionsToCancel) {
      try {
        // Delegate to SubscriptionService which handles:
        // - Pagarme cancellation (with retry)
        // - Status update to "canceled"
        // - Event emission (subscription.canceled)
        // - Email is sent by the listener
        const success = await SubscriptionService.cancelScheduled(
          subscription.id
        );
        if (success) {
          canceledIds.push(subscription.id);
        }
      } catch (error) {
        logger.error({
          type: "job:cancel-scheduled:failed",
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info({
      type: "job:process-scheduled-cancellations:complete",
      processed: subscriptionsToCancel.length,
      canceled: canceledIds.length,
    });

    return {
      processed: subscriptionsToCancel.length,
      canceled: canceledIds,
    };
  }

  static async suspendExpiredGracePeriods(): Promise<SuspendExpiredGracePeriodsData> {
    const now = new Date();

    // Batch query to find subscriptions with expired grace period
    const expiredGracePeriods = await db
      .select({
        subscription: schema.orgSubscriptions,
      })
      .from(schema.orgSubscriptions)
      .where(
        and(
          eq(schema.orgSubscriptions.status, "past_due"),
          lt(schema.orgSubscriptions.gracePeriodEnds, now)
        )
      );

    const suspended: string[] = [];

    for (const { subscription } of expiredGracePeriods) {
      try {
        // Delegate to SubscriptionService which handles:
        // - Status update to "canceled"
        // - Event emission (subscription.canceled)
        // - Email is sent by the listener
        await SubscriptionService.suspend(subscription.id);
        suspended.push(subscription.id);
      } catch (error) {
        logger.error({
          type: "job:suspend-grace-period:failed",
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info({
      type: "job:suspend-expired-grace-periods:complete",
      processed: expiredGracePeriods.length,
      suspended: suspended.length,
    });

    return {
      processed: expiredGracePeriods.length,
      suspended,
    };
  }

  static async processScheduledPlanChanges(): Promise<ProcessScheduledPlanChangesData> {
    const scheduledChanges =
      await PlanChangeService.getScheduledChangesForExecution();

    const executed: string[] = [];
    const failed: string[] = [];

    for (const { id: subscriptionId } of scheduledChanges) {
      try {
        await PlanChangeService.executeScheduledChange(subscriptionId);
        executed.push(subscriptionId);
      } catch (error) {
        failed.push(subscriptionId);
        logger.error({
          type: "job:process-scheduled-plan-change:failed",
          subscriptionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info({
      type: "job:process-scheduled-plan-changes:complete",
      processed: scheduledChanges.length,
      executed: executed.length,
      failed: failed.length,
    });

    return {
      processed: scheduledChanges.length,
      executed,
      failed,
    };
  }
}
