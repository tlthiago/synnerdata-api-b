import { db } from "@/db";
import { schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import {
  SubscriptionAlreadyActiveError,
  SubscriptionNotCancelableError,
  SubscriptionNotFoundError,
  SubscriptionNotRestorableError,
  TrialNotCancellableError,
} from "@/modules/payments/errors";
import { PaymentHooks } from "@/modules/payments/hooks";
import {
  PAGARME_RETRY_CONFIG,
  PagarmeClient,
} from "@/modules/payments/pagarme/client";
import { PlansService } from "@/modules/payments/plans/plans.service";
import {
  findById,
  findByIdWithPlan,
  findByOrganizationId,
  findByPagarmeId,
  findWithPlan,
  GRACE_PERIOD_DAYS,
  MS_PER_DAY,
  type Subscription,
  updateById,
} from "./subscription.helpers";
import type {
  CancelSubscriptionData,
  CancelSubscriptionInput,
  RestoreSubscriptionData,
  RestoreSubscriptionInput,
} from "./subscription.model";

/**
 * Service responsible for subscription mutation operations.
 * All methods modify state and/or emit events.
 */
export abstract class SubscriptionMutationService {
  /**
   * Cancel a subscription (soft cancel - schedules cancellation at period end).
   * User keeps access until currentPeriodEnd.
   *
   * @param input - Contains organizationId
   * @returns Cancel data with cancelAtPeriodEnd and currentPeriodEnd
   * @throws SubscriptionNotFoundError if no subscription exists
   * @throws TrialNotCancellableError if subscription is a trial
   * @throws SubscriptionNotCancelableError if subscription cannot be canceled
   */
  static async cancel(
    input: CancelSubscriptionInput
  ): Promise<CancelSubscriptionData> {
    const { organizationId, userId, reason, comment } = input;

    const result = await findWithPlan(organizationId);

    if (!result) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const { subscription, plan } = result;

    if (plan.isTrial) {
      throw new TrialNotCancellableError(organizationId);
    }

    const canCancel = subscription.status === "active";
    if (!canCancel) {
      throw new SubscriptionNotCancelableError(subscription.status);
    }

    const updatedSubscription = await updateById(subscription.id, {
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
      cancelReason: reason ?? null,
      cancelComment: comment ?? null,
    });

    if (updatedSubscription) {
      PaymentHooks.emit("subscription.cancelScheduled", {
        subscription: updatedSubscription,
      });

      const { AuditService } = await import("@/modules/audit/audit.service");
      const { buildAuditChanges } = await import(
        "@/modules/audit/pii-redaction"
      );
      await AuditService.log({
        action: "update",
        resource: "subscription",
        resourceId: subscription.id,
        userId,
        organizationId,
        changes: buildAuditChanges(subscription, updatedSubscription),
      });
    }

    // Email is sent via PaymentHooks listener (subscription.cancelScheduled)

    return {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  /**
   * Restore a subscription that was scheduled for cancellation.
   * Only works if cancelAtPeriodEnd is true and status is not canceled/expired.
   *
   * @param input - Contains organizationId
   * @returns Restore data with restored: true
   * @throws SubscriptionNotFoundError if no subscription exists
   * @throws SubscriptionNotRestorableError if subscription cannot be restored
   */
  static async restore(
    input: RestoreSubscriptionInput
  ): Promise<RestoreSubscriptionData> {
    const { organizationId, userId } = input;

    const subscription = await findByOrganizationId(organizationId);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const isNotScheduledForCancellation = !subscription.cancelAtPeriodEnd;
    const isAlreadyCanceled = subscription.status === "canceled";
    const isExpired = subscription.status === "expired";

    if (isNotScheduledForCancellation || isAlreadyCanceled || isExpired) {
      throw new SubscriptionNotRestorableError();
    }

    const updatedSubscription = await updateById(subscription.id, {
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    if (updatedSubscription) {
      PaymentHooks.emit("subscription.restored", {
        subscription: updatedSubscription,
      });

      const { AuditService } = await import("@/modules/audit/audit.service");
      const { buildAuditChanges } = await import(
        "@/modules/audit/pii-redaction"
      );
      await AuditService.log({
        action: "update",
        resource: "subscription",
        resourceId: subscription.id,
        userId,
        organizationId,
        changes: buildAuditChanges(subscription, updatedSubscription),
      });
    }

    return {
      restored: true,
    };
  }

  /**
   * Ensures organization does not have an active paid subscription.
   * Used before checkout to prevent double-signups.
   *
   * @param organizationId - The organization ID to check
   * @throws SubscriptionAlreadyActiveError if org has active paid subscription
   */
  static async ensureNoPaidSubscription(organizationId: string): Promise<void> {
    const result = await findWithPlan(organizationId);
    const hasPaidSubscription =
      result?.subscription.status === "active" && !result.plan.isTrial;

    if (hasPaidSubscription) {
      throw new SubscriptionAlreadyActiveError();
    }
  }

  /**
   * Creates a trial subscription for an organization.
   * Trial uses a dedicated trial plan with isTrial=true that gives access
   * to all features. Employee limit comes from the trial plan's tier.
   *
   * Idempotent: if a subscription already exists for the organization,
   * logs a warning and returns without error. Uses onConflictDoNothing
   * as an extra defense against race conditions.
   *
   * @param organizationId - The organization ID to create trial for
   */
  static async createTrial(
    organizationId: string,
    options?: { customPricingTierId?: string; customTrialDays?: number }
  ): Promise<void> {
    const existing = await findByOrganizationId(organizationId);
    if (existing) {
      const { logger } = await import("@/lib/logger");
      logger.warn({
        type: "create-trial:already-exists",
        organizationId,
        subscriptionId: existing.id,
      });
      return;
    }

    // getTrialPlan throws TrialPlanNotFoundError if not configured
    const trialPlan = await PlansService.getTrialPlan();

    if (trialPlan.pricingTiers.length === 0) {
      const { TrialPlanMisconfiguredError } = await import(
        "@/modules/payments/errors"
      );
      throw new TrialPlanMisconfiguredError();
    }

    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(
      trialEnd.getDate() + (options?.customTrialDays ?? trialPlan.trialDays)
    );

    const [inserted] = await db
      .insert(schema.orgSubscriptions)
      .values({
        id: `subscription-${crypto.randomUUID()}`,
        organizationId,
        planId: trialPlan.id,
        pricingTierId:
          options?.customPricingTierId ?? trialPlan.pricingTiers[0].id,
        status: "active",
        trialStart,
        trialEnd,
        trialUsed: true,
        seats: 1,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      PaymentHooks.emit("trial.started", { subscription: inserted });
    }
  }

  /**
   * Activates a subscription (typically after successful payment via webhook).
   * Sets status to active, updates period dates, and optionally sets checkout-related fields.
   * Note: pagarmeCustomerId is stored in billing_profiles, not here.
   *
   * @returns The updated subscription, or null if no subscription exists for the org.
   * @note Returns null silently when subscription doesn't exist - this is intentional
   * as webhooks may arrive before subscription creation in edge cases.
   */
  static async activate(input: {
    organizationId: string;
    pagarmeSubscriptionId: string;
    periodStart: Date;
    periodEnd: Date;
    planId?: string;
    pricingTierId?: string;
    billingCycle?: string;
    priceAtPurchase?: number;
    isCustomPrice?: boolean;
  }): Promise<Subscription | null> {
    const {
      organizationId,
      pagarmeSubscriptionId,
      periodStart,
      periodEnd,
      planId,
      pricingTierId,
      billingCycle,
      priceAtPurchase,
      isCustomPrice,
    } = input;

    const updateData: Record<string, unknown> = {
      status: "active",
      pagarmeSubscriptionId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialUsed: true,
    };

    // Add optional checkout fields if provided
    if (planId) {
      updateData.planId = planId;
    }
    if (pricingTierId) {
      updateData.pricingTierId = pricingTierId;
    }
    if (billingCycle) {
      updateData.billingCycle = billingCycle;
    }
    if (priceAtPurchase !== undefined) {
      updateData.priceAtPurchase = priceAtPurchase;
    }
    if (isCustomPrice !== undefined) {
      updateData.isCustomPrice = isCustomPrice;
    }

    const subscription = await findByOrganizationId(organizationId);
    if (!subscription) {
      return null;
    }

    // Idempotency: if already active with same pagarmeSubscriptionId, skip
    // This prevents duplicate events/emails when webhook is resent
    if (
      subscription.status === "active" &&
      subscription.pagarmeSubscriptionId === pagarmeSubscriptionId
    ) {
      return subscription;
    }

    const updatedSubscription = await updateById(subscription.id, updateData);

    // Safety net: warn if employee count exceeds new tier limit
    if (pricingTierId) {
      await SubscriptionMutationService.warnIfEmployeeCountExceedsTier({
        pricingTierId,
        organizationId,
        subscriptionId: subscription.id,
        planId,
      });
    }

    // Archive previous private plan if subscription changed to a different plan.
    // Only archive org-specific plans (organizationId set) — the default trial
    // plan (organizationId=NULL) is shared and must never be archived.
    if (planId && subscription.planId !== planId) {
      const { eq, and, isNotNull } = await import("drizzle-orm");

      await db
        .update(schema.subscriptionPlans)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(schema.subscriptionPlans.id, subscription.planId),
            isNotNull(schema.subscriptionPlans.organizationId)
          )
        );
    }

    if (updatedSubscription) {
      PaymentHooks.emit("subscription.activated", {
        subscription: updatedSubscription,
      });
    }

    return updatedSubscription;
  }

  /**
   * Logs a warning if the active employee count exceeds the tier's maxEmployees.
   * Called after activation as a non-blocking safety net for edge cases where
   * employees were added between checkout creation and payment completion.
   */
  private static async warnIfEmployeeCountExceedsTier(input: {
    pricingTierId: string;
    organizationId: string;
    subscriptionId: string;
    planId?: string;
  }): Promise<void> {
    const { pricingTierId, organizationId, subscriptionId, planId } = input;
    const { eq, and, isNull, count: countFn } = await import("drizzle-orm");

    const [tierInfo] = await db
      .select({ maxEmployees: schema.planPricingTiers.maxEmployees })
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, pricingTierId))
      .limit(1);

    if (!tierInfo) {
      return;
    }

    const [empCount] = await db
      .select({ value: countFn() })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      );

    const currentEmployees = empCount?.value ?? 0;
    if (currentEmployees > tierInfo.maxEmployees) {
      const { logger } = await import("@/lib/logger");
      logger.warn({
        type: "subscription:activate:employee-count-exceeds-tier",
        organizationId,
        subscriptionId,
        currentEmployees,
        tierMaxEmployees: tierInfo.maxEmployees,
        pricingTierId,
        planId,
      });
    }
  }

  /**
   * Marks a subscription as past_due when payment fails.
   * Sets grace period dates if not already set (idempotent).
   *
   * Uses COALESCE to prevent race conditions: the first write sets the dates,
   * subsequent writes preserve them. This ensures grace period is never reset.
   *
   * @param organizationId - The organization ID to mark past_due
   */
  static async markPastDue(organizationId: string): Promise<void> {
    const { eq, sql } = await import("drizzle-orm");

    const now = new Date();
    const gracePeriodEnds = new Date(
      now.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY
    );

    // Atomic update using COALESCE: only sets dates if they're null
    // This prevents race conditions where concurrent webhooks could reset the grace period
    await db
      .update(schema.orgSubscriptions)
      .set({
        status: "past_due",
        pastDueSince: sql`COALESCE(${schema.orgSubscriptions.pastDueSince}, ${now})`,
        gracePeriodEnds: sql`COALESCE(${schema.orgSubscriptions.gracePeriodEnds}, ${gracePeriodEnds})`,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));
  }

  /**
   * Expires a trial subscription.
   * Only proceeds if the subscription is a trial plan.
   *
   * @param subscriptionId - The subscription ID to expire
   */
  static async expireTrial(subscriptionId: string): Promise<void> {
    const result = await findByIdWithPlan(subscriptionId);

    // Only expire if it's a trial plan
    if (!result) {
      const { logger } = await import("@/lib/logger");
      logger.warn({
        type: "expire-trial:subscription-not-found",
        subscriptionId,
      });
      return;
    }

    if (!result.plan.isTrial) {
      const { logger } = await import("@/lib/logger");
      logger.info({
        type: "expire-trial:not-trial-plan",
        subscriptionId,
        planId: result.plan.id,
        planName: result.plan.name,
        planIsTrial: result.plan.isTrial,
      });
      return;
    }

    const updatedSubscription = await updateById(subscriptionId, {
      status: "expired",
    });

    if (updatedSubscription) {
      PaymentHooks.emit("trial.expired", { subscription: updatedSubscription });
    }
  }

  /**
   * Suspends a subscription (changes from past_due to canceled).
   * Called when grace period expires.
   *
   * @param subscriptionId - The subscription ID to suspend
   */
  static async suspend(subscriptionId: string): Promise<void> {
    const subscription = await findById(subscriptionId);

    if (!subscription || subscription.status !== "past_due") {
      return;
    }

    const updatedSubscription = await updateById(subscriptionId, {
      status: "canceled",
    });

    if (updatedSubscription) {
      PaymentHooks.emit("subscription.canceled", {
        subscription: updatedSubscription,
      });
    }
  }

  /**
   * Cancels a subscription that was scheduled for cancellation (cancelAtPeriodEnd=true).
   * Called by the jobs service when currentPeriodEnd has passed.
   * Cancels in Pagarme first (if applicable), then updates local status.
   *
   * @param subscriptionId - The subscription ID to cancel
   * @returns true if successfully canceled, false if not eligible or Pagarme failed
   */
  static async cancelScheduled(subscriptionId: string): Promise<boolean> {
    const subscription = await findById(subscriptionId);

    // Must be active and scheduled for cancellation
    if (
      !subscription ||
      subscription.status !== "active" ||
      !subscription.cancelAtPeriodEnd
    ) {
      return false;
    }

    // Cancel in Pagarme first if applicable
    if (subscription.pagarmeSubscriptionId) {
      try {
        await Retry.withRetry(
          () =>
            PagarmeClient.cancelSubscription(
              subscription.pagarmeSubscriptionId as string,
              false,
              `cancel-scheduled-${subscriptionId}-${Date.now()}`
            ),
          PAGARME_RETRY_CONFIG.WRITE
        );
      } catch {
        // Pagarme cancellation failed - don't cancel locally
        return false;
      }
    }

    const updatedSubscription = await updateById(subscriptionId, {
      status: "canceled",
    });

    if (updatedSubscription) {
      PaymentHooks.emit("subscription.canceled", {
        subscription: updatedSubscription,
      });
    }

    return true;
  }

  /**
   * Marks a subscription as active after successful payment (charge.paid webhook).
   * Updates period dates and clears any grace period fields.
   * Idempotent: safe to call multiple times for the same charge.
   *
   * @returns The updated subscription, or null if not found
   */
  static async markActive(input: {
    organizationId: string;
    pagarmeSubscriptionId?: string;
    periodStart?: Date;
    periodEnd?: Date | null;
  }): Promise<{ subscription: Subscription } | null> {
    const { organizationId, pagarmeSubscriptionId, periodStart, periodEnd } =
      input;

    const subscription = await findByOrganizationId(organizationId);

    if (!subscription) {
      return null;
    }

    const updateData: Record<string, unknown> = {
      status: "active",
      // Clear grace period fields when payment succeeds
      pastDueSince: null,
      gracePeriodEnds: null,
    };

    if (pagarmeSubscriptionId) {
      updateData.pagarmeSubscriptionId = pagarmeSubscriptionId;
    }

    if (periodStart) {
      updateData.currentPeriodStart = periodStart;
    }

    if (periodEnd !== undefined) {
      updateData.currentPeriodEnd = periodEnd;
    }

    const updatedSubscription = await updateById(subscription.id, updateData);

    return updatedSubscription ? { subscription: updatedSubscription } : null;
  }

  /**
   * Cancels a subscription due to refund (charge.refunded webhook).
   * This is a definitive cancellation - access is immediately revoked.
   * Can find subscription by organizationId or pagarmeSubscriptionId.
   *
   * @returns The updated subscription, or null if not found
   */
  static async cancelByRefund(input: {
    organizationId?: string;
    pagarmeSubscriptionId?: string;
    chargeId: string;
    amount: number;
    reason?: string;
  }): Promise<{ subscription: Subscription } | null> {
    const { organizationId, pagarmeSubscriptionId, chargeId, amount, reason } =
      input;

    let subscription: Subscription | null = null;

    if (organizationId) {
      subscription = await findByOrganizationId(organizationId);
    } else if (pagarmeSubscriptionId) {
      subscription = await findByPagarmeId(pagarmeSubscriptionId);
    }

    if (!subscription) {
      return null;
    }

    const canceledAt = new Date();
    await updateById(subscription.id, {
      status: "canceled",
      canceledAt,
    });

    const updatedSubscription = {
      ...subscription,
      status: "canceled" as const,
      canceledAt,
    };

    // Emit refund event first
    PaymentHooks.emit("charge.refunded", {
      subscriptionId: subscription.id,
      chargeId,
      amount,
      reason,
    });

    // Also emit subscription.canceled since access is being revoked
    PaymentHooks.emit("subscription.canceled", {
      subscription: updatedSubscription,
    });

    return { subscription: updatedSubscription };
  }

  /**
   * Cancels a subscription via webhook (definitive cancellation from Pagarme).
   * Unlike user-initiated cancel(), this immediately sets status to "canceled".
   *
   * @param organizationId - The organization ID to cancel
   * @returns The updated subscription, or null if not found
   */
  static async cancelByWebhook(
    organizationId: string
  ): Promise<{ subscription: Subscription } | null> {
    const subscription = await findByOrganizationId(organizationId);

    if (!subscription) {
      return null;
    }

    const canceledAt = new Date();
    await updateById(subscription.id, {
      status: "canceled",
      canceledAt,
    });

    const updatedSubscription = {
      ...subscription,
      status: "canceled" as const,
      canceledAt,
    };

    PaymentHooks.emit("subscription.canceled", {
      subscription: updatedSubscription,
    });

    return { subscription: updatedSubscription };
  }

  /**
   * Cancels a subscription by Pagarme subscription ID (when metadata is missing).
   *
   * @param pagarmeSubscriptionId - The Pagarme subscription ID to cancel
   * @returns The updated subscription, or null if not found
   */
  static async cancelByPagarmeId(
    pagarmeSubscriptionId: string
  ): Promise<{ subscription: Subscription } | null> {
    const subscription = await findByPagarmeId(pagarmeSubscriptionId);

    if (!subscription) {
      return null;
    }

    const canceledAt = new Date();
    await updateById(subscription.id, {
      status: "canceled",
      canceledAt,
    });

    const updatedSubscription = {
      ...subscription,
      status: "canceled" as const,
      canceledAt,
    };

    PaymentHooks.emit("subscription.canceled", {
      subscription: updatedSubscription,
    });

    return { subscription: updatedSubscription };
  }
}
