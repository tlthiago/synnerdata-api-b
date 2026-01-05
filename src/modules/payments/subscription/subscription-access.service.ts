import {
  findWithPlan,
  GRACE_PERIOD_DAYS,
  MS_PER_DAY,
  type Subscription,
} from "./subscription.helpers";
import type { CheckAccessData } from "./subscription.model";

/**
 * Service responsible for checking subscription access status.
 * Computes derived states (trial, trial_expired, etc.) from database state.
 */
export abstract class SubscriptionAccessService {
  /**
   * Verifies the access status of an organization.
   * Returns computed state: trial, trial_expired, active, past_due, expired, canceled, no_subscription
   *
   * @param organizationId - The organization ID to check
   * @returns Access status with hasAccess, status, daysRemaining, trialEnd, requiresPayment
   */
  static async checkAccess(organizationId: string): Promise<CheckAccessData> {
    const result = await findWithPlan(organizationId);

    if (!result) {
      return {
        hasAccess: false,
        status: "no_subscription",
        daysRemaining: null,
        trialEnd: null,
        requiresPayment: true,
      };
    }

    const { subscription, plan } = result;
    const now = new Date();

    // Handle trial plan (check by plan.isTrial, not by status)
    // But only if the subscription is still "active" - if the job already ran
    // and set status to "expired", we should return "expired" not "trial_expired"
    if (
      plan.isTrial &&
      subscription.trialEnd &&
      subscription.status === "active"
    ) {
      return SubscriptionAccessService.handleTrialAccess(
        subscription.trialEnd,
        now
      );
    }

    // Handle active paid subscription
    if (subscription.status === "active") {
      return {
        hasAccess: true,
        status: "active",
        daysRemaining: null,
        trialEnd: null,
        requiresPayment: false,
      };
    }

    // Handle past_due with grace period
    if (subscription.status === "past_due") {
      return SubscriptionAccessService.handlePastDueAccess(subscription, now);
    }

    // Handle expired or canceled status
    return {
      hasAccess: false,
      status: subscription.status as "expired" | "canceled",
      daysRemaining: null,
      trialEnd: subscription.trialEnd,
      requiresPayment: true,
    };
  }

  /**
   * Handles access check for trial subscriptions.
   * Calculates if trial is expired and days remaining.
   */
  private static handleTrialAccess(
    trialEndDate: Date,
    now: Date
  ): CheckAccessData {
    const trialEnd = new Date(trialEndDate);
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
      (trialEnd.getTime() - now.getTime()) / MS_PER_DAY
    );

    return {
      hasAccess: true,
      status: "trial",
      daysRemaining,
      trialEnd,
      requiresPayment: false,
    };
  }

  /**
   * Handles access check for past_due subscriptions.
   * Calculates grace period remaining.
   */
  private static handlePastDueAccess(
    subscription: Subscription,
    now: Date
  ): CheckAccessData {
    // If grace period has ended, no access
    if (subscription.gracePeriodEnds && now > subscription.gracePeriodEnds) {
      return {
        hasAccess: false,
        status: "past_due",
        daysRemaining: 0,
        trialEnd: subscription.trialEnd,
        requiresPayment: true,
      };
    }

    // Calculate grace days remaining
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
}
