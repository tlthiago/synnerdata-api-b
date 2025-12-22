/**
 * Production seed data for subscription plans and pricing tiers.
 *
 * This defines the 3 base plans (Gold, Diamond, Platinum) with their features
 * and 10 pricing tiers per plan based on employee count ranges.
 *
 * Run with: bun run db:seed
 */

import { db } from "@/db";
import {
  PLAN_FEATURES,
  type PlanLimits,
  schema,
  YEARLY_DISCOUNT,
} from "@/db/schema";

const calculateYearlyPrice = (monthlyPrice: number): number => {
  const yearlyFullPrice = monthlyPrice * 12;
  const discount = Math.round(yearlyFullPrice * YEARLY_DISCOUNT);
  return yearlyFullPrice - discount;
};

// Employee tier ranges
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

// Plan configurations
const PLANS_CONFIG = [
  {
    id: "plan-gold",
    name: "gold",
    displayName: "Ouro Insights",
    description: "Essencial para contratações eficazes",
    trialDays: 14,
    limits: {
      features: PLAN_FEATURES.gold as unknown as string[],
    } satisfies PlanLimits,
    isActive: true,
    isPublic: true,
    sortOrder: 0,
    prices: TIER_PRICES.gold,
  },
  {
    id: "plan-diamond",
    name: "diamond",
    displayName: "Diamante Analytics",
    description: "Todos os recursos premium",
    trialDays: 14,
    limits: {
      features: PLAN_FEATURES.diamond as unknown as string[],
    } satisfies PlanLimits,
    isActive: true,
    isPublic: true,
    sortOrder: 1,
    prices: TIER_PRICES.diamond,
  },
  {
    id: "plan-platinum",
    name: "platinum",
    displayName: "Platina Vision",
    description: "Recursos avançados de analytics",
    trialDays: 14,
    limits: {
      features: PLAN_FEATURES.platinum as unknown as string[],
    } satisfies PlanLimits,
    isActive: true,
    isPublic: true,
    sortOrder: 2,
    prices: TIER_PRICES.platinum,
  },
] as const;

export async function seedPlans(): Promise<void> {
  console.log("Seeding subscription plans and pricing tiers...");

  for (const planConfig of PLANS_CONFIG) {
    // Insert or update plan
    const [plan] = await db
      .insert(schema.subscriptionPlans)
      .values({
        id: planConfig.id,
        name: planConfig.name,
        displayName: planConfig.displayName,
        description: planConfig.description,
        priceMonthly: planConfig.prices[0], // Base price for plan listing
        priceYearly: calculateYearlyPrice(planConfig.prices[0]),
        trialDays: planConfig.trialDays,
        limits: planConfig.limits,
        isActive: planConfig.isActive,
        isPublic: planConfig.isPublic,
        sortOrder: planConfig.sortOrder,
      })
      .onConflictDoUpdate({
        target: schema.subscriptionPlans.id,
        set: {
          displayName: planConfig.displayName,
          description: planConfig.description,
          priceMonthly: planConfig.prices[0],
          priceYearly: calculateYearlyPrice(planConfig.prices[0]),
          trialDays: planConfig.trialDays,
          limits: planConfig.limits,
          isActive: planConfig.isActive,
          isPublic: planConfig.isPublic,
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
      const tierId = `tier-${planConfig.name}-${tier.min}-${tier.max}`;

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
