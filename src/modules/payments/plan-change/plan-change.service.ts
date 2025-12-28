import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import { CustomerService } from "@/modules/payments/customer/customer.service";
import {
  EmployeeCountExceedsNewPlanLimitError,
  NoChangeRequestedError,
  NoScheduledChangeError,
  PlanChangeInProgressError,
  PlanNotFoundError,
  SameBillingCycleError,
  SamePlanError,
  SubscriptionNotActiveError,
  SubscriptionNotFoundError,
  YearlyBillingNotAvailableError,
} from "@/modules/payments/errors";
import { PaymentHooks } from "@/modules/payments/hooks";
import { LimitsService } from "@/modules/payments/limits/limits.service";
import { PagarmeClient } from "@/modules/payments/pagarme/client";
import type { CreatePaymentLinkRequest } from "@/modules/payments/pagarme/pagarme.types";
import { PlanService } from "@/modules/payments/plan/plan.service";
import { PricingTierService } from "@/modules/payments/pricing/pricing.service";
import type {
  CalculateProrationInput,
  CancelScheduledChangeData,
  CancelScheduledChangeInput,
  ChangeBillingCycleData,
  ChangeBillingCycleInput,
  ChangePlanData,
  ChangePlanInput,
  ChangeSubscriptionData,
  ChangeSubscriptionInput,
  ChangeType,
  GetChangeTypeInput,
  GetScheduledChangeData,
} from "./plan-change.model";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_PRORATION_AMOUNT = 100; // R$ 1.00 - minimum Pagarme charge
const CHECKOUT_EXPIRATION_HOURS = 24;

export abstract class PlanChangeService {
  /**
   * Determines whether a plan change is an upgrade or downgrade
   * based on price and billing cycle comparison.
   *
   * Priority:
   * 1. Billing cycle change takes precedence (commitment-based)
   *    - monthly→yearly = upgrade (more commitment)
   *    - yearly→monthly = downgrade (less commitment)
   * 2. Same billing cycle: compare normalized monthly prices
   */
  static getChangeType(input: GetChangeTypeInput): ChangeType {
    const {
      currentPlanPrice,
      newPlanPrice,
      currentBillingCycle,
      newBillingCycle,
    } = input;

    // Billing cycle change takes precedence (commitment-based logic)
    if (currentBillingCycle === "monthly" && newBillingCycle === "yearly") {
      return "upgrade";
    }

    if (currentBillingCycle === "yearly" && newBillingCycle === "monthly") {
      return "downgrade";
    }

    // Same billing cycle - compare prices directly
    // (no need to normalize since cycle is the same)
    if (newPlanPrice > currentPlanPrice) {
      return "upgrade";
    }

    if (newPlanPrice < currentPlanPrice) {
      return "downgrade";
    }

    return "upgrade"; // Default to upgrade for same price/cycle
  }

  /**
   * Calculates the proration amount for an upgrade.
   * Returns the proportional price difference based on remaining days in period.
   */
  static calculateProration(input: CalculateProrationInput): number {
    const {
      currentPlanPrice,
      newPlanPrice,
      currentPeriodStart,
      currentPeriodEnd,
    } = input;

    const priceDifference = newPlanPrice - currentPlanPrice;

    // No proration for downgrades or same price
    if (priceDifference <= 0) {
      return 0;
    }

    const now = new Date();
    const periodStartTime = currentPeriodStart.getTime();
    const periodEndTime = currentPeriodEnd.getTime();
    const nowTime = now.getTime();

    // Calculate total and remaining days
    const totalDays = (periodEndTime - periodStartTime) / MS_PER_DAY;
    const remainingDays = Math.max(0, (periodEndTime - nowTime) / MS_PER_DAY);

    // Calculate proportional amount
    const proration = Math.round(priceDifference * (remainingDays / totalDays));

    return proration;
  }

