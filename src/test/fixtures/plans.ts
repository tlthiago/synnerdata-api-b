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

type PlanFixture = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  isActive: boolean;
  isPublic: boolean;
  isTrial: boolean;
  trialDays: number;
  features: string[];
  sortOrder: number;
};

type PricingTierFixture = {
  id: string;
  planId: string;
  minEmployees: number;
  maxEmployees: number;
  priceMonthly: number;
  priceYearly: number;
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

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  trial: "Trial",
  gold: "Ouro",
  diamond: "Diamante",
  platinum: "Platina",
};

const PLAN_SORT_ORDER: Record<string, number> = {
  trial: -1,
  gold: 1,
  diamond: 2,
  platinum: 3,
};

function createPlanFixture(
  type: "trial" | "gold" | "diamond" | "platinum"
): PlanFixture {
  const isTrial = type === "trial";

  return {
    id: `test-plan-${type}`,
    name: type,
    displayName: PLAN_DISPLAY_NAMES[type],
    description: isTrial ? "Trial plan for testing" : `Test ${type} plan`,
    isActive: true,
    isPublic: !isTrial,
    isTrial,
    trialDays: isTrial ? DEFAULT_TRIAL_DAYS : 0,
    features: [...PLAN_FEATURE_IDS[type]],
    sortOrder: PLAN_SORT_ORDER[type],
  };
}

function createPricingTiersFixture(
  planId: string,
  type: "trial" | "gold" | "diamond" | "platinum"
): PricingTierFixture[] {
  if (type === "trial") {
    return [
      {
        id: `test-tier-${planId}-0`,
        planId,
        minEmployees: TRIAL_TIER.min,
        maxEmployees: TRIAL_TIER.max,
        priceMonthly: 0,
        priceYearly: 0,
      },
    ];
  }

  const prices = DEFAULT_TIER_PRICES[type];

  return EMPLOYEE_TIERS.map((tier, index) => ({
    id: `test-tier-${planId}-${index}`,
    planId,
    minEmployees: tier.min,
    maxEmployees: tier.max,
    priceMonthly: prices[index],
    priceYearly: calculateYearlyPriceDefault(prices[index]),
  }));
}

// Plan fixtures
export const trialPlan = createPlanFixture("trial");
export const goldPlan = createPlanFixture("gold");
export const diamondPlan = createPlanFixture("diamond");
export const platinumPlan = createPlanFixture("platinum");

// Legacy aliases
export const starterPlan = trialPlan;
export const proPlan = diamondPlan;

// Pricing tier fixtures
export const trialTiers = createPricingTiersFixture(trialPlan.id, "trial");
export const goldTiers = createPricingTiersFixture(goldPlan.id, "gold");
export const diamondTiers = createPricingTiersFixture(
  diamondPlan.id,
  "diamond"
);
export const platinumTiers = createPricingTiersFixture(
  platinumPlan.id,
  "platinum"
);

// All plans and tiers
export const allPlans = [trialPlan, goldPlan, diamondPlan, platinumPlan];
export const allTiers = [
  ...trialTiers,
  ...goldTiers,
  ...diamondTiers,
  ...platinumTiers,
];

// Plan map for getTestPlan helper
export const planMap = {
  trial: trialPlan,
  gold: goldPlan,
  diamond: diamondPlan,
  platinum: platinumPlan,
  // Legacy aliases
  starter: trialPlan,
  pro: diamondPlan,
} as const;
