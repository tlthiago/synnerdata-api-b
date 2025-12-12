import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSubscriptions, subscriptionPlans } from "@/db/schema";
import {
  SubscriptionAlreadyActiveError,
  SubscriptionNotCancelableError,
  SubscriptionNotFoundError,
  SubscriptionNotRestorableError,
} from "../errors";
import { PaymentHooks } from "../hooks";
import { PagarmeClient } from "../pagarme/client";
import type { SubscriptionResponse } from "./subscription.model";

export abstract class SubscriptionService {
  /**
   * Get subscription for an organization.
   */
  static async getByOrganizationId(
    organizationId: string
  ): Promise<SubscriptionResponse> {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
      with: {
        plan: true,
      },
    });

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    return {
      id: subscription.id,
      organizationId: subscription.organizationId,
      status: subscription.status,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        displayName: subscription.plan.displayName,
        limits: subscription.plan.limits,
      },
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

  /**
   * Cancel subscription at period end.
   */
  static async cancel(organizationId: string) {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    // Only active or trial subscriptions can be canceled
    if (!["active", "trial"].includes(subscription.status)) {
      throw new SubscriptionNotCancelableError(subscription.status);
    }

    // If there's a Pagarme subscription, cancel it
    if (subscription.pagarmeSubscriptionId) {
      await PagarmeClient.cancelSubscription(
        subscription.pagarmeSubscriptionId,
        false // Don't cancel pending invoices
      );
    }

    // Update local subscription
    await db
      .update(orgSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
        status: "canceled",
      })
      .where(eq(orgSubscriptions.id, subscription.id));

    // Fetch updated subscription
    const updatedSubscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.id, subscription.id),
    });

    if (updatedSubscription) {
      PaymentHooks.emit("subscription.canceled", {
        subscription: updatedSubscription,
      });
    }

    return {
      success: true,
      message: "Subscription will be canceled at the end of the current period",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  /**
   * Restore a canceled subscription (before period ends).
   */
  static async restore(organizationId: string) {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    // Can only restore if cancelAtPeriodEnd is true and not expired
    if (!subscription.cancelAtPeriodEnd || subscription.status === "expired") {
      throw new SubscriptionNotRestorableError();
    }

    // Update local subscription
    await db
      .update(orgSubscriptions)
      .set({
        cancelAtPeriodEnd: false,
        canceledAt: null,
        status: "active",
      })
      .where(eq(orgSubscriptions.id, subscription.id));

    return {
      success: true,
      message: "Subscription has been restored",
    };
  }

  /**
   * Check if organization has an active subscription (trial or active).
   */
  static async hasActiveSubscription(organizationId: string): Promise<boolean> {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    return (
      subscription?.status === "active" || subscription?.status === "trial"
    );
  }

  /**
   * Check if organization has a paid active subscription (excludes trial).
   */
  static async hasPaidSubscription(organizationId: string): Promise<boolean> {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    return subscription?.status === "active";
  }

  /**
   * Ensure organization does not have a paid active subscription.
   * @throws {SubscriptionAlreadyActiveError} if organization has an active paid subscription
   */
  static async ensureNoPaidSubscription(organizationId: string): Promise<void> {
    if (await SubscriptionService.hasPaidSubscription(organizationId)) {
      throw new SubscriptionAlreadyActiveError();
    }
  }

  /**
   * Check subscription access status with detailed info.
   * Returns access status considering trial expiration date.
   */
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
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

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

    // Active subscription always has access
    if (subscription.status === "active") {
      return {
        hasAccess: true,
        status: "active",
        daysRemaining: null,
        trialEnd: null,
        requiresPayment: false,
      };
    }

    // Trial subscription - check if expired
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

    // Other statuses (expired, canceled, past_due)
    return {
      hasAccess: subscription.status === "past_due", // Grace period for past_due
      status: subscription.status as "expired" | "canceled" | "past_due",
      daysRemaining: null,
      trialEnd: subscription.trialEnd,
      requiresPayment: true,
    };
  }

  /**
   * Check if organization can use trial.
   */
  static async canUseTrial(organizationId: string): Promise<boolean> {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    return !subscription?.trialUsed;
  }

  /**
   * Create trial subscription for new organization.
   */
  static async createTrial(
    organizationId: string,
    planId: string
  ): Promise<void> {
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, planId),
    });

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + plan.trialDays);

    await db.insert(orgSubscriptions).values({
      id: crypto.randomUUID(),
      organizationId,
      planId,
      status: "trial",
      trialStart,
      trialEnd,
      trialUsed: true,
      seats: 1,
    });

    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    if (subscription) {
      PaymentHooks.emit("trial.started", { subscription });
    }
  }

  /**
   * Activate subscription after successful payment.
   */
  static async activate(
    organizationId: string,
    pagarmeSubscriptionId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<void> {
    await db
      .update(orgSubscriptions)
      .set({
        status: "active",
        pagarmeSubscriptionId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      })
      .where(eq(orgSubscriptions.organizationId, organizationId));
  }

  /**
   * Mark subscription as past due (payment failed).
   */
  static async markPastDue(organizationId: string): Promise<void> {
    await db
      .update(orgSubscriptions)
      .set({ status: "past_due" })
      .where(eq(orgSubscriptions.organizationId, organizationId));
  }

  /**
   * Expire trial subscription.
   */
  static async expireTrial(subscriptionId: string): Promise<void> {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.id, subscriptionId),
    });

    if (!subscription || subscription.status !== "trial") {
      return;
    }

    await db
      .update(orgSubscriptions)
      .set({ status: "expired" })
      .where(eq(orgSubscriptions.id, subscriptionId));

    const updatedSubscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.id, subscriptionId),
    });

    if (updatedSubscription) {
      PaymentHooks.emit("trial.expired", { subscription: updatedSubscription });
    }
  }
}
