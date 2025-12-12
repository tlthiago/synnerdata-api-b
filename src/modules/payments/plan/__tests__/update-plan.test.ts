import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUser } from "@/test/helpers/auth";
import { seedPlans } from "@/test/helpers/db";

const BASE_URL = env.API_URL;

describe("PUT /payments/plans/:id", () => {
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
    // Clean up created plans
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
    const plan = await createTestPlan(`update-unauth-${Date.now()}`);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Name" }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("should update plan displayName", async () => {
    const plan = await createTestPlan(`update-display-${Date.now()}`);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Display Name" }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.displayName).toBe("Updated Display Name");
    expect(body.name).toBe(plan.name); // Should remain unchanged
  });

  test("should update plan prices", async () => {
    const plan = await createTestPlan(`update-prices-${Date.now()}`);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          priceMonthly: 5900,
          priceYearly: 59_000,
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.priceMonthly).toBe(5900);
    expect(body.priceYearly).toBe(59_000);
  });

  test("should update plan limits", async () => {
    const plan = await createTestPlan(`update-limits-${Date.now()}`);
    const newLimits = {
      maxMembers: 20,
      maxProjects: 50,
      maxStorage: 10_000,
      features: ["basic", "advanced", "premium"],
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ limits: newLimits }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.limits).toEqual(newLimits);
  });

  test("should update plan status flags", async () => {
    const plan = await createTestPlan(`update-flags-${Date.now()}`);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: false,
          isPublic: false,
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.isActive).toBe(false);
    expect(body.isPublic).toBe(false);
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/non-existent-plan-id`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Name" }),
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.code).toBe("PLAN_NOT_FOUND");
  });

  test("should reject duplicate name when updating", async () => {
    const plan1 = await createTestPlan(`update-dup1-${Date.now()}`);
    const plan2 = await createTestPlan(`update-dup2-${Date.now()}`);

    // Try to update plan2 with plan1's name
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan2.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: plan1.name }),
      })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.code).toBe("PLAN_NAME_ALREADY_EXISTS");
  });

  test("should allow updating name to same value", async () => {
    const plan = await createTestPlan(`update-same-${Date.now()}`);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: plan.name }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe(plan.name);
  });

  test("should update multiple fields at once", async () => {
    const plan = await createTestPlan(`update-multi-${Date.now()}`);

    const updateData = {
      displayName: "Multi Update Plan",
      priceMonthly: 7900,
      priceYearly: 79_000,
      trialDays: 30,
      sortOrder: 99,
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.displayName).toBe(updateData.displayName);
    expect(body.priceMonthly).toBe(updateData.priceMonthly);
    expect(body.priceYearly).toBe(updateData.priceYearly);
    expect(body.trialDays).toBe(updateData.trialDays);
    expect(body.sortOrder).toBe(updateData.sortOrder);
  });
});
