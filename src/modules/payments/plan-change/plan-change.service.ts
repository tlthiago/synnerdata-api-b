import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  sendCheckoutLinkEmail,
  sendPlanChangeExecutedEmail,
} from "@/lib/email";
import { Retry } from "@/lib/utils/retry";
import { CustomerService } from "@/modules/payments/customer/customer.service";
import {
  EmployeeCountExceedsNewPlanLimitError,
  NoChangeRequestedError,
  NoScheduledChangeError,
  PlanChangeInProgressError,
  PlanNotFoundError,
  SubscriptionNotActiveError,
  SubscriptionNotFoundError,
  YearlyBillingNotAvailableError,
} from "@/modules/payments/errors";
import { PaymentHooks } from "@/modules/payments/hooks";
import { LimitsService } from "@/modules/payments/limits/limits.service";
import {
  PAGARME_RETRY_CONFIG,
  PagarmeClient,
} from "@/modules/payments/pagarme/client";
import type { CreatePaymentLinkRequest } from "@/modules/payments/pagarme/pagarme.types";
import { PagarmePlanService } from "@/modules/payments/pagarme/pagarme-plan.service";
import { PlansService } from "@/modules/payments/plans/plans.service";
import {
  findSubscriptionWithCurrentPlan,
  findSubscriptionWithPendingPlan,
  findSubscriptionWithPlanAndTier,
} from "./plan-change.helpers";
import type {
  CancelScheduledChangeData,
  CancelScheduledChangeInput,
  ChangeSubscriptionData,
  ChangeSubscriptionInput,
  GetScheduledChangeData,
} from "./plan-change.model";
import { ProrationService } from "./proration.service";

const MIN_PRORATION_AMOUNT = 100; // R$ 1.00 - minimum Pagarme charge
const CHECKOUT_EXPIRATION_HOURS = 24;

export abstract class PlanChangeService {
  /**
   * [2.3] Unified method to change subscription.
   * Accepts any combination of: newPlanId, newBillingCycle, newTierId.
   * Upgrades are charged immediately via Payment Link.
   * Downgrades are scheduled for the end of the current period.
   */
  static async changeSubscription(
    input: ChangeSubscriptionInput
  ): Promise<ChangeSubscriptionData> {
    const {
      organizationId,
      newPlanId,
      newBillingCycle,
      newTierId,
      successUrl,
    } = input;

    // 1. Get current subscription with plan and tier
    const result = await findSubscriptionWithPlanAndTier(organizationId);

    if (!result) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const { subscription, plan: currentPlan, tier: currentTier } = result;

    // 2. Validate subscription state
    PlanChangeService.validateSubscriptionForChange(subscription);

    // 3. Determine final values (use current if not provided)
    const currentBillingCycle = (subscription.billingCycle ?? "monthly") as
      | "monthly"
      | "yearly";
    const currentTierId = subscription.pricingTierId;

    const finalPlanId = newPlanId ?? subscription.planId;
    const finalBillingCycle = newBillingCycle ?? currentBillingCycle;
    const finalTierId = newTierId ?? currentTierId;

    // 4. Validate "no change" scenario
    if (
      finalPlanId === subscription.planId &&
      finalBillingCycle === currentBillingCycle &&
      finalTierId === currentTierId
    ) {
      throw new NoChangeRequestedError();
    }

    // 5. Get new plan (if changing)
    const newPlan =
      finalPlanId !== subscription.planId
        ? await PlansService.getAvailableById(finalPlanId)
        : currentPlan;

    // 6. Get new tier
    if (!finalTierId) {
      throw new SubscriptionNotFoundError(organizationId);
    }
    const newTier = await PlansService.getTierById(finalTierId);

    // 7. Validate yearly billing availability
    if (finalBillingCycle === "yearly" && newTier.priceYearly === 0) {
      throw new YearlyBillingNotAvailableError(finalPlanId);
    }

    // 8. Calculate prices
    const currentPrice = currentTier
      ? currentBillingCycle === "yearly"
        ? currentTier.priceYearly
        : currentTier.priceMonthly
      : 0;
    const newPrice =
      finalBillingCycle === "yearly"
        ? newTier.priceYearly
        : newTier.priceMonthly;

    // 9. Determine change type
    const changeType = ProrationService.getChangeType({
      currentPlanPrice: currentPrice,
      newPlanPrice: newPrice,
      currentBillingCycle,
      newBillingCycle: finalBillingCycle,
    });

    // 10. [2.4] If downgrade, validate employee count fits in new tier
    if (changeType === "downgrade") {
      await PlanChangeService.validateEmployeeCountForDowngrade(
        organizationId,
        newTier.maxEmployees
      );
    }

    // 11. Process upgrade or schedule downgrade
    if (changeType === "upgrade") {
      return PlanChangeService.processUnifiedUpgrade({
        subscription,
        currentPlan,
        newPlan: {
          id: newPlan.id,
          name: newPlan.name,
          displayName: newPlan.displayName,
        },
        newTier,
        currentPrice,
        newPrice,
        finalBillingCycle,
        successUrl,
        organizationId,
      });
    }

    // [2.5] Downgrade saves pendingPricingTierId
    return PlanChangeService.scheduleUnifiedDowngrade({
      subscription,
      newPlan: {
        id: newPlan.id,
        name: newPlan.name,
        displayName: newPlan.displayName,
      },
      newTier,
      finalBillingCycle,
      organizationId,
    });
  }