  /**
   * [2.3] Unified method to change subscription.
   * Accepts any combination of: newPlanId, newBillingCycle, newEmployeeCount.
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
      newEmployeeCount,
      successUrl,
    } = input;

    // 1. Get current subscription with plan and tier
    const [result] = await db
      .select({
        subscription: schema.orgSubscriptions,
        plan: schema.subscriptionPlans,
        tier: schema.planPricingTiers,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .leftJoin(
        schema.planPricingTiers,
        eq(schema.orgSubscriptions.pricingTierId, schema.planPricingTiers.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

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
    const currentEmployeeCount =
      subscription.employeeCount ?? currentTier?.maxEmployees ?? 10;

    const finalPlanId = newPlanId ?? subscription.planId;
    const finalBillingCycle = newBillingCycle ?? currentBillingCycle;
    const finalEmployeeCount = newEmployeeCount ?? currentEmployeeCount;

    // 4. Validate "no change" scenario
    if (
      finalPlanId === subscription.planId &&
      finalBillingCycle === currentBillingCycle &&
      finalEmployeeCount === currentEmployeeCount
    ) {
      throw new NoChangeRequestedError();
    }

    // 5. Get new plan (if changing)
    const newPlan =
      finalPlanId !== subscription.planId
        ? await PlanService.ensureSynced(finalPlanId)
        : currentPlan;

    // 6. Get new tier for employee count
    const { tier: newTier } = await PricingTierService.getTierForEmployeeCount(
      finalPlanId,
      finalEmployeeCount
    );

    // 7. Validate yearly billing availability
    if (finalBillingCycle === "yearly" && newTier.priceYearly === 0) {
      throw new YearlyBillingNotAvailableError(finalPlanId);
    }

    // 8. Calculate prices
    const currentPrice = await PlanChangeService.getCurrentPrice({
      currentTier,
      currentPlan,
      currentBillingCycle,
      planId: subscription.planId,
      employeeCount: currentEmployeeCount,
    });
    const newPrice =
      finalBillingCycle === "yearly"
        ? newTier.priceYearly
        : newTier.priceMonthly;

    // 9. Determine change type
    const changeType = PlanChangeService.getChangeType({
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
          pagarmePlanIdMonthly: newPlan.pagarmePlanIdMonthly,
          pagarmePlanIdYearly: newPlan.pagarmePlanIdYearly,
        },
        newTier,
        currentPrice,
        newPrice,
        finalBillingCycle,
        finalEmployeeCount,
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
      finalEmployeeCount,
      organizationId,
    });
  }

  /**
   * Changes the subscription to a different plan.
   * Upgrades are charged immediately via Payment Link.
   * Downgrades are scheduled for the end of the current period.
   */
  static async changePlan(input: ChangePlanInput): Promise<ChangePlanData> {
    const { organizationId, newPlanId, successUrl } = input;

    // Get current subscription with plan
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

    const { subscription, plan: currentPlan } = result;

    // Validate subscription state
    PlanChangeService.validateSubscriptionForChange(subscription);

    // Cannot change to the same plan
    if (subscription.planId === newPlanId) {
      throw new SamePlanError();
    }

    // Get new plan
    const newPlan = await PlanService.ensureSynced(newPlanId);

    const currentBillingCycle = (subscription.billingCycle ?? "monthly") as
      | "monthly"
      | "yearly";
    const currentPrice =
      currentBillingCycle === "yearly"
        ? currentPlan.priceYearly
        : currentPlan.priceMonthly;
    const newPrice =
      currentBillingCycle === "yearly"
        ? newPlan.priceYearly
        : newPlan.priceMonthly;

    // Check if yearly pricing is available for new plan
    if (currentBillingCycle === "yearly" && newPlan.priceYearly === 0) {
      throw new YearlyBillingNotAvailableError(newPlanId);
    }

    const changeType = PlanChangeService.getChangeType({
      currentPlanPrice: currentPrice,
      newPlanPrice: newPrice,
      currentBillingCycle,
      newBillingCycle: currentBillingCycle,
    });

    if (changeType === "upgrade") {
      return PlanChangeService.processUpgrade({
        subscription,
        currentPlan,
        newPlan,
        currentPrice,
        newPrice,
        billingCycle: currentBillingCycle,
        successUrl,
        organizationId,
      });
    }

    return PlanChangeService.scheduleDowngrade({
      subscription,
      newPlan,
      billingCycle: currentBillingCycle,
      organizationId,
    });
  }

