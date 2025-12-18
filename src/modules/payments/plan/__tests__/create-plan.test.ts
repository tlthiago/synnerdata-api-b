import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createTestAdminUser } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /payments/plans", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;
  const createdPlanIds: string[] = [];

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
    const { headers } = await createTestAdminUser({ emailVerified: true });
    authHeaders = headers;
  });

  afterAll(async () => {
    // Clean up created plans
    for (const planId of createdPlanIds) {
      await db
        .delete(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, planId));
    }
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "test-plan",
          displayName: "Test Plan",
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
    expect(response.status).toBe(401);
  });

  test("should create plan with valid data", async () => {
    const planData = {
      name: `test-create-${Date.now()}`,
      displayName: "Test Create Plan",
      priceMonthly: 4900,
      priceYearly: 49_000,
      trialDays: 7,
      limits: {
        maxMembers: 10,
        maxProjects: 20,
        maxStorage: 5000,
        features: ["basic", "advanced"],
      },
      isActive: true,
      isPublic: true,
      sortOrder: 10,
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    createdPlanIds.push(body.data.id);

    expect(body.success).toBe(true);
    expect(body.data.id).toStartWith("plan-");
    expect(body.data.name).toBe(planData.name);
    expect(body.data.displayName).toBe(planData.displayName);
    expect(body.data.priceMonthly).toBe(planData.priceMonthly);
    expect(body.data.priceYearly).toBe(planData.priceYearly);
    expect(body.data.trialDays).toBe(planData.trialDays);
    expect(body.data.limits).toEqual(planData.limits);
    expect(body.data.isActive).toBe(planData.isActive);
    expect(body.data.isPublic).toBe(planData.isPublic);
    expect(body.data.sortOrder).toBe(planData.sortOrder);
  });

  test("should reject duplicate plan name", async () => {
    const planData = {
      name: `test-duplicate-${Date.now()}`,
      displayName: "Test Duplicate Plan",
      priceMonthly: 1000,
      priceYearly: 10_000,
      limits: {
        maxMembers: 5,
        maxProjects: 10,
        maxStorage: 1000,
        features: ["basic"],
      },
    };

    // Create first plan
    const firstResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );
    expect(firstResponse.status).toBe(200);
    const firstBody = await firstResponse.json();
    createdPlanIds.push(firstBody.data.id);

    // Try to create second plan with same name
    const secondResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );
    expect(secondResponse.status).toBe(400);

    const errorBody = await secondResponse.json();
    expect(errorBody.error.code).toBe("PLAN_NAME_ALREADY_EXISTS");
  });

  test("should reject invalid data - missing required fields", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "incomplete-plan",
          // Missing displayName, priceMonthly, priceYearly, limits
        }),
      })
    );
    expect(response.status).toBe(422);
  });

  test("should reject invalid data - negative price", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "negative-price-plan",
          displayName: "Negative Price Plan",
          priceMonthly: -100,
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
    expect(response.status).toBe(422);
  });

  test("should apply default values for optional fields", async () => {
    const planData = {
      name: `test-defaults-${Date.now()}`,
      displayName: "Test Defaults Plan",
      priceMonthly: 1000,
      priceYearly: 10_000,
      limits: {
        maxMembers: 5,
        maxProjects: 10,
        maxStorage: 1000,
        features: ["basic"],
      },
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    createdPlanIds.push(body.data.id);

    expect(body.success).toBe(true);
    expect(body.data.trialDays).toBe(14);
    expect(body.data.isActive).toBe(true);
    expect(body.data.isPublic).toBe(true);
    expect(body.data.sortOrder).toBe(0);
  });
});
