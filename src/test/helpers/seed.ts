import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { allPlans, allTiers, type planMap } from "@/test/fixtures/plans";

let seeded = false;

/**
 * Seeds the test database with plan fixtures.
 * Safe to call multiple times - only seeds once per test run.
 */
export async function seedPlans(): Promise<void> {
  if (seeded) {
    return;
  }

  // Check if plans already exist
  const [existingPlan] = await db
    .select({ id: schema.subscriptionPlans.id })
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, "test-plan-gold"))
    .limit(1);

  if (existingPlan) {
    seeded = true;
    return;
  }

  // Insert plans
  await db.insert(schema.subscriptionPlans).values(
    allPlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      description: plan.description,
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      isTrial: plan.isTrial,
      trialDays: plan.trialDays,
      limits: plan.limits,
      sortOrder: plan.sortOrder,
    }))
  );

  // Insert pricing tiers
  await db.insert(schema.planPricingTiers).values(
    allTiers.map((tier) => ({
      id: tier.id,
      planId: tier.planId,
      minEmployees: tier.minEmployees,
      maxEmployees: tier.maxEmployees,
      priceMonthly: tier.priceMonthly,
      priceYearly: tier.priceYearly,
    }))
  );

  seeded = true;
}

/**
 * Gets a test plan by type.
 */
export function getTestPlan(type: keyof typeof planMap) {
  const { planMap: plans } = require("@/test/fixtures/plans");
  return plans[type];
}
