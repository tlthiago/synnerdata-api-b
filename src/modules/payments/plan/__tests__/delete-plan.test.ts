import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createTestUser } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("DELETE /payments/plans/:id", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;
  const createdPlanIds: string[] = [];

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
    const { headers } = await createTestUser({ emailVerified: true });
    authHeaders = headers;
  });

  afterAll(async () => {
    for (const planId of createdPlanIds) {
      await db
        .delete(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId));
    }
  });

  function removeFromCleanup(planId: string) {
    const idx = createdPlanIds.indexOf(planId);
    if (idx > -1) {
      createdPlanIds.splice(idx, 1);
    }
  }

  async function createTestPlan(name: string) {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          displayName: `Test ${name}`,
          priceMonthly: 1000,
          priceYearly: 10_000,
          limits: {
            maxMembers: 5,
            maxProjects: 10,
            maxStorage: 1000,
            features: ["basic"],
          },
        }),
      })
    );
    const plan = await response.json();
    createdPlanIds.push(plan.id);
    return plan;
  }

  test("should reject unauthenticated requests", async () => {
    const plan = await createTestPlan(`delete-unauth-${Date.now()}`);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "DELETE",
      })
    );
    expect(response.status).toBe(401);
  });

  test("should delete plan successfully", async () => {
    const plan = await createTestPlan(`delete-simple-${Date.now()}`);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    // Remove from cleanup array since it's already deleted
    removeFromCleanup(plan.id);

    // Verify plan was deleted
    const [deletedPlan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, plan.id))
      .limit(1);
    expect(deletedPlan).toBeUndefined();
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/non-existent-plan-id`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.code).toBe("PLAN_NOT_FOUND");
  });
});