  /**
   * Cancels a scheduled plan change (downgrade).
   * Uses transaction to prevent race conditions with job execution.
   */
  static async cancelScheduledChange(
    input: CancelScheduledChangeInput
  ): Promise<CancelScheduledChangeData> {
    const { organizationId } = input;

    // Use transaction to ensure atomicity
    const result = await db.transaction(async (tx) => {
      // 1. Read subscription inside transaction
      const [subscription] = await tx
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      if (!subscription) {
        throw new SubscriptionNotFoundError(organizationId);
      }

      // 2. Validate state
      if (!(subscription.pendingPlanId || subscription.pendingBillingCycle)) {
        throw new NoScheduledChangeError();
      }

      const canceledPlanId = subscription.pendingPlanId ?? subscription.planId;

      // 3. Clear pending fields inside transaction
      const [updated] = await tx
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingPricingTierId: null,
          planChangeAt: null,
        })
        .where(eq(schema.orgSubscriptions.id, subscription.id))
        .returning();

      return { subscription: updated, canceledPlanId };
    });

    // Emit event outside transaction
    if (result.subscription) {
      PaymentHooks.emit("planChange.canceled", {
        subscription: result.subscription,
        canceledPlanId: result.canceledPlanId,
      });
    }

    return {
      canceled: true,
    };
  }

  /**
   * Gets information about any scheduled plan change.
   */
  static async getScheduledChange(
    organizationId: string
  ): Promise<GetScheduledChangeData> {
    const result = await findSubscriptionWithPendingPlan(organizationId);

    if (!result) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const { subscription, pendingPlan } = result;

    if (!(subscription.pendingPlanId || subscription.pendingBillingCycle)) {
      return {
        hasScheduledChange: false,
      };
    }

    return {
      hasScheduledChange: true,
      change: {
        pendingPlanId: subscription.pendingPlanId ?? subscription.planId,
        pendingPlanName: pendingPlan?.displayName ?? "",
        pendingBillingCycle: subscription.pendingBillingCycle as
          | "monthly"
          | "yearly"
          | null,
        scheduledAt: subscription.planChangeAt?.toISOString() ?? "",
      },
    };
  }

  /**
   * Executes a scheduled plan change. Called by the daily job.
   * Uses transaction to prevent race conditions with user cancellation.
   */
  static async executeScheduledChange(subscriptionId: string): Promise<void> {
    // 1. First read to check if we need to cancel Pagarme subscription
    const initialResult = await findSubscriptionWithCurrentPlan(subscriptionId);

    if (!initialResult) {
      return;
    }

    const { subscription: initialSubscription, currentPlan } = initialResult;

    // Early exit if no pending change
    if (
      !(
        initialSubscription.pendingPlanId ||
        initialSubscription.pendingBillingCycle
      )
    ) {
      return;
    }

    // 2. Cancel current Pagarme subscription OUTSIDE transaction (can fail)
    if (initialSubscription.pagarmeSubscriptionId) {
      const pagarmeSubId = initialSubscription.pagarmeSubscriptionId;
      try {
        await Retry.withRetry(
          () =>
            PagarmeClient.cancelSubscription(
              pagarmeSubId,
              true,
              `cancel-sub-change-${initialSubscription.id}-${Date.now()}`
            ),
          PAGARME_RETRY_CONFIG.WRITE
        );
      } catch {
        // Log error but continue - subscription might already be canceled
      }
    }

    // 3. Execute plan change inside transaction
    const result = await db.transaction(async (tx) => {
      // Re-read subscription with current and pending plans
      const [data] = await tx
        .select({
          subscription: schema.orgSubscriptions,
          currentPlan: schema.subscriptionPlans,
        })
        .from(schema.orgSubscriptions)
        .innerJoin(
          schema.subscriptionPlans,
          eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
        )
        .where(eq(schema.orgSubscriptions.id, subscriptionId));

      if (!data) {
        return null;
      }

      const { subscription } = data;

      // Re-validate: may have been canceled by user
      if (!(subscription.pendingPlanId || subscription.pendingBillingCycle)) {
        return null;
      }

      const previousPlanId = subscription.planId;
      const previousBillingCycle = subscription.billingCycle;
      const newPlanId = subscription.pendingPlanId ?? subscription.planId;
      const newBillingCycle =
        subscription.pendingBillingCycle ?? subscription.billingCycle;
      const newPricingTierId =
        subscription.pendingPricingTierId ?? subscription.pricingTierId;

      // Validate: pricingTierId is required for employee limits to work
      if (!newPricingTierId) {
        const { logger } = await import("@/lib/logger");
        logger.error({
          type: "plan-change:execute:missing-pricing-tier",
          subscriptionId: subscription.id,
          organizationId: subscription.organizationId,
          pendingPlanId: subscription.pendingPlanId,
          pendingPricingTierId: subscription.pendingPricingTierId,
          currentPricingTierId: subscription.pricingTierId,
        });
        // Abort: executing without pricingTierId would set limit to 0
        return null;
      }

      // Validate: employee count must fit within new tier's range
      // This catches cases where employee count changed between scheduling and execution
      const [tierInfo] = await tx
        .select({
          minEmployees: schema.planPricingTiers.minEmployees,
          maxEmployees: schema.planPricingTiers.maxEmployees,
        })
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.id, newPricingTierId));

      if (tierInfo) {
        const { count } = await import("drizzle-orm");
        const [employeeCount] = await tx
          .select({ value: count() })
          .from(schema.employees)
          .where(
            and(
              eq(schema.employees.organizationId, subscription.organizationId),
              isNull(schema.employees.deletedAt)
            )
          );

        const currentEmployees = employeeCount?.value ?? 0;

        if (currentEmployees > tierInfo.maxEmployees) {
          const { logger } = await import("@/lib/logger");
          logger.warn({
            type: "plan-change:execute:employee-count-exceeds-tier",
            subscriptionId: subscription.id,
            organizationId: subscription.organizationId,
            currentEmployees,
            tierMaxEmployees: tierInfo.maxEmployees,
            newPricingTierId,
          });
          // Abort: would violate employee limit
          return null;
        }
      }

      // Get new plan name for email
      const [newPlan] = await tx
        .select({ displayName: schema.subscriptionPlans.displayName })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, newPlanId));

      if (!newPlan) {
        throw new PlanNotFoundError(newPlanId);
      }

      // Update inside transaction
      const [updated] = await tx
        .update(schema.orgSubscriptions)
        .set({
          planId: newPlanId,
          billingCycle: newBillingCycle,
          pricingTierId: newPricingTierId,
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingPricingTierId: null,
          planChangeAt: null,
          pagarmeSubscriptionId: null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: ProrationService.calculatePeriodEnd(
            new Date(),
            newBillingCycle as "monthly" | "yearly"
          ),
        })
        .where(eq(schema.orgSubscriptions.id, subscription.id))
        .returning();

      return {
        subscription: updated,
        previousPlanId,
        previousBillingCycle,
        previousPlanName: currentPlan.displayName,
        newPlanName: newPlan.displayName,
        organizationId: subscription.organizationId,
      };
    });

    // 4. Emit event and send email OUTSIDE transaction
    if (result?.subscription) {
      PaymentHooks.emit("planChange.executed", {
        subscription: result.subscription,
        previousPlanId: result.previousPlanId,
        previousBillingCycle: result.previousBillingCycle,
      });

      await PlanChangeService.sendPlanChangeEmail({
        organizationId: result.organizationId,
        previousPlanName: result.previousPlanName,
        newPlanName: result.newPlanName,
      });
    }
  }

  /**
   * Gets all subscriptions with scheduled changes due for execution.
   */
  static async getScheduledChangesForExecution(): Promise<
    Array<{ id: string; organizationId: string }>
  > {
    const now = new Date();

    const subscriptions = await db
      .select({
        id: schema.orgSubscriptions.id,
        organizationId: schema.orgSubscriptions.organizationId,
      })
      .from(schema.orgSubscriptions)
      .where(
        and(
          isNotNull(schema.orgSubscriptions.planChangeAt),
          lte(schema.orgSubscriptions.planChangeAt, now),
          eq(schema.orgSubscriptions.status, "active")
        )
      );

    return subscriptions;
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private static validateSubscriptionForChange(
    subscription: typeof schema.orgSubscriptions.$inferSelect
  ): void {
    // Only active subscriptions can change plans
    if (subscription.status !== "active") {
      throw new SubscriptionNotActiveError();
    }

    // Cannot change if already scheduled for cancellation
    if (subscription.cancelAtPeriodEnd) {
      throw new SubscriptionNotActiveError();
    }

    // Cannot change if another change is already scheduled
    if (subscription.pendingPlanId || subscription.pendingBillingCycle) {
      throw new PlanChangeInProgressError();
    }
  }

  /**
   * [2.4] Validates that current employee count fits in the new tier's limit.
   * Throws EmployeeCountExceedsNewPlanLimitError if not.
   */
  private static async validateEmployeeCountForDowngrade(
    organizationId: string,
    newMaxEmployees: number
  ): Promise<void> {
    const { current } = await LimitsService.checkEmployeeLimit(organizationId);

    if (current > newMaxEmployees) {
      throw new EmployeeCountExceedsNewPlanLimitError(current, newMaxEmployees);
    }
  }

  /**
   * [2.3] Processes a unified upgrade with proration.
   */
  private static async processUnifiedUpgrade(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    currentPlan: typeof schema.subscriptionPlans.$inferSelect;
    newPlan: {
      id: string;
      name: string;
      displayName: string;
    };
    newTier: { id: string; priceMonthly: number; priceYearly: number };
    currentPrice: number;
    newPrice: number;
    finalBillingCycle: "monthly" | "yearly";
    successUrl: string;
    organizationId: string;
  }): Promise<ChangeSubscriptionData> {
    const {
      subscription,
      newPlan,
      newTier,
      currentPrice,
      newPrice,
      finalBillingCycle,
      successUrl,
      organizationId,
    } = params;

    const prorationAmount = ProrationService.calculateProration({
      currentPlanPrice: currentPrice,
      newPlanPrice: newPrice,
      currentPeriodStart: subscription.currentPeriodStart ?? new Date(),
      currentPeriodEnd: subscription.currentPeriodEnd ?? new Date(),
    });

    // Create checkout using the existing method pattern
    const checkoutUrl = await PlanChangeService.createUnifiedUpgradeCheckout({
      subscription,
      newPlan,
      newTier,
      prorationAmount,
      finalBillingCycle,
      successUrl,
      organizationId,
    });

    return {
      changeType: "upgrade",
      immediate: false,
      checkoutUrl,
      prorationAmount: prorationAmount > 0 ? prorationAmount : undefined,
      newPlan: {
        id: newPlan.id,
        name: newPlan.name,
        displayName: newPlan.displayName,
      },
      newBillingCycle: finalBillingCycle,
      newTierId: newTier.id,
    };
  }

  /**
   * [2.5] Schedules a unified downgrade including pendingPricingTierId.
   * Uses transaction to prevent race conditions between concurrent requests.
   */
  private static async scheduleUnifiedDowngrade(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    newPlan: { id: string; name: string; displayName: string };
    newTier: { id: string; maxEmployees: number };
    finalBillingCycle: "monthly" | "yearly";
    organizationId: string;
  }): Promise<ChangeSubscriptionData> {
    const { subscription, newPlan, newTier, finalBillingCycle } = params;

    // Use transaction to ensure atomicity and prevent race conditions
    const updatedSubscription = await db.transaction(async (tx) => {
      // 1. Re-read subscription inside transaction to get current state
      const [current] = await tx
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscription.id));

      if (!current) {
        throw new SubscriptionNotFoundError(subscription.id);
      }

      // 2. Re-validate state (may have changed since initial read)
      if (current.status !== "active") {
        throw new SubscriptionNotActiveError();
      }

      if (current.cancelAtPeriodEnd) {
        throw new SubscriptionNotActiveError();
      }

      if (current.pendingPlanId || current.pendingBillingCycle) {
        throw new PlanChangeInProgressError();
      }

      // 3. Update inside transaction
      const [updated] = await tx
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: newPlan.id,
          pendingBillingCycle: finalBillingCycle,
          pendingPricingTierId: newTier.id,
          planChangeAt: current.currentPeriodEnd,
        })
        .where(eq(schema.orgSubscriptions.id, subscription.id))
        .returning();

      return updated;
    });

    // Emit event outside transaction
    if (updatedSubscription) {
      PaymentHooks.emit("planChange.scheduled", {
        subscription: updatedSubscription,
        pendingPlanId: newPlan.id,
        pendingBillingCycle: finalBillingCycle,
        scheduledAt: updatedSubscription.planChangeAt ?? new Date(),
      });
    }

    return {
      changeType: "downgrade",
      immediate: false,
      scheduledAt: updatedSubscription?.planChangeAt?.toISOString(),
      newPlan: {
        id: newPlan.id,
        name: newPlan.name,
        displayName: newPlan.displayName,
      },
      newBillingCycle: finalBillingCycle,
      newTierId: newTier.id,
    };
  }

  /**
   * Creates checkout for unified upgrade.
   * Uses transaction to ensure pending checkout is created atomically.
   */
  private static async createUnifiedUpgradeCheckout(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    newPlan: {
      id: string;
      name: string;
      displayName: string;
    };
    newTier: { id: string; priceMonthly: number; priceYearly: number };
    prorationAmount: number;
    finalBillingCycle: "monthly" | "yearly";
    successUrl: string;
    organizationId: string;
  }): Promise<string> {
    const {
      subscription,
      newPlan,
      newTier,
      prorationAmount,
      finalBillingCycle,
      successUrl,
      organizationId,
    } = params;

    // 1. Prepare Pagarme data OUTSIDE transaction
    const pagarmePlanId = await PagarmePlanService.ensurePlan(
      newTier.id,
      finalBillingCycle
    );

    const pagarmeCustomerId =
      await CustomerService.getCustomerId(organizationId);

    const paymentLinkData: CreatePaymentLinkRequest = {
      type: "subscription",
      name: `Upgrade para ${newPlan.displayName}${finalBillingCycle === "yearly" ? " (Anual)" : ""}`,
      payment_settings: {
        accepted_payment_methods: ["credit_card"],
        credit_card_settings: {
          operation_type: "auth_and_capture",
        },
      },
      cart_settings: {
        recurrences: [
          {
            start_in: 1,
            plan_id: pagarmePlanId,
          },
        ],
      },
      success_url: successUrl,
      max_paid_sessions: 1,
      metadata: {
        organization_id: organizationId,
        plan_id: newPlan.id,
        billing_cycle: finalBillingCycle,
        is_upgrade: "true",
        previous_subscription_id: subscription.id,
        proration_amount: String(prorationAmount),
      },
    };

    // Add proration as an item if amount is significant
    if (
      prorationAmount >= MIN_PRORATION_AMOUNT &&
      paymentLinkData.cart_settings
    ) {
      paymentLinkData.cart_settings.items = [
        {
          amount: prorationAmount,
          description: "Valor proporcional para upgrade do plano",
          quantity: 1,
        },
      ];
    }

    if (pagarmeCustomerId) {
      paymentLinkData.customer_settings = {
        customer_id: pagarmeCustomerId,
      };
    }

    // 2. Create payment link in Pagarme OUTSIDE transaction
    const paymentLink = await Retry.withRetry(
      () =>
        PagarmeClient.createPaymentLink(
          paymentLinkData,
          `upgrade-${organizationId}-${newPlan.id}-${finalBillingCycle}-${Date.now()}`
        ),
      PAGARME_RETRY_CONFIG.WRITE
    );

    // 3. Store pending checkout INSIDE transaction with validation
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHECKOUT_EXPIRATION_HOURS);

    await db.transaction(async (tx) => {
      // Re-validate subscription is still active
      const [current] = await tx
        .select({ status: schema.orgSubscriptions.status })
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscription.id));

      if (!current || current.status !== "active") {
        throw new SubscriptionNotActiveError();
      }

      // Insert pending checkout
      await tx.insert(schema.pendingCheckouts).values({
        id: `checkout-${crypto.randomUUID()}`,
        organizationId,
        planId: newPlan.id,
        pricingTierId: newTier.id,
        billingCycle: finalBillingCycle,
        paymentLinkId: paymentLink.id,
        status: "pending",
        expiresAt,
      });
    });

    // 4. Send email OUTSIDE transaction (can fail without impact)
    const emailData =
      await PlanChangeService.getOrganizationOwnerEmail(organizationId);

    if (emailData) {
      await sendCheckoutLinkEmail({
        to: emailData.email,
        userName: emailData.userName,
        organizationName: emailData.organizationName,
        planName: newPlan.displayName,
        checkoutUrl: paymentLink.url,
        expiresAt,
      }).catch(async (error) => {
        // Email failure should not fail checkout, but log for debugging
        const { logger } = await import("@/lib/logger");
        logger.error({
          type: "plan-change:checkout-email-failed",
          organizationId,
          email: emailData.email,
          planName: newPlan.displayName,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return paymentLink.url;
  }

  /**
   * Gets organization owner email data for notifications.
   */
  private static async getOrganizationOwnerEmail(
    organizationId: string
  ): Promise<{
    email: string;
    userName: string;
    organizationName: string;
  } | null> {
    const [emailData] = await db
      .select({
        email: schema.users.email,
        userName: schema.users.name,
        organizationName: schema.organizations.name,
      })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.members.organizationId)
      )
      .where(
        and(
          eq(schema.members.organizationId, organizationId),
          eq(schema.members.role, "owner")
        )
      )
      .limit(1);

    return emailData ?? null;
  }

  private static async sendPlanChangeEmail(params: {
    organizationId: string;
    previousPlanName: string;
    newPlanName: string;
  }): Promise<void> {
    const { organizationId, previousPlanName, newPlanName } = params;

    const emailData =
      await PlanChangeService.getOrganizationOwnerEmail(organizationId);

    if (emailData) {
      await sendPlanChangeExecutedEmail({
        to: emailData.email,
        organizationName: emailData.organizationName,
        previousPlanName,
        newPlanName,
      });
    }
  }
}
