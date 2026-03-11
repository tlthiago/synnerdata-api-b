import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  DEFAULT_TRIAL_DAYS,
  EMPLOYEE_TIERS,
  TRIAL_TIER,
} from "@/modules/payments/plans/plans.constants";

const PLAN_FEATURE_IDS = {
  trial: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
    "payroll",
  ],
  gold: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
  ],
  diamond: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
  ],
  platinum: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
    "payroll",
  ],
} as const;

function calculateYearlyPriceDefault(monthlyPrice: number): number {
  const yearlyFullPrice = monthlyPrice * 12;
  const discount = Math.round(yearlyFullPrice * 0.2);
  return yearlyFullPrice - discount;
}

type PlanType = "trial" | "gold" | "diamond" | "platinum";

type CreatePlanOptions = {
  type?: PlanType;
  name?: string;
  displayName?: string;
  description?: string;
  isActive?: boolean;
  isPublic?: boolean;
  isTrial?: boolean;
  trialDays?: number;
  features?: string[];
  sortOrder?: number;
};

type Plan = typeof schema.subscriptionPlans.$inferSelect;
type PricingTier = typeof schema.planPricingTiers.$inferSelect;

export type CreatePlanResult = {
  plan: Plan;
  tiers: PricingTier[];
};

const DEFAULT_TIER_PRICES = {
  gold: [
    39_900, 44_990, 49_990, 55_990, 61_990, 69_990, 77_990, 86_990, 96_990,
    107_990,
  ],
  diamond: [
    49_900, 55_990, 61_990, 68_990, 76_090, 84_990, 94_090, 104_990, 115_990,
    128_890,
  ],
  platinum: [
    59_900, 66_990, 73_990, 82_190, 91_290, 101_590, 112_990, 125_290, 139_990,
    154_990,
  ],
} as const;

const PLAN_SORT_ORDER: Record<PlanType, number> = {
  trial: -1,
  gold: 1,
  diamond: 2,
  platinum: 3,
};

function generatePlanId(): string {
  return `plan-${crypto.randomUUID()}`;
}

function generateTierId(): string {
  return `tier-${crypto.randomUUID()}`;
}

function getDefaultsForType(type: PlanType) {
  const isTrial = type === "trial";

  return {
    name: type,
    displayName: isTrial
      ? "Trial"
      : `Test ${type.charAt(0).toUpperCase() + type.slice(1)}`,
    description: isTrial ? "Trial plan for testing" : `Test ${type} plan`,
    isActive: true,
    isPublic: !isTrial,
    isTrial,
    trialDays: isTrial ? DEFAULT_TRIAL_DAYS : 0,
    features: [...PLAN_FEATURE_IDS[type]],
    sortOrder: PLAN_SORT_ORDER[type],
  };
}

