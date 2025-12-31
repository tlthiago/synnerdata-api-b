import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import {
  PlanNotFoundError,
  PricingTierNotFoundError,
} from "@/modules/payments/errors";
import { PAGARME_RETRY_CONFIG, PagarmeClient } from "./client";

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
      throw new PricingTierNotFoundError("unknown", tierId);
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

    return pagarmePlan.id;
  }

  private static async createPlanInPagarme(
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
