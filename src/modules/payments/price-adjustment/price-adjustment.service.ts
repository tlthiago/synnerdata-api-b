import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { PaymentHooks } from "@/modules/payments/hooks";
import { PagarmeClient } from "@/modules/payments/pagarme/client";
import { PagarmePlanService } from "@/modules/payments/pagarme/pagarme-plan.service";
import { calculateYearlyPrice } from "@/modules/payments/plans/plans.constants";
import {
  SubscriptionNotAdjustableError,
  TierNotFoundForAdjustmentError,
} from "./errors";
import type {
  AdjustBulkInput,
  AdjustIndividualInput,
  GetHistoryInput,
} from "./price-adjustment.model";

export abstract class PriceAdjustmentService {
  /**
   * Adjust the price for an individual subscription.
   * Creates a dedicated Pagar.me plan, updates the subscription item pricing,
   * and records the adjustment.
   */
  private static async validateAndFetchSubscription(subscriptionId: string) {
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      throw new SubscriptionNotAdjustableError(
        subscriptionId,
        "Subscription not found"
      );
    }

    if (subscription.status !== "active") {
      throw new SubscriptionNotAdjustableError(
        subscriptionId,
        `Subscription is not active (status: ${subscription.status})`
      );
    }

    if (subscription.priceAtPurchase === null) {
      throw new SubscriptionNotAdjustableError(
        subscriptionId,
        "Cannot adjust price for a trial subscription (no price set)"
      );
    }