/**
 * Factory for creating test plans with pricing tiers.
 *
 * Each plan gets a unique ID following the pattern `plan-${uuid}`.
 * Follows Elysia's recommended pattern of abstract class with static methods.
 *
 * @example
 * // Create a trial plan
 * const { plan, tiers } = await PlanFactory.createTrial();
 *
 * // Create a paid plan with all tiers
 * const { plan, tiers } = await PlanFactory.createPaid("gold");
 *
 * // Create with custom options
 * const { plan, tiers } = await PlanFactory.create({
 *   type: "diamond",
 *   displayName: "Custom Diamond",
 *   isActive: false,
 * });
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Factory pattern for test utilities
export abstract class PlanFactory {
  /**
   * Creates a test plan with pricing tiers.
   */
  static async create(
    options: CreatePlanOptions = {}
  ): Promise<CreatePlanResult> {
    const type = options.type ?? "gold";
    const defaults = getDefaultsForType(type);

    const planId = generatePlanId();
    const isTrial = options.isTrial ?? defaults.isTrial;

    // Archive existing active trial to satisfy unique constraint
    if (isTrial) {
      await PlanFactory.archiveActiveTrial();
    }

    const [plan] = await db
      .insert(schema.subscriptionPlans)
      .values({
        id: planId,
        name: options.name ?? `${defaults.name}-${planId.slice(-8)}`,
        displayName: options.displayName ?? defaults.displayName,
        description: options.description ?? defaults.description,
        isActive: options.isActive ?? defaults.isActive,
        isPublic: options.isPublic ?? defaults.isPublic,
        isTrial,
        trialDays: options.trialDays ?? defaults.trialDays,
        sortOrder: options.sortOrder ?? defaults.sortOrder,
      })
      .returning();

    // Insert plan_features
    const featureIds = options.features ?? defaults.features;
    if (featureIds.length > 0) {
      await db
        .insert(schema.planFeatures)
        .values(featureIds.map((featureId) => ({ planId, featureId })));
    }

    // Insert plan_limits for trial plans
    if (isTrial) {
      await db.insert(schema.planLimits).values({
        planId,
        limitKey: "max_employees",
        limitValue: 10,
      });
    }

    const tiers = await PlanFactory.createTiersForPlan(planId, type);

    return { plan, tiers };
  }

  /**
   * Creates a trial plan for testing.
   */
  static createTrial(
    options: Omit<CreatePlanOptions, "type" | "isTrial"> = {}
  ): Promise<CreatePlanResult> {
    return PlanFactory.create({ ...options, type: "trial", isTrial: true });
  }

  /**
   * Creates a paid plan for testing.
   */
  static createPaid(
    type: "gold" | "diamond" | "platinum" = "gold",
    options: Omit<CreatePlanOptions, "type" | "isTrial"> = {}
  ): Promise<CreatePlanResult> {
    return PlanFactory.create({ ...options, type, isTrial: false });
  }

  /**
   * Creates an inactive plan for testing scenarios where plan is not available.
   */
  static createInactive(
    options: Omit<CreatePlanOptions, "isActive"> = {}
  ): Promise<CreatePlanResult> {
    return PlanFactory.create({ ...options, isActive: false });
  }

  /**
   * Creates a custom (org-specific) plan derived from a base plan.
   */
  static async createCustom(options: {
    organizationId: string;
    basePlanId: string;
    type?: "gold" | "diamond" | "platinum";
    priceMonthly?: number;
    maxEmployees?: number;
  }): Promise<CreatePlanResult> {
    const type = options.type ?? "diamond";
    const defaults = getDefaultsForType(type);
    const planId = generatePlanId();
    const tierId = generateTierId();
    const priceMonthly = options.priceMonthly ?? 18_500;
    const maxEmployees = options.maxEmployees ?? 50;

    const [plan] = await db
      .insert(schema.subscriptionPlans)
      .values({
        id: planId,
        name: `custom-${type}-${options.organizationId}-${Date.now()}`,
        displayName: defaults.displayName,
        description: `Custom plan based on ${defaults.displayName} for org ${options.organizationId}`,
        isActive: true,
        isPublic: false,
        isTrial: false,
        trialDays: 0,
        sortOrder: defaults.sortOrder,
        organizationId: options.organizationId,
        basePlanId: options.basePlanId,
      })
      .returning();

    const featureIds = defaults.features;
    if (featureIds.length > 0) {
      await db
        .insert(schema.planFeatures)
        .values(featureIds.map((featureId) => ({ planId, featureId })));
    }

    const [tier] = await db
      .insert(schema.planPricingTiers)
      .values({
        id: tierId,
        planId,
        minEmployees: 0,
        maxEmployees,
        priceMonthly,
        priceYearly: calculateYearlyPriceDefault(priceMonthly),
      })
      .returning();

    return { plan, tiers: [tier] };
  }

  /**
   * Gets a tier from a plan result by employee count.
   */
  static getTierForEmployeeCount(
    result: CreatePlanResult,
    employeeCount: number
  ): PricingTier | undefined {
    return result.tiers.find(
      (tier) =>
        employeeCount >= tier.minEmployees && employeeCount <= tier.maxEmployees
    );
  }

  /**
   * Gets the first tier from a plan result.
   * Useful when you just need any valid tier.
   */
  static getFirstTier(result: CreatePlanResult): PricingTier {
    const tier = result.tiers[0];
    if (!tier) {
      throw new Error("Plan has no tiers");
    }
    return tier;
  }

  /**
   * Creates pricing tiers for a plan.
   */
  private static async createTiersForPlan(
    planId: string,
    type: PlanType
  ): Promise<PricingTier[]> {
    const tiers: PricingTier[] = [];

    if (type === "trial") {
      const [tier] = await db
        .insert(schema.planPricingTiers)
        .values({
          id: generateTierId(),
          planId,
          minEmployees: TRIAL_TIER.min,
          maxEmployees: TRIAL_TIER.max,
          priceMonthly: 0,
          priceYearly: 0,
        })
        .returning();
      tiers.push(tier);
    } else {
      const prices =
        DEFAULT_TIER_PRICES[type as keyof typeof DEFAULT_TIER_PRICES];

      for (let i = 0; i < EMPLOYEE_TIERS.length; i++) {
        const employeeTier = EMPLOYEE_TIERS[i];
        const priceMonthly = prices[i];
        const priceYearly = calculateYearlyPriceDefault(priceMonthly);

        const [tier] = await db
          .insert(schema.planPricingTiers)
          .values({
            id: generateTierId(),
            planId,
            minEmployees: employeeTier.min,
            maxEmployees: employeeTier.max,
            priceMonthly,
            priceYearly,
          })
          .returning();
        tiers.push(tier);
      }
    }

    return tiers;
  }

  /**
   * Archives any active (non-archived) trial plan.
   * Required before inserting a new trial plan due to the unique constraint.
   */
  static async archiveActiveTrial(): Promise<void> {
    await db
      .update(schema.subscriptionPlans)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(schema.subscriptionPlans.isTrial, true),
          isNull(schema.subscriptionPlans.archivedAt)
        )
      );
  }
}

export const DEFAULT_EMPLOYEE_COUNT = 10;
