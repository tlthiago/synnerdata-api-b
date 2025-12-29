/**
 * Production seed data for subscription plans and pricing tiers.
 *
 * This defines:
 * - 1 Trial plan (free, 14 days, all features, 1 tier: 0-10 employees)
 * - 3 paid plans (Gold, Diamond, Platinum) with their features
 * - 10 pricing tiers per paid plan based on employee count ranges
 *
 * Run with: bun run db:seed
 */

import { db } from "@/db";
import { type PlanLimits, schema } from "@/db/schema";
import {
  calculateYearlyPrice,
  DEFAULT_TRIAL_DAYS,
  EMPLOYEE_TIERS,
  PLAN_FEATURES,
  TRIAL_TIER,
} from "@/modules/payments/plans/plans.constants";

export const TIER_PRICES = {
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

export const PLAN_DISPLAY_NAMES = {
  trial: "Trial",
  gold: "Ouro Insights",
  diamond: "Diamante Analytics",
  platinum: "Platina Vision",
} as const;

export const PLAN_DESCRIPTIONS = {
  trial: "Período de avaliação gratuito com acesso completo",
  gold: "Essencial para contratações eficazes",
  diamond: "Todos os recursos premium",
  platinum: "Recursos avançados de analytics",
} as const;

type PlanName = keyof typeof PLAN_FEATURES;
type PaidPlanName = keyof typeof TIER_PRICES;

function createPlanId(name: string): string {
  return `plan-${name}`;
}

function createTierId(planName: string, min: number, max: number): string {
  return `tier-${planName}-${min}-${max}`;
}

interface PlanConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  trialDays: number;
  limits: PlanLimits;
  isActive: boolean;
  isPublic: boolean;
  isTrial: boolean;
  sortOrder: number;
}

function createPlanConfig(
  name: PlanName,
  overrides: Partial<PlanConfig> = {}
): PlanConfig {
  return {
    id: createPlanId(name),
    name,
    displayName: PLAN_DISPLAY_NAMES[name],
    description: PLAN_DESCRIPTIONS[name],
    trialDays: name === "trial" ? DEFAULT_TRIAL_DAYS : 0,
    limits: { features: [...PLAN_FEATURES[name]] },
    isActive: true,
    isPublic: name !== "trial",
    isTrial: name === "trial",
    sortOrder: name === "trial" ? -1 : Object.keys(PLAN_FEATURES).indexOf(name),
    ...overrides,
  };
}

const TRIAL_PLAN = createPlanConfig("trial");
const PAID_PLANS: Array<PlanConfig & { prices: readonly number[] }> = [
  { ...createPlanConfig("gold", { sortOrder: 0 }), prices: TIER_PRICES.gold },
  {
    ...createPlanConfig("diamond", { sortOrder: 1 }),
    prices: TIER_PRICES.diamond,
  },
  {
    ...createPlanConfig("platinum", { sortOrder: 2 }),
    prices: TIER_PRICES.platinum,
  },
];

export async function seedPlans(): Promise<void> {
  console.log("Seeding subscription plans and pricing tiers...");

  // Seed trial plan with its single tier
  const [trialPlan] = await db
    .insert(schema.subscriptionPlans)
    .values({
      id: TRIAL_PLAN.id,
      name: TRIAL_PLAN.name,
      displayName: TRIAL_PLAN.displayName,
      description: TRIAL_PLAN.description,
      trialDays: TRIAL_PLAN.trialDays,
      limits: TRIAL_PLAN.limits,
      isActive: TRIAL_PLAN.isActive,
      isPublic: TRIAL_PLAN.isPublic,
      isTrial: TRIAL_PLAN.isTrial,
      sortOrder: TRIAL_PLAN.sortOrder,
    })
    .onConflictDoUpdate({
      target: schema.subscriptionPlans.id,
      set: {
        displayName: TRIAL_PLAN.displayName,
        description: TRIAL_PLAN.description,
        trialDays: TRIAL_PLAN.trialDays,
        limits: TRIAL_PLAN.limits,
        isActive: TRIAL_PLAN.isActive,
        isPublic: TRIAL_PLAN.isPublic,
        isTrial: TRIAL_PLAN.isTrial,
        sortOrder: TRIAL_PLAN.sortOrder,
      },
    })
    .returning();

  console.log(`  Created/updated trial plan: ${trialPlan.displayName}`);

  // Insert trial plan pricing tier (0-10 employees, free)
  const trialTierId = createTierId("trial", TRIAL_TIER.min, TRIAL_TIER.max);
  await db
    .insert(schema.planPricingTiers)
    .values({
      id: trialTierId,
      planId: TRIAL_PLAN.id,
      minEmployees: TRIAL_TIER.min,
      maxEmployees: TRIAL_TIER.max,
      priceMonthly: 0,
      priceYearly: 0,
    })
    .onConflictDoUpdate({
      target: schema.planPricingTiers.id,
      set: {
        priceMonthly: 0,
        priceYearly: 0,
      },
    });

  console.log("    Created trial plan pricing tier (0-10 employees, free)");

  // Seed paid plans with pricing tiers
  for (const planConfig of PAID_PLANS) {
    const [plan] = await db
      .insert(schema.subscriptionPlans)
      .values({
        id: planConfig.id,
        name: planConfig.name,
        displayName: planConfig.displayName,
        description: planConfig.description,
        trialDays: planConfig.trialDays,
        limits: planConfig.limits,
        isActive: planConfig.isActive,
        isPublic: planConfig.isPublic,
        isTrial: planConfig.isTrial,
        sortOrder: planConfig.sortOrder,
      })
      .onConflictDoUpdate({
        target: schema.subscriptionPlans.id,
        set: {
          displayName: planConfig.displayName,
          description: planConfig.description,
          trialDays: planConfig.trialDays,
          limits: planConfig.limits,
          isActive: planConfig.isActive,
          isPublic: planConfig.isPublic,
          isTrial: planConfig.isTrial,
          sortOrder: planConfig.sortOrder,
        },
      })
      .returning();

    console.log(`  Created/updated plan: ${plan.displayName}`);

    // Insert pricing tiers
    for (let i = 0; i < EMPLOYEE_TIERS.length; i++) {
      const tier = EMPLOYEE_TIERS[i];
      const priceMonthly = planConfig.prices[i];
      const priceYearly = calculateYearlyPrice(priceMonthly);
      const tierId = createTierId(
        planConfig.name as PaidPlanName,
        tier.min,
        tier.max
      );

      await db
        .insert(schema.planPricingTiers)
        .values({
          id: tierId,
          planId: planConfig.id,
          minEmployees: tier.min,
          maxEmployees: tier.max,
          priceMonthly,
          priceYearly,
        })
        .onConflictDoUpdate({
          target: schema.planPricingTiers.id,
          set: {
            priceMonthly,
            priceYearly,
          },
        });
    }

    console.log(`    Created ${EMPLOYEE_TIERS.length} pricing tiers`);
  }

  console.log("Seeding completed!");
}

// Allow running directly
if (import.meta.main) {
  seedPlans()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seeding failed:", err);
      process.exit(1);
    });
}
