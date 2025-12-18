import { db } from "@/db";
import { schema } from "@/db/schema";
import { testPlans, testPricingTiers } from "@/test/fixtures/plans";

/**
 * Seeds subscription plans and pricing tiers for testing.
 * Uses onConflictDoNothing to be idempotent.
 */
export async function seedPlans(): Promise<void> {
  // Seed plans first
  for (const plan of testPlans) {
    await db
      .insert(schema.subscriptionPlans)
      .values(plan)
      .onConflictDoNothing({ target: schema.subscriptionPlans.id });
  }

  // Seed pricing tiers
  for (const tier of testPricingTiers) {
    await db
      .insert(schema.planPricingTiers)
      .values(tier)
      .onConflictDoNothing({ target: schema.planPricingTiers.id });
  }
}

/**
 * Gets a test plan by name.
 */
export function getTestPlan(name: "gold" | "diamond" | "platinum") {
  return testPlans.find((p) => p.name === name);
}

/**
 * Gets a test pricing tier for a plan and employee count.
 */
export function getTestPricingTier(planId: string, employeeCount: number) {
  return testPricingTiers.find(
    (t) =>
      t.planId === planId &&
      employeeCount >= t.minEmployees &&
      employeeCount <= t.maxEmployees
  );
}
