import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  SubscriptionAlreadyActiveError,
  SubscriptionNotCancelableError,
  SubscriptionNotFoundError,
  SubscriptionNotRestorableError,
} from "@/modules/payments/errors";
import { PaymentHooks } from "@/modules/payments/hooks";
import type {
  CancelSubscriptionData,
  CancelSubscriptionInput,
  GetSubscriptionData,
  GetSubscriptionInput,
  RestoreSubscriptionData,
  RestoreSubscriptionInput,
} from "./subscription.model";

type Subscription = typeof schema.orgSubscriptions.$inferSelect;

const GRACE_PERIOD_DAYS = 15;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export abstract class SubscriptionService {
  private static async findByOrganizationId(
    organizationId: string
  ): Promise<Subscription | null> {
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    return subscription ?? null;
  }

  static async getByOrganizationId(
    input: GetSubscriptionInput
  ): Promise<GetSubscriptionData> {
    const { organizationId } = input;

    const [result] = await db
      .select({
        subscription: schema.orgSubscriptions,
        plan: schema.subscriptionPlans,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!result) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const { subscription, plan } = result;

    return {
      id: subscription.id,
      organizationId: subscription.organizationId,
      status: subscription.status,
      plan: {
        id: plan.id,
        name: plan.name,
        displayName: plan.displayName,
        limits: plan.limits,
      },
      billingCycle: subscription.billingCycle as "monthly" | "yearly" | null,
      trialStart: subscription.trialStart?.toISOString() ?? null,
      trialEnd: subscription.trialEnd?.toISOString() ?? null,
      trialUsed: subscription.trialUsed,
      currentPeriodStart:
        subscription.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt?.toISOString() ?? null,
      seats: subscription.seats,
    };
  }

  static async cancel(
    input: CancelSubscriptionInput
  ): Promise<CancelSubscriptionData> {
    const { organizationId, userId } = input;

    const subscription =
      await SubscriptionService.findByOrganizationId(organizationId);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    if (!["active", "trial"].includes(subscription.status)) {
      throw new SubscriptionNotCancelableError(subscription.status);
    }

    await db
      .update(schema.orgSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    const [updatedSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    if (updatedSubscription) {
      PaymentHooks.emit("subscription.cancelScheduled", {
        subscription: updatedSubscription,
      });
    }

    // Send cancellation scheduled email
    const [emailData] = await db
      .select({
        userEmail: schema.users.email,
        organizationName: schema.organizations.name,
        planName: schema.subscriptionPlans.name,
      })
      .from(schema.users)
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, organizationId)
      )
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, subscription.planId)
      )
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (emailData && subscription.currentPeriodEnd) {
      const { sendCancellationScheduledEmail } = await import("@/lib/email");
      await sendCancellationScheduledEmail({
        to: emailData.userEmail,
        organizationName: emailData.organizationName,
        planName: emailData.planName,
        accessUntil: subscription.currentPeriodEnd,
      });
    }

    return {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  static async restore(
    input: RestoreSubscriptionInput
  ): Promise<RestoreSubscriptionData> {
    const { organizationId } = input;

    const subscription =
      await SubscriptionService.findByOrganizationId(organizationId);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    // Cannot restore if:
    // - Not scheduled for cancellation (cancelAtPeriodEnd = false)
    // - Already fully canceled via Pagarme webhook (status = "canceled")
    // - Already expired (status = "expired")
    const isNotScheduledForCancellation = !subscription.cancelAtPeriodEnd;
    const isAlreadyCanceled = subscription.status === "canceled";
    const isExpired = subscription.status === "expired";

    if (isNotScheduledForCancellation || isAlreadyCanceled || isExpired) {
      throw new SubscriptionNotRestorableError();
    }

    await db
      .update(schema.orgSubscriptions)
      .set({
        cancelAtPeriodEnd: false,
        canceledAt: null,
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    const [updatedSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    if (updatedSubscription) {
      PaymentHooks.emit("subscription.restored", {
        subscription: updatedSubscription,
      });
    }

    return {
      restored: true,
    };
  }

  static async hasActiveSubscription(organizationId: string): Promise<boolean> {
    const [subscription] = await db
      .select({ status: schema.orgSubscriptions.status })
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    return (
      subscription?.status === "active" || subscription?.status === "trial"
    );
  }

  static async hasPaidSubscription(organizationId: string): Promise<boolean> {
    const [subscription] = await db
      .select({ status: schema.orgSubscriptions.status })
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    return subscription?.status === "active";
  }

  static async ensureNoPaidSubscription(organizationId: string): Promise<void> {
    if (await SubscriptionService.hasPaidSubscription(organizationId)) {
      throw new SubscriptionAlreadyActiveError();
    }
  }

  static async checkAccess(organizationId: string): Promise<{
    hasAccess: boolean;
    status:
      | "active"
      | "trial"
      | "trial_expired"
      | "expired"
      | "canceled"
      | "past_due"
      | "no_subscription";
    daysRemaining: number | null;
    trialEnd: Date | null;
    requiresPayment: boolean;
  }> {
    const subscription =
      await SubscriptionService.findByOrganizationId(organizationId);

    if (!subscription) {
      return {
        hasAccess: false,
        status: "no_subscription",
        daysRemaining: null,
        trialEnd: null,
        requiresPayment: true,
      };
    }

    const now = new Date();

    if (subscription.status === "active") {
      return {
        hasAccess: true,
        status: "active",
        daysRemaining: null,
        trialEnd: null,
        requiresPayment: false,
      };
    }

    if (subscription.status === "trial" && subscription.trialEnd) {
      const trialEnd = new Date(subscription.trialEnd);
      const isExpired = now > trialEnd;

      if (isExpired) {
        return {
          hasAccess: false,
          status: "trial_expired",
          daysRemaining: 0,
          trialEnd,
          requiresPayment: true,
        };
      }

      const daysRemaining = Math.ceil(
        (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        hasAccess: true,
        status: "trial",
        daysRemaining,
        trialEnd,
        requiresPayment: false,
      };
    }

    // Handle past_due with grace period
    if (subscription.status === "past_due") {
      if (subscription.gracePeriodEnds && now > subscription.gracePeriodEnds) {
        return {
          hasAccess: false,
          status: "past_due",
          daysRemaining: 0,
          trialEnd: subscription.trialEnd,
          requiresPayment: true,
        };
      }

      const graceDays = subscription.gracePeriodEnds
        ? Math.max(
            0,
            Math.ceil(
              (subscription.gracePeriodEnds.getTime() - now.getTime()) /
                MS_PER_DAY
            )
          )
        : GRACE_PERIOD_DAYS;

      return {
        hasAccess: true,
        status: "past_due",
        daysRemaining: graceDays,
        trialEnd: subscription.trialEnd,
        requiresPayment: true,
      };
    }

    return {
      hasAccess: false,
      status: subscription.status as "expired" | "canceled",
      daysRemaining: null,
      trialEnd: subscription.trialEnd,
      requiresPayment: true,
    };
  }

  static async canUseTrial(organizationId: string): Promise<boolean> {
    const [subscription] = await db
      .select({ trialUsed: schema.orgSubscriptions.trialUsed })
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    return !subscription?.trialUsed;
  }

  /**
   * Creates a trial subscription for an organization.
   * Trial uses a dedicated trial plan with isTrial=true that gives access
   * to all features. Employee limit is set to DEFAULT_TRIAL_EMPLOYEE_LIMIT.
   */
  static async createTrial(organizationId: string): Promise<void> {
    const { DEFAULT_TRIAL_EMPLOYEE_LIMIT } = await import("@/db/schema");
    const { TrialPlanNotConfiguredError } = await import(
      "@/modules/payments/errors"
    );

    const [plan] = await db
      .select({
        id: schema.subscriptionPlans.id,
        trialDays: schema.subscriptionPlans.trialDays,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.isTrial, true))
      .limit(1);

    if (!plan) {
      throw new TrialPlanNotConfiguredError();
    }

    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + plan.trialDays);

    await db.insert(schema.orgSubscriptions).values({
      id: `subscription-${crypto.randomUUID()}`,
      organizationId,
      planId: plan.id,
      status: "trial",
      trialStart,
      trialEnd,
      trialUsed: true,
      employeeCount: DEFAULT_TRIAL_EMPLOYEE_LIMIT,
      seats: 1,
    });

    const subscription =
      await SubscriptionService.findByOrganizationId(organizationId);

    if (subscription) {
      PaymentHooks.emit("trial.started", { subscription });
    }
  }

  static async activate(
    organizationId: string,
    pagarmeSubscriptionId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<void> {
    await db
      .update(schema.orgSubscriptions)
      .set({
        status: "active",
        pagarmeSubscriptionId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));
  }

  static async markPastDue(organizationId: string): Promise<void> {
    const [existing] = await db
      .select({ pastDueSince: schema.orgSubscriptions.pastDueSince })
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    // Idempotent: don't reset dates if already in past_due
    if (existing?.pastDueSince) {
      await db
        .update(schema.orgSubscriptions)
        .set({ status: "past_due" })
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));
      return;
    }

    const now = new Date();
    const gracePeriodEnds = new Date(
      now.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY
    );

    await db
      .update(schema.orgSubscriptions)
      .set({
        status: "past_due",
        pastDueSince: now,
        gracePeriodEnds,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));
  }

  static async expireTrial(subscriptionId: string): Promise<void> {
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription || subscription.status !== "trial") {
      return;
    }

    await db
      .update(schema.orgSubscriptions)
      .set({ status: "expired" })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    const [updatedSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    if (updatedSubscription) {
      PaymentHooks.emit("trial.expired", { subscription: updatedSubscription });
    }
  }

  static async suspend(subscriptionId: string): Promise<void> {
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription || subscription.status !== "past_due") {
      return;
    }

    await db
      .update(schema.orgSubscriptions)
      .set({ status: "canceled" })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    PaymentHooks.emit("subscription.canceled", { subscription });
  }
}
