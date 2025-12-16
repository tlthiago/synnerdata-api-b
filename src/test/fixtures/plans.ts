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

// Test plans - simplified set for testing
export const testPlans: TestPlan[] = [
  {
    id: "test-plan-gold",
    name: "gold",
    displayName: "Test Gold",
    description: "Test Gold plan",
    priceMonthly: 39_900,
    priceYearly: calculateYearlyPrice(39_900),
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
    displayName: "Test Diamond",
    description: "Test Diamond plan",
    priceMonthly: 49_900,
    priceYearly: calculateYearlyPrice(49_900),
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
    displayName: "Test Platinum",
    description: "Test Platinum plan",
    priceMonthly: 59_900,
    priceYearly: calculateYearlyPrice(59_900),
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
    isActive: false, // Plan not available for new subscriptions
    isPublic: false,
    sortOrder: 99,
  },
];

// Test pricing tiers - 3 tiers per plan for testing (simplified)
export const testPricingTiers: TestPricingTier[] = [
  // Gold tiers
  {
    id: "test-tier-gold-0-10",
    planId: "test-plan-gold",
    minEmployees: 0,
    maxEmployees: 10,
    priceMonthly: 39_900,
    priceYearly: calculateYearlyPrice(39_900),
  },
  {
    id: "test-tier-gold-11-50",
    planId: "test-plan-gold",
    minEmployees: 11,
    maxEmployees: 50,
    priceMonthly: 61_990,
    priceYearly: calculateYearlyPrice(61_990),
  },
  {
    id: "test-tier-gold-51-180",
    planId: "test-plan-gold",
    minEmployees: 51,
    maxEmployees: 180,
    priceMonthly: 107_990,
    priceYearly: calculateYearlyPrice(107_990),
  },
  // Diamond tiers
  {
    id: "test-tier-diamond-0-10",
    planId: "test-plan-diamond",
    minEmployees: 0,
    maxEmployees: 10,
    priceMonthly: 49_900,
    priceYearly: calculateYearlyPrice(49_900),
  },
  {
    id: "test-tier-diamond-11-50",
    planId: "test-plan-diamond",
    minEmployees: 11,
    maxEmployees: 50,
    priceMonthly: 76_090,
    priceYearly: calculateYearlyPrice(76_090),
  },
  {
    id: "test-tier-diamond-51-180",
    planId: "test-plan-diamond",
    minEmployees: 51,
    maxEmployees: 180,
    priceMonthly: 128_890,
    priceYearly: calculateYearlyPrice(128_890),
  },
  // Platinum tiers
  {
    id: "test-tier-platinum-0-10",
    planId: "test-plan-platinum",
    minEmployees: 0,
    maxEmployees: 10,
    priceMonthly: 59_900,
    priceYearly: calculateYearlyPrice(59_900),
  },
  {
    id: "test-tier-platinum-11-50",
    planId: "test-plan-platinum",
    minEmployees: 11,
    maxEmployees: 50,
    priceMonthly: 91_290,
    priceYearly: calculateYearlyPrice(91_290),
  },
  {
    id: "test-tier-platinum-51-180",
    planId: "test-plan-platinum",
    minEmployees: 51,
    maxEmployees: 180,
    priceMonthly: 154_990,
    priceYearly: calculateYearlyPrice(154_990),
  },
];

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
