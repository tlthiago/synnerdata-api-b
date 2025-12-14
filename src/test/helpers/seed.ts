import { db } from "@/db";
import { schema } from "@/db/schema";
import { testPlans } from "../fixtures/plans";

/**
 * Seeds subscription plans for testing.
 * Uses onConflictDoNothing to be idempotent.
 */
export async function seedPlans(): Promise<void> {
  for (const plan of testPlans) {
    await db
      .insert(schema.subscriptionPlans)
      .values(plan)
      .onConflictDoNothing({ target: schema.subscriptionPlans.id });
  }
}

/**
 * Gets a test plan by name.
 */
export function getTestPlan(name: "starter" | "pro" | "enterprise") {
  return testPlans.find((p) => p.name === name);
}
