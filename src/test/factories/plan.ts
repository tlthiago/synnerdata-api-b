import { db } from "@/db";
import { type PlanLimits, schema } from "@/db/schema";
import {
  calculateYearlyPrice,
  DEFAULT_TRIAL_DAYS,
  DEFAULT_TRIAL_EMPLOYEE_LIMIT,
  EMPLOYEE_TIERS,
  PLAN_FEATURES,
  TRIAL_TIER,
} from "@/modules/payments/plans/plans.constants";

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
  limits?: PlanLimits;
  sortOrder?: number;
};

type PricingTier = typeof schema.planPricingTiers.$inferSelect;

type CreatePlanResult = {
  plan: typeof schema.subscriptionPlans.$inferSelect;
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
    limits: { features: [...PLAN_FEATURES[type]] },
    sortOrder: isTrial ? -1 : 0,
  };
}

/**
 * Creates a test plan with pricing tiers.
 * Each plan gets a unique ID following the pattern `plan-${uuid}`.
 *
 * @example
 * // Create a trial plan
 * const { plan, tiers } = await createTestPlan({ type: "trial" });
 *
 * // Create a paid plan
 * const { plan, tiers } = await createTestPlan({ type: "gold" });
 *
 * // Create a custom plan
 * const { plan, tiers } = await createTestPlan({
 *   type: "diamond",
 *   displayName: "Custom Diamond",
 *   isActive: false,
 * });
 */
export async function createTestPlan(
  options: CreatePlanOptions = {}
): Promise<CreatePlanResult> {
  const type = options.type ?? "gold";
  const defaults = getDefaultsForType(type);

  const planId = generatePlanId();

  const [plan] = await db
    .insert(schema.subscriptionPlans)
    .values({
      id: planId,
      name: options.name ?? `${defaults.name}-${planId.slice(-8)}`,
      displayName: options.displayName ?? defaults.displayName,
      description: options.description ?? defaults.description,
      isActive: options.isActive ?? defaults.isActive,
      isPublic: options.isPublic ?? defaults.isPublic,
      isTrial: options.isTrial ?? defaults.isTrial,
      trialDays: options.trialDays ?? defaults.trialDays,
      limits: options.limits ?? defaults.limits,
      sortOrder: options.sortOrder ?? defaults.sortOrder,
    })
    .returning();

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
      const priceYearly = calculateYearlyPrice(priceMonthly);

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

  return { plan, tiers };
}

/**
 * Creates a trial plan for testing.
 * Shorthand for createTestPlan({ type: "trial" }).
 */
export function createTrialPlan(
  options: Omit<CreatePlanOptions, "type" | "isTrial"> = {}
): Promise<CreatePlanResult> {
  return createTestPlan({ ...options, type: "trial", isTrial: true });
}

/**
 * Creates a paid plan for testing.
 * Shorthand for createTestPlan with a paid type.
 */
export function createPaidPlan(
  type: "gold" | "diamond" | "platinum" = "gold",
  options: Omit<CreatePlanOptions, "type" | "isTrial"> = {}
): Promise<CreatePlanResult> {
  return createTestPlan({ ...options, type, isTrial: false });
}

/**
 * Creates an inactive plan for testing scenarios where plan is not available.
 */
export function createInactivePlan(
  options: Omit<CreatePlanOptions, "isActive"> = {}
): Promise<CreatePlanResult> {
  return createTestPlan({ ...options, isActive: false });
}

/**
 * Gets a tier from a plan result by employee count.
 */
export function getTierForEmployeeCount(
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
export function getFirstTier(result: CreatePlanResult): PricingTier {
  const tier = result.tiers[0];
  if (!tier) {
    throw new Error("Plan has no tiers");
  }
  return tier;
}

export const DEFAULT_EMPLOYEE_COUNT = DEFAULT_TRIAL_EMPLOYEE_LIMIT;
