import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import {
  PlanNotFoundError,
  TierNotFoundError,
} from "@/modules/payments/errors";
import { PAGARME_RETRY_CONFIG, PagarmeClient } from "./client";
import { PagarmePlanHistoryService } from "./pagarme-plan-history.service";

type BillingCycle = "monthly" | "yearly";

export abstract class PagarmePlanService {
  /**
   * Ensures a Pagarme plan exists for the given tier and billing cycle.
   * Creates the plan lazily if it doesn't exist.
   * Returns the Pagarme plan ID.
   */
  static async ensurePlan(
    tierId: string,
    billingCycle: BillingCycle
  ): Promise<string> {
    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tierId))
      .limit(1);

    if (!tier) {
      throw new TierNotFoundError(tierId);
    }

    const existingPlanId =
      billingCycle === "monthly"
        ? tier.pagarmePlanIdMonthly
        : tier.pagarmePlanIdYearly;

    if (existingPlanId) {
      return existingPlanId;
    }

    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, tier.planId))
      .limit(1);

    if (!plan) {
      throw new PlanNotFoundError(tier.planId);
    }

    const pagarmePlan = await PagarmePlanService.createPlanInPagarme(
      tier,
      plan,
      billingCycle
    );

    await PagarmePlanService.updateTierWithPagarmePlanId(
      tierId,
      pagarmePlan.id,
      billingCycle
    );

    await PagarmePlanHistoryService.record({
      localPlanId: plan.id,
      localTierId: tierId,
      pagarmePlanId: pagarmePlan.id,
      billingCycle,
      priceAtCreation:
        billingCycle === "monthly" ? tier.priceMonthly : tier.priceYearly,
    });

    return pagarmePlan.id;
  }

  /**
   * Creates a one-off Pagarme plan with a custom price.
   * Unlike ensurePlan(), this does NOT cache the plan in the tier —
   * each custom checkout gets its own dedicated plan.
   */
  static async createCustomPlan(input: {
    plan: { id: string; name: string; displayName: string };
    tier: { id: string; minEmployees: number; maxEmployees: number };
    billingCycle: BillingCycle;
    price: number;
  }): Promise<string> {
    const { plan, tier, billingCycle, price } = input;
    const interval = billingCycle === "monthly" ? "month" : "year";
    const tierRange = `${tier.minEmployees}-${tier.maxEmployees}`;
    const timestamp = Date.now();

    const pagarmePlan = await Retry.withRetry(
      () =>
        PagarmeClient.createPlan(
          {
            name: `custom-${plan.name}-${tierRange}-${timestamp}`,
            description: `Custom: ${plan.displayName} (${tierRange} funcionários)`,
            currency: "BRL",
            interval,
            interval_count: 1,
            billing_type: "prepaid",
            payment_methods: ["credit_card"],
            items: [
              {
                name: plan.displayName,
                quantity: 1,
                pricing_scheme: {
                  price,
                  scheme_type: "unit",
                },
              },
            ],
            metadata: {
              type: "custom",
              local_plan_id: plan.id,
              local_tier_id: tier.id,
              billing_cycle: billingCycle,
              min_employees: String(tier.minEmployees),
              max_employees: String(tier.maxEmployees),
            },
          },
          `create-custom-plan-${plan.id}-${tier.id}-${timestamp}`
        ),
      PAGARME_RETRY_CONFIG.WRITE
    );

    await PagarmePlanHistoryService.record({
      localPlanId: plan.id,
      localTierId: tier.id,
      pagarmePlanId: pagarmePlan.id,
      billingCycle,
      priceAtCreation: price,
    });

    return pagarmePlan.id;
  }

  private static createPlanInPagarme(
    tier: {
      id: string;
      minEmployees: number;
      maxEmployees: number;
      priceMonthly: number;
      priceYearly: number;
    },
    plan: {
      id: string;
      name: string;
      displayName: string;
    },
    billingCycle: BillingCycle
  ) {
    const price =
      billingCycle === "monthly" ? tier.priceMonthly : tier.priceYearly;
    const interval = billingCycle === "monthly" ? "month" : "year";
    const tierRange = `${tier.minEmployees}-${tier.maxEmployees}`;
    const suffix = billingCycle === "monthly" ? "monthly" : "yearly";

    return Retry.withRetry(
      () =>
        PagarmeClient.createPlan(
          {
            name: `${plan.name}-${tierRange}-${suffix}`,
            description: `${plan.displayName} (${tier.minEmployees}-${tier.maxEmployees} funcionários)`,
            currency: "BRL",
            interval,
            interval_count: 1,
            billing_type: "prepaid",
            payment_methods: ["credit_card"],
            items: [
              {
                name: plan.displayName,
                quantity: 1,
                pricing_scheme: {
                  price,
                  scheme_type: "unit",
                },
              },
            ],
            metadata: {
              local_plan_id: plan.id,
              local_tier_id: tier.id,
              billing_cycle: billingCycle,
              min_employees: String(tier.minEmployees),
              max_employees: String(tier.maxEmployees),
            },
          },
          `create-tier-plan-${tier.id}-${billingCycle}`
        ),
      PAGARME_RETRY_CONFIG.WRITE
    );
  }

  private static async updateTierWithPagarmePlanId(
    tierId: string,
    pagarmePlanId: string,
    billingCycle: BillingCycle
  ) {
    const updateField =
      billingCycle === "monthly"
        ? { pagarmePlanIdMonthly: pagarmePlanId }
        : { pagarmePlanIdYearly: pagarmePlanId };

    await db
      .update(schema.planPricingTiers)
      .set(updateField)
      .where(eq(schema.planPricingTiers.id, tierId));
  }
}