    return subscription;
  }

  static async adjustIndividual(input: AdjustIndividualInput) {
    const { subscriptionId, newPriceMonthly, reason, adminId } = input;

    // 1. Fetch and validate subscription
    const subscription =
      await PriceAdjustmentService.validateAndFetchSubscription(subscriptionId);

    // 2. Get plan info from DB (needed for discount percentage)
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, subscription.planId))
      .limit(1);

    // 3. Determine billingCycle and calculate effective price
    const billingCycle =
      (subscription.billingCycle as "monthly" | "yearly") ?? "monthly";
    const newPriceYearly = calculateYearlyPrice(
      newPriceMonthly,
      plan?.yearlyDiscountPercent ?? 20
    );
    const effectiveNewPrice =
      billingCycle === "yearly" ? newPriceYearly : newPriceMonthly;

    // Guaranteed non-null by validateAndFetchSubscription
    const oldPrice = subscription.priceAtPurchase as number;

    const tier = subscription.pricingTierId
      ? (
          await db
            .select()
            .from(schema.planPricingTiers)
            .where(eq(schema.planPricingTiers.id, subscription.pricingTierId))
            .limit(1)
        )[0]
      : null;

    // 4. Create dedicated Pagar.me plan (registers plan in Pagar.me for audit trail)
    await PagarmePlanService.createCustomPlan({
      plan: {
        id: plan?.id ?? subscription.planId,
        name: plan?.name ?? "unknown",
        displayName: plan?.displayName ?? "Unknown Plan",
      },
      tier: {
        id: tier?.id ?? subscription.pricingTierId ?? "unknown",
        minEmployees: tier?.minEmployees ?? 0,
        maxEmployees: tier?.maxEmployees ?? 0,
      },
      billingCycle,
      price: effectiveNewPrice,
    });

    // 5. If subscription has pagarmeSubscriptionId, update item pricing
    if (subscription.pagarmeSubscriptionId) {
      const pagarmeSubscription = await PagarmeClient.getSubscription(
        subscription.pagarmeSubscriptionId
      );
      const currentItem = pagarmeSubscription.plan?.items?.[0] as unknown as
        | { id: string; name: string; quantity: number }
        | undefined;

      if (currentItem) {
        await PagarmeClient.updateSubscriptionItem(
          subscription.pagarmeSubscriptionId,
          currentItem.id,
          {
            pricing_scheme: {
              price: effectiveNewPrice,
              scheme_type: "unit",
            },
          }
        );
      }
    }

    // 6. Update orgSubscriptions
    await db
      .update(schema.orgSubscriptions)
      .set({
        priceAtPurchase: effectiveNewPrice,
        isCustomPrice: true,
      })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    // 7. Insert price adjustment record
    const adjustmentId = `price-adj-${crypto.randomUUID()}`;
    const now = new Date();

    await db.insert(schema.priceAdjustments).values({
      id: adjustmentId,
      subscriptionId,
      organizationId: subscription.organizationId,
      oldPrice,
      newPrice: effectiveNewPrice,
      reason,
      adjustmentType: "individual",
      billingCycle,
      pricingTierId: subscription.pricingTierId,
      adminId,
      createdAt: now,
    });

    // 8. Emit hook
    const updatedSubscription = {
      ...subscription,
      priceAtPurchase: effectiveNewPrice,
      isCustomPrice: true,
    };

    PaymentHooks.emit("subscription.priceAdjusted", {
      subscription: updatedSubscription,
      oldPrice,
      newPrice: effectiveNewPrice,
      reason,
      adjustmentType: "individual",
      adminId,
    });

    // 9. Return result
    return {
      adjustment: {
        id: adjustmentId,
        subscriptionId,
        organizationId: subscription.organizationId,
        oldPrice,
        newPrice: effectiveNewPrice,
        reason,
        adjustmentType: "individual" as const,
        billingCycle,
        pricingTierId: subscription.pricingTierId,
        adminId,
        createdAt: now.toISOString(),
      },
      subscription: {
        id: subscription.id,
        organizationId: subscription.organizationId,
        priceAtPurchase: effectiveNewPrice,
        isCustomPrice: true,
      },
    };
  }

  /**
   * Bulk price adjustment for all active subscriptions on a specific tier and billing cycle.
   * Updates the catalog plan in Pagar.me, local tier prices, and all affected subscriptions.
   */
  static async adjustBulk(input: AdjustBulkInput) {
    const {
      planId,
      pricingTierId,
      billingCycle,
      newPriceMonthly,
      reason,
      adminId,
    } = input;

    // 1. Validate tier exists and belongs to planId
    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(
        and(
          eq(schema.planPricingTiers.id, pricingTierId),
          eq(schema.planPricingTiers.planId, planId)
        )
      )
      .limit(1);

    if (!tier) {
      throw new TierNotFoundForAdjustmentError(pricingTierId, planId);
    }

    // 2. Get plan info (needed for discount percentage and display name)
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    // 3. Calculate effective price
    const newPriceYearly = calculateYearlyPrice(
      newPriceMonthly,
      plan?.yearlyDiscountPercent ?? 20
    );
    const effectiveNewPrice =
      billingCycle === "yearly" ? newPriceYearly : newPriceMonthly;

    // 4. Update catalog plan in Pagar.me
    const pagarmePlanField =
      billingCycle === "monthly"
        ? tier.pagarmePlanIdMonthly
        : tier.pagarmePlanIdYearly;

    if (pagarmePlanField) {
      await PagarmeClient.updatePlan(pagarmePlanField, {
        items: [
          {
            name: plan?.displayName ?? "Plan",
            quantity: 1,
            pricing_scheme: {
              price: effectiveNewPrice,
              scheme_type: "unit",
            },
          },
        ],
      });
    }

    // 5. Update planPricingTiers locally
    if (billingCycle === "monthly") {
      await db
        .update(schema.planPricingTiers)
        .set({
          priceMonthly: newPriceMonthly,
          priceYearly: newPriceYearly,
        })
        .where(eq(schema.planPricingTiers.id, pricingTierId));
    } else {
      await db
        .update(schema.planPricingTiers)
        .set({
          priceYearly: newPriceYearly,
        })
        .where(eq(schema.planPricingTiers.id, pricingTierId));
    }

    // 6. Find all active subscriptions matching tier + billingCycle + status active
    const subscriptions = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(
        and(
          eq(schema.orgSubscriptions.pricingTierId, pricingTierId),
          eq(schema.orgSubscriptions.billingCycle, billingCycle),
          eq(schema.orgSubscriptions.status, "active")
        )
      );

    // 7. For each subscription, update price and insert adjustment record
    const adjustments: {
      id: string;
      subscriptionId: string;
      organizationId: string;
      oldPrice: number;
      newPrice: number;
      reason: string;
      adjustmentType: "individual" | "bulk";
      billingCycle: string;
      pricingTierId: string | null;
      adminId: string;
      createdAt: string;
    }[] = [];

    for (const subscription of subscriptions) {
      // Skip if priceAtPurchase is null (trial subscriptions)
      if (subscription.priceAtPurchase === null) {
        continue;
      }

      const oldPrice = subscription.priceAtPurchase;

      // Update priceAtPurchase
      await db
        .update(schema.orgSubscriptions)
        .set({ priceAtPurchase: effectiveNewPrice })
        .where(eq(schema.orgSubscriptions.id, subscription.id));

      // Insert adjustment record
      const adjustmentId = `price-adj-${crypto.randomUUID()}`;
      const now = new Date();

      await db.insert(schema.priceAdjustments).values({
        id: adjustmentId,
        subscriptionId: subscription.id,
        organizationId: subscription.organizationId,
        oldPrice,
        newPrice: effectiveNewPrice,
        reason,
        adjustmentType: "bulk",
        billingCycle,
        pricingTierId,
        adminId,
        createdAt: now,
      });

      adjustments.push({
        id: adjustmentId,
        subscriptionId: subscription.id,
        organizationId: subscription.organizationId,
        oldPrice,
        newPrice: effectiveNewPrice,
        reason,
        adjustmentType: "bulk",
        billingCycle,
        pricingTierId,
        adminId,
        createdAt: now.toISOString(),
      });

      // Emit hook for each subscription
      const updatedSubscription = {
        ...subscription,
        priceAtPurchase: effectiveNewPrice,
      };

      PaymentHooks.emit("subscription.priceAdjusted", {
        subscription: updatedSubscription,
        oldPrice,
        newPrice: effectiveNewPrice,
        reason,
        adjustmentType: "bulk",
        adminId,
      });
    }

    // 8. Return result
    return {
      adjustments,
      updatedCount: adjustments.length,
      catalogUpdated: true,
    };
  }

  /**
   * Get price adjustment history for a specific subscription.
   * Returns paginated results ordered by most recent first.
   */
  static async getHistory(input: GetHistoryInput) {
    const { subscriptionId, page, limit } = input;
    const offset = (page - 1) * limit;

    // Count total records
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.priceAdjustments)
      .where(eq(schema.priceAdjustments.subscriptionId, subscriptionId));

    const total = Number(count);

    // Query with pagination
    const records = await db
      .select()
      .from(schema.priceAdjustments)
      .where(eq(schema.priceAdjustments.subscriptionId, subscriptionId))
      .orderBy(desc(schema.priceAdjustments.createdAt))
      .limit(limit)
      .offset(offset);

    const data = records.map((record) => ({
      id: record.id,
      subscriptionId: record.subscriptionId,
      organizationId: record.organizationId,
      oldPrice: record.oldPrice,
      newPrice: record.newPrice,
      reason: record.reason,
      adjustmentType: record.adjustmentType,
      billingCycle: record.billingCycle,
      pricingTierId: record.pricingTierId,
      adminId: record.adminId,
      createdAt: record.createdAt.toISOString(),
    }));

    return {
      data,
      pagination: {
        total,
        limit,
        offset,
      },
    };
  }
}
