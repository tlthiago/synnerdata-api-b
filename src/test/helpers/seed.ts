import { inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { testPlans, testPricingTiers } from "@/test/fixtures/plans";

/**
 * Seeds subscription plans and pricing tiers for testing.
 * Clears existing data and replaces with current fixture data.
 */
export async function seedPlans(): Promise<void> {
  const testPlanIds = testPlans.map((p) => p.id);
  const testPlanNames = testPlans.map((p) => p.name);

  // Find all plan IDs that match test plan IDs or names (includes production plans)
  const existingPlans = await db
    .select({ id: schema.subscriptionPlans.id })
    .from(schema.subscriptionPlans)
    .where(
      or(
        inArray(schema.subscriptionPlans.id, testPlanIds),
        inArray(schema.subscriptionPlans.name, testPlanNames)
      )
    );
  const allPlanIdsToClean = existingPlans.map((p) => p.id);

  if (allPlanIdsToClean.length > 0) {
    // Clear pending checkouts
    await db
      .delete(schema.pendingCheckouts)
      .where(inArray(schema.pendingCheckouts.planId, allPlanIdsToClean));

    // Clear org subscriptions
    await db
      .delete(schema.orgSubscriptions)
      .where(inArray(schema.orgSubscriptions.planId, allPlanIdsToClean));

    // Clear pricing tiers
    await db
      .delete(schema.planPricingTiers)
      .where(inArray(schema.planPricingTiers.planId, allPlanIdsToClean));

    // Clear plans
    await db
      .delete(schema.subscriptionPlans)
      .where(inArray(schema.subscriptionPlans.id, allPlanIdsToClean));
  }

  // Seed plans
  for (const plan of testPlans) {
    await db.insert(schema.subscriptionPlans).values(plan);
  }

  // Seed pricing tiers
  for (const tier of testPricingTiers) {
    await db.insert(schema.planPricingTiers).values(tier);
  }
}

/**
 * Gets a test plan by name.
 */
export function getTestPlan(name: "trial" | "gold" | "diamond" | "platinum") {
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
