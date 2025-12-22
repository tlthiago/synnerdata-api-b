import { PLAN_FEATURES, YEARLY_DISCOUNT } from "@/db/schema";
import type { PlanLimits } from "@/modules/payments/plan/plan.model";

type TestPlan = {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  priceMonthly: number;
  priceYearly: number;
  trialDays: number;
  limits: PlanLimits;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
};

type TestPricingTier = {
  id: string;
  planId: string;
  minEmployees: number;
  maxEmployees: number;
  priceMonthly: number;
  priceYearly: number;
};

const calculateYearlyPrice = (monthlyPrice: number): number => {
  const yearlyFullPrice = monthlyPrice * 12;
  const discount = Math.round(yearlyFullPrice * YEARLY_DISCOUNT);
  return yearlyFullPrice - discount;
};

// Employee tier ranges - 10 tiers matching production
const EMPLOYEE_TIERS = [
  { min: 0, max: 10 },
  { min: 11, max: 20 },
  { min: 21, max: 30 },
  { min: 31, max: 40 },
  { min: 41, max: 50 },
  { min: 51, max: 60 },
  { min: 61, max: 70 },
  { min: 71, max: 80 },
  { min: 81, max: 90 },
  { min: 91, max: 180 },
] as const;

// Monthly prices in cents per tier for each plan
const TIER_PRICES = {
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

// Test plans - matching production structure
export const testPlans: TestPlan[] = [
  {
    id: "test-plan-gold",
    name: "gold",
    displayName: "Ouro Insights",
    description: "Essencial para contratações eficazes",
    priceMonthly: TIER_PRICES.gold[0],
    priceYearly: calculateYearlyPrice(TIER_PRICES.gold[0]),
    trialDays: 14,
    limits: {
      features: PLAN_FEATURES.gold as unknown as string[],
    },
    isActive: true,
    isPublic: true,
    sortOrder: 0,
  },
  {
    id: "test-plan-diamond",
    name: "diamond",
    displayName: "Diamante Analytics",
    description: "Todos os recursos premium",
    priceMonthly: TIER_PRICES.diamond[0],
    priceYearly: calculateYearlyPrice(TIER_PRICES.diamond[0]),
    trialDays: 14,
    limits: {
      features: PLAN_FEATURES.diamond as unknown as string[],
    },
    isActive: true,
    isPublic: true,
    sortOrder: 1,
  },
  {
    id: "test-plan-platinum",
    name: "platinum",
    displayName: "Platina Vision",
    description: "Recursos avançados de analytics",
    priceMonthly: TIER_PRICES.platinum[0],
    priceYearly: calculateYearlyPrice(TIER_PRICES.platinum[0]),
    trialDays: 14,
    limits: {
      features: PLAN_FEATURES.platinum as unknown as string[],
    },
    isActive: true,
    isPublic: true,
    sortOrder: 2,
  },
  {
    id: "test-plan-inactive",
    name: "legacy",
    displayName: "Legacy Plan",
    priceMonthly: 4900,
    priceYearly: 49_000,
    trialDays: 7,
    limits: {
      features: ["basic"],
    },
    isActive: false,
    isPublic: false,
    sortOrder: 99,
  },
];

// Generate pricing tiers for each plan
function generatePricingTiers(): TestPricingTier[] {
  const tiers: TestPricingTier[] = [];

  const planConfigs = [
    { planId: "test-plan-gold", name: "gold", prices: TIER_PRICES.gold },
    {
      planId: "test-plan-diamond",
      name: "diamond",
      prices: TIER_PRICES.diamond,
    },
    {
      planId: "test-plan-platinum",
      name: "platinum",
      prices: TIER_PRICES.platinum,
    },
  ];

  for (const config of planConfigs) {
    for (let i = 0; i < EMPLOYEE_TIERS.length; i++) {
      const tier = EMPLOYEE_TIERS[i];
      const priceMonthly = config.prices[i];

      tiers.push({
        id: `test-tier-${config.name}-${tier.min}-${tier.max}`,
        planId: config.planId,
        minEmployees: tier.min,
        maxEmployees: tier.max,
        priceMonthly,
        priceYearly: calculateYearlyPrice(priceMonthly),
      });
    }
  }

  return tiers;
}

// Test pricing tiers - 10 tiers per plan (30 total)
export const testPricingTiers: TestPricingTier[] = generatePricingTiers();

export const activePlans = testPlans.filter((p) => p.isActive && p.isPublic);
export const goldPlan = testPlans.find((p) => p.name === "gold");
export const diamondPlan = testPlans.find((p) => p.name === "diamond");
export const platinumPlan = testPlans.find((p) => p.name === "platinum");

// Backwards compatibility aliases - use the new names in new code
export const starterPlan = goldPlan;
export const proPlan = diamondPlan;
export const enterprisePlan = platinumPlan;

// Helper to get tiers for a plan
export function getTiersForPlan(planId: string): TestPricingTier[] {
  return testPricingTiers.filter((t) => t.planId === planId);
}

// Helper to get tier for employee count
export function getTierForEmployeeCount(
  planId: string,
  employeeCount: number
): TestPricingTier | undefined {
  return testPricingTiers.find(
    (t) =>
      t.planId === planId &&
      employeeCount >= t.minEmployees &&
      employeeCount <= t.maxEmployees
  );
}
