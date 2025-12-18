import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  MAX_EMPLOYEES,
  type PlanPricingTier,
  schema,
  YEARLY_DISCOUNT,
} from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import {
  EmployeeCountExceedsLimitError,
  EmployeeCountRequiredError,
  PlanNotFoundError,
  PricingTierNotFoundError,
} from "@/modules/payments/errors";
import { PagarmeClient } from "@/modules/payments/pagarme/client";
import type {
  BillingCycle,
  GetPricingTierData,
  ListPricingTiersData,
  PricingTierData,
} from "./pricing.model";

export abstract class PricingTierService {
  /**
   * Validates employee count is within acceptable bounds
   */
  static validateEmployeeCount(employeeCount: number | undefined): number {
    if (employeeCount === undefined || employeeCount === null) {
      throw new EmployeeCountRequiredError();
    }

    if (employeeCount < 0) {
      throw new EmployeeCountRequiredError();
    }

    if (employeeCount > MAX_EMPLOYEES) {
      throw new EmployeeCountExceedsLimitError(employeeCount, MAX_EMPLOYEES);
    }

    return employeeCount;
  }

  /**
   * Calculates yearly price from monthly price with discount
   */
  static calculateYearlyPrice(monthlyPrice: number): number {
    const yearlyFullPrice = monthlyPrice * 12;
    const discount = Math.round(yearlyFullPrice * YEARLY_DISCOUNT);
    return yearlyFullPrice - discount;
  }

  /**
   * Gets the pricing tier for a given employee count
   */
  static async getTierForEmployeeCount(
    planId: string,
    employeeCount: number
  ): Promise<GetPricingTierData> {
    const validatedCount =
      PricingTierService.validateEmployeeCount(employeeCount);

    const [plan] = await db
      .select({ id: schema.subscriptionPlans.id })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new PlanNotFoundError(planId);
    }

    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(
        and(
          eq(schema.planPricingTiers.planId, planId),
          lte(schema.planPricingTiers.minEmployees, validatedCount),
          gte(schema.planPricingTiers.maxEmployees, validatedCount)
        )
      )
      .limit(1);

    if (!tier) {
      throw new PricingTierNotFoundError(planId, validatedCount);
    }

    return {
      tier: PricingTierService.mapTierToData(tier),
    };
  }

  /**
   * Lists all pricing tiers for a plan
   */
  static async listTiersForPlan(planId: string): Promise<ListPricingTiersData> {
    const [plan] = await db
      .select({ id: schema.subscriptionPlans.id })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new PlanNotFoundError(planId);
    }

    const tiers = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.planId, planId))
      .orderBy(schema.planPricingTiers.minEmployees);

    return {
      tiers: tiers.map((tier) => PricingTierService.mapTierToData(tier)),
    };
  }

  /**
   * Gets a tier by ID
   */
  static async getTierById(tierId: string): Promise<PlanPricingTier | null> {
    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tierId))
      .limit(1);

    return tier ?? null;
  }

  /**
   * Ensures a Pagarme plan exists for the tier and billing cycle.
   * Creates the plan lazily if it doesn't exist.
   * Returns the Pagarme plan ID.
   */
  static async ensurePagarmePlan(
    tierId: string,
    billingCycle: BillingCycle
  ): Promise<string> {
    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tierId))
      .limit(1);

    if (!tier) {
      throw new PricingTierNotFoundError(tierId, 0);
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

    const price =
      billingCycle === "monthly" ? tier.priceMonthly : tier.priceYearly;
    const interval = billingCycle === "monthly" ? "month" : "year";
    const tierRange = `${tier.minEmployees}-${tier.maxEmployees}`;
    const suffix = billingCycle === "monthly" ? "monthly" : "yearly";

    const pagarmePlan = await Retry.withRetry(
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
      { maxAttempts: 3, delayMs: 1000 }
    );

    const updateField =
      billingCycle === "monthly"
        ? { pagarmePlanIdMonthly: pagarmePlan.id }
        : { pagarmePlanIdYearly: pagarmePlan.id };

    await db
      .update(schema.planPricingTiers)
      .set(updateField)
      .where(eq(schema.planPricingTiers.id, tierId));

    return pagarmePlan.id;
  }

  /**
   * Gets tier with ensured Pagarme plan for checkout
   */
  static async getTierForCheckout(
    planId: string,
    employeeCount: number,
    billingCycle: BillingCycle
  ): Promise<
    PricingTierData & {
      pagarmePlanId: string;
    }
  > {
    const response = await PricingTierService.getTierForEmployeeCount(
      planId,
      employeeCount
    );
    const { tier } = response;

    const pagarmePlanId = await PricingTierService.ensurePagarmePlan(
      tier.id,
      billingCycle
    );

    return {
      ...tier,
      pagarmePlanId,
    };
  }

  private static mapTierToData(tier: PlanPricingTier): PricingTierData {
    return {
      id: tier.id,
      planId: tier.planId,
      minEmployees: tier.minEmployees,
      maxEmployees: tier.maxEmployees,
      priceMonthly: tier.priceMonthly,
      priceYearly: tier.priceYearly,
    };
  }
}
