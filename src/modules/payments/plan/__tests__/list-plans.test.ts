import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";

const BASE_URL = env.API_URL;

describe("GET /payments/plans", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should list plans without authentication (public route)", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.plans).toBeArray();
    expect(body.data.plans.length).toBeGreaterThan(0);
  });

  test("should return only active and public plans", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();

    for (const plan of body.data.plans) {
      expect(plan.isActive).toBe(true);
      expect(plan.isPublic).toBe(true);
    }
  });

  test("should not return inactive or private plans", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();

    const legacyPlan = body.data.plans.find(
      (p: { name: string }) => p.name === "legacy"
    );
    expect(legacyPlan).toBeUndefined();
  });

  test("should return plans ordered by sortOrder", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();
    const plans = body.data.plans;

    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].sortOrder).toBeGreaterThanOrEqual(plans[i - 1].sortOrder);
    }
  });

  test("should return correct plan properties", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();
    const plan = body.data.plans[0];

    expect(plan).toHaveProperty("id");
    expect(plan).toHaveProperty("name");
    expect(plan).toHaveProperty("displayName");
    expect(plan).toHaveProperty("priceMonthly");
    expect(plan).toHaveProperty("priceYearly");
    expect(plan).toHaveProperty("trialDays");
    expect(plan).toHaveProperty("limits");
    expect(plan).toHaveProperty("isActive");
    expect(plan).toHaveProperty("isPublic");
    expect(plan).toHaveProperty("sortOrder");
  });

  test("should return plan limits with correct structure", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();
    const plan = body.data.plans.find(
      (p: { limits: unknown }) => p.limits !== null
    );

    if (plan?.limits) {
      expect(plan.limits).toHaveProperty("maxMembers");
      expect(plan.limits).toHaveProperty("maxProjects");
      expect(plan.limits).toHaveProperty("maxStorage");
      expect(plan.limits).toHaveProperty("features");
      expect(plan.limits.features).toBeArray();
    }
  });
});
