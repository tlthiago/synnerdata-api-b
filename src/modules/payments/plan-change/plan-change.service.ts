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
  CannotChangeToPrivatePlanError,
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

    // 3. Resolve final values (use current as defaults)
    const resolved = PlanChangeService.resolveFinalValues(subscription, {
      newPlanId,
      newBillingCycle,
      newTierId,
    });

    // 4. Validate a change is being requested
    PlanChangeService.validateChangeRequested(subscription, resolved);

    // 5. Get new plan and tier
    const newPlan =
      resolved.finalPlanId !== subscription.planId
        ? await PlansService.getAvailableById(resolved.finalPlanId)
        : currentPlan;

    // Block self-service change to private (custom) plans
    if (!newPlan.isPublic) {
      throw new CannotChangeToPrivatePlanError(newPlan.id);
    }

    if (!resolved.finalTierId) {
      throw new SubscriptionNotFoundError(organizationId);
    }
    const newTier = await PlansService.getTierById(resolved.finalTierId);

    // 6. Validate yearly billing availability
    if (resolved.finalBillingCycle === "yearly" && newTier.priceYearly === 0) {
      throw new YearlyBillingNotAvailableError(resolved.finalPlanId);
    }

    // 7. Calculate prices and determine change type
    const { currentPrice, newPrice } = PlanChangeService.calculatePrices(
      currentTier,
      newTier,
      resolved.currentBillingCycle,
      resolved.finalBillingCycle
    );

    const changeType = ProrationService.getChangeType({
      currentPlanPrice: currentPrice,
      newPlanPrice: newPrice,
      currentBillingCycle: resolved.currentBillingCycle,
      newBillingCycle: resolved.finalBillingCycle,
    });

    // 8. If downgrade, validate employee count fits in new tier
    if (changeType === "downgrade") {
      await PlanChangeService.validateEmployeeCountForDowngrade(
        organizationId,
        newTier.maxEmployees
      );
    }

    // 9. Process upgrade or schedule downgrade
    const planData = {
      id: newPlan.id,
      name: newPlan.name,
      displayName: newPlan.displayName,
    };

    if (changeType === "upgrade") {
      return PlanChangeService.processUnifiedUpgrade({
        subscription,
        currentPlan,
        newPlan: planData,
        newTier,
        currentPrice,
        newPrice,
        finalBillingCycle: resolved.finalBillingCycle,
        successUrl,
        organizationId,
      });
    }

    return PlanChangeService.scheduleUnifiedDowngrade({
      subscription,
      newPlan: planData,
      newTier,
      finalBillingCycle: resolved.finalBillingCycle,
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
   * Creates a new Pagar.me subscription for the downgraded plan.
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

    // 2. Fetch card info from old subscription before canceling
    let oldSubscriptionCardId: string | null = null;
    if (initialSubscription.pagarmeSubscriptionId) {
      oldSubscriptionCardId = await PlanChangeService.fetchCardFromSubscription(
        initialSubscription.pagarmeSubscriptionId
      );
    }

    // 3. Cancel current Pagarme subscription OUTSIDE transaction (can fail)
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

    // 4. Create new Pagarme subscription for the downgraded plan
    const newPagarmeSubscriptionId =
      await PlanChangeService.createDowngradeSubscription({
        subscription: initialSubscription,
        cardId: oldSubscriptionCardId,
      });

    // 5. Execute plan change inside transaction
    const result = await db.transaction(async (tx) => {
      const transactionResult =
        await PlanChangeService.executeScheduledChangeTransaction(
          tx,
          subscriptionId,
          currentPlan.displayName,
          newPagarmeSubscriptionId
        );
      return transactionResult;
    });

    // 6. Emit event and send email OUTSIDE transaction
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

  /**
   * Previews a subscription change without executing any side effects.
   * Returns all information needed for the frontend confirmation modal.
   */
  static async previewChange(input: {
    organizationId: string;
    newPlanId?: string;
    newBillingCycle?: "monthly" | "yearly";
    newTierId?: string;
  }): Promise<{
    changeType: "upgrade" | "downgrade";
    immediate: boolean;
    currentPlan: {
      id: string;
      displayName: string;
      billingCycle: "monthly" | "yearly";
    };
    currentTier: {
      id: string;
      minEmployees: number;
      maxEmployees: number;
      priceMonthly: number;
      priceYearly: number;
    };
    newPlan: {
      id: string;
      displayName: string;
      billingCycle: "monthly" | "yearly";
    };
    newTier: {
      id: string;
      minEmployees: number;
      maxEmployees: number;
      priceMonthly: number;
      priceYearly: number;
    };
    prorationAmount?: number;
    daysRemaining?: number;
    scheduledAt?: string;
    featuresGained: string[];
    featuresLost: string[];
  }> {
    const { organizationId, newPlanId, newBillingCycle, newTierId } = input;

    // 1. Get and validate current subscription
    const { subscription, currentPlan, currentTier, resolved } =
      await PlanChangeService.getAndValidateSubscriptionForPreview(
        organizationId,
        { newPlanId, newBillingCycle, newTierId }
      );

    // 2. Get new plan and tier
    const { newPlan, newTier } =
      await PlanChangeService.getNewPlanAndTierForPreview(
        subscription,
        currentPlan,
        resolved
      );

    // 3. Calculate change type and validate
    const { changeType, currentPrice, newPrice } =
      await PlanChangeService.calculateChangeTypeForPreview(
        organizationId,
        currentTier,
        newTier,
        resolved
      );

    // 4. Build and return preview response
    return PlanChangeService.buildPreviewResponse({
      subscription,
      currentPlan,
      currentTier,
      newPlan,
      newTier,
      resolved,
      changeType,
      currentPrice,
      newPrice,
    });
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  /**
   * Gets and validates subscription for preview.
   */
  private static async getAndValidateSubscriptionForPreview(
    organizationId: string,
    input: {
      newPlanId?: string;
      newBillingCycle?: "monthly" | "yearly";
      newTierId?: string;
    }
  ) {
    const result = await findSubscriptionWithPlanAndTier(organizationId);
    if (!result) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const { subscription, plan: currentPlan, tier: currentTier } = result;

    PlanChangeService.validateSubscriptionForChange(subscription);

    const resolved = PlanChangeService.resolveFinalValues(subscription, input);

    PlanChangeService.validateChangeRequested(subscription, resolved);

    return { subscription, currentPlan, currentTier, resolved };
  }

  /**
   * Gets new plan and tier for preview.
   */
  private static async getNewPlanAndTierForPreview(
    subscription: typeof schema.orgSubscriptions.$inferSelect,
    currentPlan: typeof schema.subscriptionPlans.$inferSelect,
    resolved: {
      finalPlanId: string;
      finalBillingCycle: "monthly" | "yearly";
      finalTierId: string | null;
    }
  ) {
    const newPlan =
      resolved.finalPlanId !== subscription.planId
        ? await PlansService.getAvailableById(resolved.finalPlanId)
        : currentPlan;

    if (!newPlan.isPublic) {
      throw new CannotChangeToPrivatePlanError(newPlan.id);
    }

    if (!resolved.finalTierId) {
      throw new SubscriptionNotFoundError(subscription.organizationId);
    }
    const newTier = await PlansService.getTierById(resolved.finalTierId);

    if (resolved.finalBillingCycle === "yearly" && newTier.priceYearly === 0) {
      throw new YearlyBillingNotAvailableError(resolved.finalPlanId);
    }

    return { newPlan, newTier };
  }

  /**
   * Calculates change type for preview and validates employee count for downgrades.
   */
  private static async calculateChangeTypeForPreview(
    organizationId: string,
    currentTier: { priceMonthly: number; priceYearly: number } | null,
    newTier: {
      priceMonthly: number;
      priceYearly: number;
      maxEmployees: number;
    },
    resolved: {
      currentBillingCycle: "monthly" | "yearly";
      finalBillingCycle: "monthly" | "yearly";
    }
  ) {
    const { currentPrice, newPrice } = PlanChangeService.calculatePrices(
      currentTier,
      newTier,
      resolved.currentBillingCycle,
      resolved.finalBillingCycle
    );

    const changeType = ProrationService.getChangeType({
      currentPlanPrice: currentPrice,
      newPlanPrice: newPrice,
      currentBillingCycle: resolved.currentBillingCycle,
      newBillingCycle: resolved.finalBillingCycle,
    });

    if (changeType === "downgrade") {
      await PlanChangeService.validateEmployeeCountForDowngrade(
        organizationId,
        newTier.maxEmployees
      );
    }

    return { changeType, currentPrice, newPrice };
  }

  /**
   * Builds preview response object.
   */
  private static async buildPreviewResponse(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    currentPlan: {
      id: string;
      displayName: string;
    };
    currentTier: {
      id: string;
      minEmployees: number;
      maxEmployees: number;
      priceMonthly: number;
      priceYearly: number;
    } | null;
    newPlan: {
      id: string;
      displayName: string;
    };
    newTier: {
      id: string;
      minEmployees: number;
      maxEmployees: number;
      priceMonthly: number;
      priceYearly: number;
    };
    resolved: {
      currentBillingCycle: "monthly" | "yearly";
      finalBillingCycle: "monthly" | "yearly";
    };
    changeType: "upgrade" | "downgrade";
    currentPrice: number;
    newPrice: number;
  }) {
    const {
      subscription,
      currentPlan,
      currentTier,
      newPlan,
      newTier,
      resolved,
      changeType,
      currentPrice,
      newPrice,
    } = params;

    let prorationAmount: number | undefined;
    let daysRemaining: number | undefined;

    if (changeType === "upgrade") {
      const calculatedProration = ProrationService.calculateProration({
        currentPlanPrice: currentPrice,
        newPlanPrice: newPrice,
        currentPeriodStart: subscription.currentPeriodStart ?? new Date(),
        currentPeriodEnd: subscription.currentPeriodEnd ?? new Date(),
      });

      if (calculatedProration > 0) {
        prorationAmount = calculatedProration;
      }

      const now = new Date();
      const periodEnd = subscription.currentPeriodEnd ?? new Date();
      daysRemaining = Math.max(
        0,
        Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    const scheduledAt =
      changeType === "downgrade"
        ? subscription.currentPeriodEnd?.toISOString()
        : undefined;

    const { compareFeatures } = await import(
      "@/modules/payments/plans/plans.constants"
    );

    // Query features from plan_features table
    const [currentFeatureRows, newFeatureRows] = await Promise.all([
      db
        .select({ featureId: schema.planFeatures.featureId })
        .from(schema.planFeatures)
        .where(eq(schema.planFeatures.planId, currentPlan.id)),
      db
        .select({ featureId: schema.planFeatures.featureId })
        .from(schema.planFeatures)
        .where(eq(schema.planFeatures.planId, newPlan.id)),
    ]);
    const currentFeatures = currentFeatureRows.map((r) => r.featureId);
    const newFeatures = newFeatureRows.map((r) => r.featureId);

    // Build display names map from features table
    const allFeatureIds = [...new Set([...currentFeatures, ...newFeatures])];
    let displayNames: Record<string, string> = {};
    if (allFeatureIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const featureDisplayRows = await db
        .select({
          id: schema.features.id,
          displayName: schema.features.displayName,
        })
        .from(schema.features)
        .where(inArray(schema.features.id, allFeatureIds));
      displayNames = Object.fromEntries(
        featureDisplayRows.map((r) => [r.id, r.displayName])
      );
    }

    const { gained: featuresGained, lost: featuresLost } = compareFeatures(
      currentFeatures,
      newFeatures,
      displayNames
    );

    return {
      changeType,
      immediate: changeType === "upgrade",
      currentPlan: {
        id: currentPlan.id,
        displayName: currentPlan.displayName,
        billingCycle: resolved.currentBillingCycle,
      },
      currentTier: {
        id: currentTier?.id ?? "",
        minEmployees: currentTier?.minEmployees ?? 0,
        maxEmployees: currentTier?.maxEmployees ?? 0,
        priceMonthly: currentTier?.priceMonthly ?? 0,
        priceYearly: currentTier?.priceYearly ?? 0,
      },
      newPlan: {
        id: newPlan.id,
        displayName: newPlan.displayName,
        billingCycle: resolved.finalBillingCycle,
      },
      newTier: {
        id: newTier.id,
        minEmployees: newTier.minEmployees,
        maxEmployees: newTier.maxEmployees,
        priceMonthly: newTier.priceMonthly,
        priceYearly: newTier.priceYearly,
      },
      prorationAmount,
      daysRemaining,
      scheduledAt,
      featuresGained,
      featuresLost,
    };
  }

  /**
   * Resolves final values for plan change, using current values as defaults.
   */
  private static resolveFinalValues(
    subscription: typeof schema.orgSubscriptions.$inferSelect,
    input: {
      newPlanId?: string;
      newBillingCycle?: "monthly" | "yearly";
      newTierId?: string;
    }
  ): {
    currentBillingCycle: "monthly" | "yearly";
    currentTierId: string | null;
    finalPlanId: string;
    finalBillingCycle: "monthly" | "yearly";
    finalTierId: string | null;
  } {
    const currentBillingCycle = (subscription.billingCycle ?? "monthly") as
      | "monthly"
      | "yearly";
    const currentTierId = subscription.pricingTierId;

    return {
      currentBillingCycle,
      currentTierId,
      finalPlanId: input.newPlanId ?? subscription.planId,
      finalBillingCycle: input.newBillingCycle ?? currentBillingCycle,
      finalTierId: input.newTierId ?? currentTierId,
    };
  }

  /**
   * Gets the price for a tier based on billing cycle.
   */
  private static getTierPrice(
    tier: { priceMonthly: number; priceYearly: number } | null,
    billingCycle: "monthly" | "yearly"
  ): number {
    if (!tier) {
      return 0;
    }
    return billingCycle === "yearly" ? tier.priceYearly : tier.priceMonthly;
  }

  /**
   * Calculates current and new prices based on billing cycles.
   */
  private static calculatePrices(
    currentTier: { priceMonthly: number; priceYearly: number } | null,
    newTier: { priceMonthly: number; priceYearly: number },
    currentBillingCycle: "monthly" | "yearly",
    finalBillingCycle: "monthly" | "yearly"
  ): { currentPrice: number; newPrice: number } {
    return {
      currentPrice: PlanChangeService.getTierPrice(
        currentTier,
        currentBillingCycle
      ),
      newPrice: PlanChangeService.getTierPrice(newTier, finalBillingCycle),
    };
  }

  /**
   * Validates that a change is actually being requested.
   */
  private static validateChangeRequested(
    subscription: typeof schema.orgSubscriptions.$inferSelect,
    resolved: {
      finalPlanId: string;
      finalBillingCycle: "monthly" | "yearly";
      finalTierId: string | null;
      currentBillingCycle: "monthly" | "yearly";
      currentTierId: string | null;
    }
  ): void {
    const noChange =
      resolved.finalPlanId === subscription.planId &&
      resolved.finalBillingCycle === resolved.currentBillingCycle &&
      resolved.finalTierId === resolved.currentTierId;

    if (noChange) {
      throw new NoChangeRequestedError();
    }
  }

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
   * Validates employee count for scheduled change execution.
   * Returns false if validation fails (should abort).
   */
  private static async validateEmployeeCountForExecution(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    subscription: typeof schema.orgSubscriptions.$inferSelect,
    tierInfo: { minEmployees: number; maxEmployees: number },
    newPricingTierId: string
  ): Promise<boolean> {
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
      return false;
    }

    return true;
  }

  /**
   * Logs missing pricing tier error during scheduled change execution.
   */
  private static async logMissingPricingTier(
    subscription: typeof schema.orgSubscriptions.$inferSelect
  ): Promise<void> {
    const { logger } = await import("@/lib/logger");
    logger.error({
      type: "plan-change:execute:missing-pricing-tier",
      subscriptionId: subscription.id,
      organizationId: subscription.organizationId,
      pendingPlanId: subscription.pendingPlanId,
      pendingPricingTierId: subscription.pendingPricingTierId,
      currentPricingTierId: subscription.pricingTierId,
    });
  }

  /**
   * Executes scheduled change transaction logic.
   * Extracted to reduce cognitive complexity of executeScheduledChange.
   */
  private static async executeScheduledChangeTransaction(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    subscriptionId: string,
    currentPlanDisplayName: string,
    newPagarmeSubscriptionId: string | null
  ): Promise<{
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    previousPlanId: string;
    previousBillingCycle: string | null;
    previousPlanName: string;
    newPlanName: string;
    organizationId: string;
  } | null> {
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
      await PlanChangeService.logMissingPricingTier(subscription);
      return null;
    }

    // Validate: employee count must fit within new tier's range
    const [tierInfo] = await tx
      .select({
        minEmployees: schema.planPricingTiers.minEmployees,
        maxEmployees: schema.planPricingTiers.maxEmployees,
        priceMonthly: schema.planPricingTiers.priceMonthly,
        priceYearly: schema.planPricingTiers.priceYearly,
      })
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, newPricingTierId));

    if (tierInfo) {
      const isValid = await PlanChangeService.validateEmployeeCountForExecution(
        tx,
        subscription,
        tierInfo,
        newPricingTierId
      );
      if (!isValid) {
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

    // Resolve new price from tier catalog
    let newPrice: number | null = null;
    if (tierInfo) {
      newPrice =
        newBillingCycle === "yearly"
          ? tierInfo.priceYearly
          : tierInfo.priceMonthly;
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
        pagarmeSubscriptionId: newPagarmeSubscriptionId,
        priceAtPurchase: newPrice,
        isCustomPrice: false,
        currentPeriodStart: new Date(),
        currentPeriodEnd: ProrationService.calculatePeriodEnd(
          new Date(),
          newBillingCycle as "monthly" | "yearly"
        ),
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .returning();

    // Archive previous private plan if it was a custom plan
    if (previousPlanId !== newPlanId) {
      await PlanChangeService.archivePrivatePlan(tx, previousPlanId);
    }

    return {
      subscription: updated,
      previousPlanId,
      previousBillingCycle,
      previousPlanName: currentPlanDisplayName,
      newPlanName: newPlan.displayName,
      organizationId: subscription.organizationId,
    };
  }

  /**
   * Archives a private (custom) plan by setting archivedAt.
   * Public plans are left untouched.
   */
  private static async archivePrivatePlan(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    planId: string
  ): Promise<void> {
    const [plan] = await tx
      .select({
        id: schema.subscriptionPlans.id,
        isPublic: schema.subscriptionPlans.isPublic,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId));

    if (plan && !plan.isPublic) {
      await tx
        .update(schema.subscriptionPlans)
        .set({ archivedAt: new Date() })
        .where(eq(schema.subscriptionPlans.id, plan.id));
    }
  }

  /**
   * Fetches the card ID from an existing Pagar.me subscription.
   * Returns null if the subscription cannot be fetched or has no card.
   */
  private static async fetchCardFromSubscription(
    pagarmeSubscriptionId: string
  ): Promise<string | null> {
    try {
      const pagarmeSubscription = await Retry.withRetry(
        () => PagarmeClient.getSubscription(pagarmeSubscriptionId),
        PAGARME_RETRY_CONFIG.READ
      );
      return pagarmeSubscription.card?.id ?? null;
    } catch {
      const { logger } = await import("@/lib/logger");
      logger.warn({
        type: "plan-change:execute:fetch-card-failed",
        pagarmeSubscriptionId,
      });
      return null;
    }
  }

  /**
   * Creates a new Pagar.me subscription for a downgrade using the customer's stored card.
   * Returns the new subscription ID, or null if creation fails.
   */
  private static async createDowngradeSubscription(params: {
    subscription: typeof schema.orgSubscriptions.$inferSelect;
    cardId: string | null;
  }): Promise<string | null> {
    const { subscription, cardId } = params;

    if (!cardId) {
      const { logger } = await import("@/lib/logger");
      logger.warn({
        type: "plan-change:execute:no-card-for-downgrade",
        subscriptionId: subscription.id,
        organizationId: subscription.organizationId,
      });
      return null;
    }

    const newPricingTierId =
      subscription.pendingPricingTierId ?? subscription.pricingTierId;
    const newBillingCycle = (subscription.pendingBillingCycle ??
      subscription.billingCycle ??
      "monthly") as "monthly" | "yearly";
    const newPlanId = subscription.pendingPlanId ?? subscription.planId;

    if (!newPricingTierId) {
      return null;
    }

    try {
      const pagarmePlanId = await PagarmePlanService.ensurePlan(
        newPricingTierId,
        newBillingCycle
      );

      const pagarmeCustomerId = await CustomerService.getCustomerId(
        subscription.organizationId
      );

      if (!pagarmeCustomerId) {
        const { logger } = await import("@/lib/logger");
        logger.warn({
          type: "plan-change:execute:no-customer-for-downgrade",
          subscriptionId: subscription.id,
          organizationId: subscription.organizationId,
        });
        return null;
      }

      const newSubscription = await Retry.withRetry(
        () =>
          PagarmeClient.createSubscription(
            {
              customer_id: pagarmeCustomerId,
              plan_id: pagarmePlanId,
              payment_method: "credit_card",
              card_id: cardId,
              metadata: {
                organization_id: subscription.organizationId,
                plan_id: newPlanId,
                billing_cycle: newBillingCycle,
                pricing_tier_id: newPricingTierId,
                is_downgrade: "true",
              },
            },
            `create-downgrade-sub-${subscription.id}-${Date.now()}`
          ),
        PAGARME_RETRY_CONFIG.WRITE
      );

      return newSubscription.id;
    } catch (error) {
      const { logger } = await import("@/lib/logger");
      logger.error({
        type: "plan-change:execute:create-subscription-failed",
        subscriptionId: subscription.id,
        organizationId: subscription.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
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
        pricing_tier_id: newTier.id,
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