  /**
   * Changes the billing cycle (monthly <-> yearly) for the current plan.
   */
  static async changeBillingCycle(
    input: ChangeBillingCycleInput
  ): Promise<ChangeBillingCycleData> {
    const { organizationId, newBillingCycle, successUrl } = input;

    // Get current subscription with plan
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

    // Validate subscription state
    PlanChangeService.validateSubscriptionForChange(subscription);

    const currentBillingCycle = (subscription.billingCycle ?? "monthly") as
      | "monthly"
      | "yearly";

    // Cannot change to the same billing cycle
    if (currentBillingCycle === newBillingCycle) {
      throw new SameBillingCycleError();
    }

    // Check if yearly pricing is available
    if (newBillingCycle === "yearly" && plan.priceYearly === 0) {
      throw new YearlyBillingNotAvailableError(plan.id);
    }

    const currentPrice =
      currentBillingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
    const newPrice =
      newBillingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;

    const changeType = PlanChangeService.getChangeType({
      currentPlanPrice: currentPrice,
      newPlanPrice: newPrice,
      currentBillingCycle,
      newBillingCycle,
    });

    if (changeType === "upgrade") {
      // Monthly to Yearly - upgrade with proration
      const prorationAmount = PlanChangeService.calculateProration({
        currentPlanPrice: currentPrice,
        newPlanPrice: newPrice,
        currentPeriodStart: subscription.currentPeriodStart ?? new Date(),
        currentPeriodEnd: subscription.currentPeriodEnd ?? new Date(),
      });

      const checkoutUrl =
        await PlanChangeService.createBillingCycleUpgradeCheckout({
          subscription,
          plan,
          newBillingCycle,
          prorationAmount,
          successUrl,
          organizationId,
        });

      return {
        changeType: "upgrade",
        immediate: false,
        checkoutUrl,
        prorationAmount: prorationAmount > 0 ? prorationAmount : undefined,
        newBillingCycle,
      };
    }

    // Yearly to Monthly - schedule for period end
    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: plan.id,
        pendingBillingCycle: newBillingCycle,
        planChangeAt: subscription.currentPeriodEnd,
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    const [updatedSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    if (updatedSubscription) {
      PaymentHooks.emit("planChange.scheduled", {
        subscription: updatedSubscription,
        pendingPlanId: plan.id,
        pendingBillingCycle: newBillingCycle,
        scheduledAt: subscription.currentPeriodEnd ?? new Date(),
      });
    }

    return {
      changeType: "downgrade",
      immediate: false,
      scheduledAt: subscription.currentPeriodEnd?.toISOString(),
      newBillingCycle,
    };
  }

  /**
   * Cancels a scheduled plan change (downgrade).
   */
  static async cancelScheduledChange(
    input: CancelScheduledChangeInput
  ): Promise<CancelScheduledChangeData> {
    const { organizationId } = input;

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    if (!(subscription.pendingPlanId || subscription.pendingBillingCycle)) {
      throw new NoScheduledChangeError();
    }

    const canceledPlanId = subscription.pendingPlanId ?? subscription.planId;

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: null,
        pendingBillingCycle: null,
        planChangeAt: null,
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    const [updatedSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    if (updatedSubscription) {
      PaymentHooks.emit("planChange.canceled", {
        subscription: updatedSubscription,
        canceledPlanId,
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
    const [result] = await db
      .select({
        subscription: schema.orgSubscriptions,
        pendingPlan: schema.subscriptionPlans,
      })
      .from(schema.orgSubscriptions)
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.pendingPlanId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

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
   */
  static async executeScheduledChange(subscriptionId: string): Promise<void> {
    const [result] = await db
      .select({
        subscription: schema.orgSubscriptions,
        currentPlan: schema.subscriptionPlans,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    if (!result) {
      return;
    }

    const { subscription, currentPlan } = result;

    if (!(subscription.pendingPlanId || subscription.pendingBillingCycle)) {
      return;
    }

    const previousPlanId = subscription.planId;
    const previousBillingCycle = subscription.billingCycle;
    const newPlanId = subscription.pendingPlanId ?? subscription.planId;
    const newBillingCycle =
      subscription.pendingBillingCycle ?? subscription.billingCycle;

    // Cancel current Pagarme subscription if exists
    if (subscription.pagarmeSubscriptionId) {
      const pagarmeSubId = subscription.pagarmeSubscriptionId;
      try {
        await Retry.withRetry(
          () =>
            PagarmeClient.cancelSubscription(
              pagarmeSubId,
              true,
              `cancel-sub-change-${subscription.id}-${Date.now()}`
            ),
          { maxAttempts: 2, delayMs: 1000 }
        );
      } catch {
        // Log error but continue - subscription might already be canceled
      }
    }

    // Get the new plan for pricing
    const [newPlan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, newPlanId))
      .limit(1);

    if (!newPlan) {
      throw new PlanNotFoundError(newPlanId);
    }

    // [2.5] Get the new pricing tier ID and employee count
    const newPricingTierId =
      subscription.pendingPricingTierId ?? subscription.pricingTierId;
    let newEmployeeCount = subscription.employeeCount;

    // If there's a pending tier, get its maxEmployees
    if (subscription.pendingPricingTierId) {
      const [newTier] = await db
        .select()
        .from(schema.planPricingTiers)
        .where(
          eq(schema.planPricingTiers.id, subscription.pendingPricingTierId)
        )
        .limit(1);
      if (newTier) {
        newEmployeeCount = newTier.maxEmployees;
      }
    }

    // Update local subscription
    await db
      .update(schema.orgSubscriptions)
      .set({
        planId: newPlanId,
        billingCycle: newBillingCycle,
        pricingTierId: newPricingTierId, // [2.5] Apply new tier
        employeeCount: newEmployeeCount, // [2.5] Update employee limit
        pendingPlanId: null,
        pendingBillingCycle: null,
        pendingPricingTierId: null, // [2.5] Clear pending tier
        planChangeAt: null,
        pagarmeSubscriptionId: null, // Will be updated when new subscription is created
        currentPeriodStart: new Date(),
        currentPeriodEnd: PlanChangeService.calculatePeriodEnd(
          new Date(),
          newBillingCycle as "monthly" | "yearly"
        ),
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    const [updatedSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    if (updatedSubscription) {
      PaymentHooks.emit("planChange.executed", {
        subscription: updatedSubscription,
        previousPlanId,
        previousBillingCycle,
      });
    }

    // Send notification email
    await PlanChangeService.sendPlanChangeEmail({
      subscriptionId: subscription.id,
      organizationId: subscription.organizationId,
      previousPlanName: currentPlan.displayName,
      newPlanName: newPlan.displayName,
    });
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
   * Calculates the current price based on tier or plan.
   * If no tier is set, looks up the appropriate tier for the plan/employee count.
   */
  private static async getCurrentPrice(params: {
    currentTier: { priceMonthly: number; priceYearly: number } | null;
    currentPlan: { priceMonthly: number; priceYearly: number };
    currentBillingCycle: "monthly" | "yearly";
    planId: string;
    employeeCount: number;
  }): Promise<number> {
    const {
      currentTier,
      currentPlan,
      currentBillingCycle,
      planId,
      employeeCount,
    } = params;

    let priceMonthly = currentTier?.priceMonthly;
    let priceYearly = currentTier?.priceYearly;

    if (priceMonthly === undefined) {
      const tierResult = await PricingTierService.getTierForEmployeeCount(
        planId,
        employeeCount
      );
      priceMonthly = tierResult.tier.priceMonthly;
      priceYearly = tierResult.tier.priceYearly;
    }

    return currentBillingCycle === "yearly"
      ? (priceYearly ?? currentPlan.priceYearly)
      : (priceMonthly ?? currentPlan.priceMonthly);
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
      pagarmePlanIdMonthly: string | null;
      pagarmePlanIdYearly: string | null;
    };
    newTier: { id: string; priceMonthly: number; priceYearly: number };
    currentPrice: number;
    newPrice: number;
    finalBillingCycle: "monthly" | "yearly";
    finalEmployeeCount: number;
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
      finalEmployeeCount,
      successUrl,
      organizationId,
    } = params;

    const prorationAmount = PlanChangeService.calculateProration({
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
      finalEmployeeCount,
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
      newEmployeeCount: finalEmployeeCount,
    };
  }

  /**
   * [2.5] Schedules a unified downgrade including pendingPricingTierId.
   */
  private static async scheduleUnifiedDowngrade(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    newPlan: { id: string; name: string; displayName: string };
    newTier: { id: string; maxEmployees: number };
    finalBillingCycle: "monthly" | "yearly";
    finalEmployeeCount: number;
    organizationId: string;
  }): Promise<ChangeSubscriptionData> {
    const {
      subscription,
      newPlan,
      newTier,
      finalBillingCycle,
      finalEmployeeCount,
    } = params;

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: newPlan.id,
        pendingBillingCycle: finalBillingCycle,
        pendingPricingTierId: newTier.id, // [2.5] Save pending tier
        planChangeAt: subscription.currentPeriodEnd,
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    const [updatedSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    if (updatedSubscription) {
      PaymentHooks.emit("planChange.scheduled", {
        subscription: updatedSubscription,
        pendingPlanId: newPlan.id,
        pendingBillingCycle: finalBillingCycle,
        scheduledAt: subscription.currentPeriodEnd ?? new Date(),
      });
    }

    return {
      changeType: "downgrade",
      immediate: false,
      scheduledAt: subscription.currentPeriodEnd?.toISOString(),
      newPlan: {
        id: newPlan.id,
        name: newPlan.name,
        displayName: newPlan.displayName,
      },
      newBillingCycle: finalBillingCycle,
      newEmployeeCount: finalEmployeeCount,
    };
  }

  /**
   * Creates checkout for unified upgrade.
   */
  private static async createUnifiedUpgradeCheckout(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    newPlan: {
      id: string;
      name: string;
      displayName: string;
      pagarmePlanIdMonthly: string | null;
      pagarmePlanIdYearly: string | null;
    };
    newTier: { id: string; priceMonthly: number; priceYearly: number };
    prorationAmount: number;
    finalBillingCycle: "monthly" | "yearly";
    finalEmployeeCount: number;
    successUrl: string;
    organizationId: string;
  }): Promise<string> {
    const {
      subscription,
      newPlan,
      prorationAmount,
      finalBillingCycle,
      successUrl,
      organizationId,
    } = params;

    const pagarmePlanId =
      finalBillingCycle === "yearly"
        ? newPlan.pagarmePlanIdYearly
        : newPlan.pagarmePlanIdMonthly;

    if (!pagarmePlanId) {
      throw new YearlyBillingNotAvailableError(newPlan.id);
    }

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

    const paymentLink = await Retry.withRetry(
      () =>
        PagarmeClient.createPaymentLink(
          paymentLinkData,
          `upgrade-${organizationId}-${newPlan.id}-${finalBillingCycle}-${Date.now()}`
        ),
      { maxAttempts: 3, delayMs: 1000 }
    );

    // Store pending checkout
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHECKOUT_EXPIRATION_HOURS);

    await db.insert(schema.pendingCheckouts).values({
      id: `checkout-${crypto.randomUUID()}`,
      organizationId,
      planId: newPlan.id,
      billingCycle: finalBillingCycle,
      paymentLinkId: paymentLink.id,
      status: "pending",
      expiresAt,
    });

    return paymentLink.url;
  }

  private static async processUpgrade(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    currentPlan: typeof schema.subscriptionPlans.$inferSelect;
    newPlan: Awaited<ReturnType<typeof PlanService.ensureSynced>>;
    currentPrice: number;
    newPrice: number;
    billingCycle: "monthly" | "yearly";
    successUrl: string;
    organizationId: string;
  }): Promise<ChangePlanData> {
    const {
      subscription,
      newPlan,
      currentPrice,
      newPrice,
      billingCycle,
      successUrl,
      organizationId,
    } = params;

    const prorationAmount = PlanChangeService.calculateProration({
      currentPlanPrice: currentPrice,
      newPlanPrice: newPrice,
      currentPeriodStart: subscription.currentPeriodStart ?? new Date(),
      currentPeriodEnd: subscription.currentPeriodEnd ?? new Date(),
    });

    const checkoutUrl = await PlanChangeService.createUpgradeCheckout({
      subscription,
      newPlan,
      prorationAmount,
      billingCycle,
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
    };
  }

  private static async scheduleDowngrade(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    newPlan: Awaited<ReturnType<typeof PlanService.ensureSynced>>;
    billingCycle: "monthly" | "yearly";
    organizationId: string;
  }): Promise<ChangePlanData> {
    const { subscription, newPlan, billingCycle } = params;

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: newPlan.id,
        pendingBillingCycle: billingCycle,
        planChangeAt: subscription.currentPeriodEnd,
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    const [updatedSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    if (updatedSubscription) {
      PaymentHooks.emit("planChange.scheduled", {
        subscription: updatedSubscription,
        pendingPlanId: newPlan.id,
        pendingBillingCycle: billingCycle,
        scheduledAt: subscription.currentPeriodEnd ?? new Date(),
      });
    }

    return {
      changeType: "downgrade",
      immediate: false,
      scheduledAt: subscription.currentPeriodEnd?.toISOString(),
      newPlan: {
        id: newPlan.id,
        name: newPlan.name,
        displayName: newPlan.displayName,
      },
    };
  }

  private static async createUpgradeCheckout(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    newPlan: Awaited<ReturnType<typeof PlanService.ensureSynced>>;
    prorationAmount: number;
    billingCycle: "monthly" | "yearly";
    successUrl: string;
    organizationId: string;
  }): Promise<string> {
    const {
      subscription,
      newPlan,
      prorationAmount,
      billingCycle,
      successUrl,
      organizationId,
    } = params;

    const pagarmePlanId =
      billingCycle === "yearly"
        ? newPlan.pagarmePlanIdYearly
        : newPlan.pagarmePlanIdMonthly;

    if (!pagarmePlanId) {
      throw new YearlyBillingNotAvailableError(newPlan.id);
    }

    const pagarmeCustomerId =
      await CustomerService.getCustomerId(organizationId);

    const paymentLinkData: CreatePaymentLinkRequest = {
      type: "subscription",
      name: `Upgrade para ${newPlan.displayName}${billingCycle === "yearly" ? " (Anual)" : ""}`,
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
        billing_cycle: billingCycle,
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

    const paymentLink = await Retry.withRetry(
      () =>
        PagarmeClient.createPaymentLink(
          paymentLinkData,
          `upgrade-${organizationId}-${newPlan.id}-${billingCycle}-${Date.now()}`
        ),
      { maxAttempts: 3, delayMs: 1000 }
    );

    // Store pending checkout
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHECKOUT_EXPIRATION_HOURS);

    await db.insert(schema.pendingCheckouts).values({
      id: `checkout-${crypto.randomUUID()}`,
      organizationId,
      planId: newPlan.id,
      billingCycle,
      paymentLinkId: paymentLink.id,
      status: "pending",
      expiresAt,
    });

    // Send checkout link email to organization owner
    const [emailData] = await db
      .select({
        userEmail: schema.users.email,
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

    if (emailData) {
      const { sendCheckoutLinkEmail } = await import("@/lib/email");
      await sendCheckoutLinkEmail({
        to: emailData.userEmail,
        userName: emailData.userName,
        organizationName: emailData.organizationName,
        planName: newPlan.displayName,
        checkoutUrl: paymentLink.url,
        expiresAt,
      }).catch(() => {
        // Email failure should not fail checkout
      });
    }

    return paymentLink.url;
  }

  private static async createBillingCycleUpgradeCheckout(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    plan: typeof schema.subscriptionPlans.$inferSelect;
    newBillingCycle: "monthly" | "yearly";
    prorationAmount: number;
    successUrl: string;
    organizationId: string;
  }): Promise<string> {
    const {
      subscription,
      plan,
      newBillingCycle,
      prorationAmount,
      successUrl,
      organizationId,
    } = params;

    const pagarmePlanId =
      newBillingCycle === "yearly"
        ? plan.pagarmePlanIdYearly
        : plan.pagarmePlanIdMonthly;

    if (!pagarmePlanId) {
      throw new YearlyBillingNotAvailableError(plan.id);
    }

    const pagarmeCustomerId =
      await CustomerService.getCustomerId(organizationId);

    const paymentLinkData: CreatePaymentLinkRequest = {
      type: "subscription",
      name: `${plan.displayName} - Mudança para ${newBillingCycle === "yearly" ? "Anual" : "Mensal"}`,
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
        plan_id: plan.id,
        billing_cycle: newBillingCycle,
        is_billing_cycle_change: "true",
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
          description: "Valor proporcional para mudança de ciclo de cobrança",
          quantity: 1,
        },
      ];
    }

    if (pagarmeCustomerId) {
      paymentLinkData.customer_settings = {
        customer_id: pagarmeCustomerId,
      };
    }

    const paymentLink = await Retry.withRetry(
      () =>
        PagarmeClient.createPaymentLink(
          paymentLinkData,
          `billing-cycle-${organizationId}-${plan.id}-${newBillingCycle}-${Date.now()}`
        ),
      { maxAttempts: 3, delayMs: 1000 }
    );

    // Store pending checkout
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHECKOUT_EXPIRATION_HOURS);

    await db.insert(schema.pendingCheckouts).values({
      id: `checkout-${crypto.randomUUID()}`,
      organizationId,
      planId: plan.id,
      billingCycle: newBillingCycle,
      paymentLinkId: paymentLink.id,
      status: "pending",
      expiresAt,
    });

    // Send checkout link email to organization owner
    const [emailData] = await db
      .select({
        userEmail: schema.users.email,
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

    if (emailData) {
      const { sendCheckoutLinkEmail } = await import("@/lib/email");
      await sendCheckoutLinkEmail({
        to: emailData.userEmail,
        userName: emailData.userName,
        organizationName: emailData.organizationName,
        planName: plan.displayName,
        checkoutUrl: paymentLink.url,
        expiresAt,
      }).catch(() => {
        // Email failure should not fail checkout
      });
    }

    return paymentLink.url;
  }

  private static calculatePeriodEnd(
    startDate: Date,
    billingCycle: "monthly" | "yearly"
  ): Date {
    const endDate = new Date(startDate);

    if (billingCycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    return endDate;
  }

  private static async sendPlanChangeEmail(params: {
    subscriptionId: string;
    organizationId: string;
    previousPlanName: string;
    newPlanName: string;
  }): Promise<void> {
    const { organizationId, previousPlanName, newPlanName } = params;

    // Get organization owner email
    const [emailData] = await db
      .select({
        userEmail: schema.users.email,
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

    if (emailData) {
      const { sendPlanChangeExecutedEmail } = await import("@/lib/email");
      await sendPlanChangeExecutedEmail({
        to: emailData.userEmail,
        organizationName: emailData.organizationName,
        previousPlanName,
        newPlanName,
      });
    }
  }
}
