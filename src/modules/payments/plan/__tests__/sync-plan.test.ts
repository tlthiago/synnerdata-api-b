import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createTestUser } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /payments/plans/:id/sync", () => {
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
    // Clean up created plans and reset pagarmePlanId
    for (const planId of createdPlanIds) {
      await db
        .delete(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId));
    }
  });

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
    const plan = await createTestPlan(`sync-unauth-${Date.now()}`);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
        method: "POST",
      })
    );
    expect(response.status).toBe(401);
  });

  test("should sync plan to Pagarme and return pagarmePlanId", async () => {
    const plan = await createTestPlan(`sync-new-${Date.now()}`);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
        method: "POST",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.id).toBe(plan.id);
    expect(body.pagarmePlanId).toBeDefined();
    expect(body.pagarmePlanId).toStartWith("plan_");

    // Verify pagarmePlanId was saved in database
    const [dbPlan] = await db
      .select({ pagarmePlanId: subscriptionPlans.pagarmePlanId })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, plan.id))
      .limit(1);

    expect(dbPlan.pagarmePlanId).toBe(body.pagarmePlanId);
  });

  test("should return existing pagarmePlanId if already synced", async () => {
    const plan = await createTestPlan(`sync-existing-${Date.now()}`);

    // First sync
    const firstResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
        method: "POST",
        headers: authHeaders,
      })
    );
    expect(firstResponse.status).toBe(200);
    const firstBody = await firstResponse.json();
    const pagarmePlanId = firstBody.pagarmePlanId;

    // Second sync - should return same ID without creating new plan
    const secondResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
        method: "POST",
        headers: authHeaders,
      })
    );
    expect(secondResponse.status).toBe(200);

    const secondBody = await secondResponse.json();
    expect(secondBody.pagarmePlanId).toBe(pagarmePlanId);
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/non-existent-plan-id/sync`, {
        method: "POST",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.code).toBe("PLAN_NOT_FOUND");
  });

  test("should sync plan with correct data to Pagarme", async () => {
    const planData = {
      name: `sync-data-${Date.now()}`,
      displayName: "Sync Data Test Plan",
      priceMonthly: 9900,
      priceYearly: 99_000,
      limits: {
        maxMembers: 10,
        maxProjects: 25,
        maxStorage: 5000,
        features: ["basic", "advanced"],
      },
    };

    const createResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );
    const plan = await createResponse.json();
    createdPlanIds.push(plan.id);

    const syncResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
        method: "POST",
        headers: authHeaders,
      })
    );
    expect(syncResponse.status).toBe(200);

    const body = await syncResponse.json();
    expect(body.id).toBe(plan.id);
    expect(body.pagarmePlanId).toBeDefined();
  });
});
