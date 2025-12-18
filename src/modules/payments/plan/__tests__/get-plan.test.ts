import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { proPlan, testPlans } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";

const BASE_URL = env.API_URL;

describe("GET /payments/plans/:id", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should get plan by id without authentication (public route)", async () => {
    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${proPlan.id}`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(proPlan.id);
    expect(body.data.name).toBe(proPlan.name);
    expect(body.data.displayName).toBe(proPlan.displayName);
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/non-existent-plan-id`)
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });

  test("should return inactive plans (no filter on get by id)", async () => {
    const inactivePlan = testPlans.find((p) => !p.isActive);
    if (!inactivePlan) {
      throw new Error("No inactive plan in fixtures");
    }

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${inactivePlan.id}`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(inactivePlan.id);
    expect(body.data.isActive).toBe(false);
  });

  test("should return all plan properties", async () => {
    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${proPlan.id}`)
    );
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(proPlan.id);
    expect(body.data.name).toBe(proPlan.name);
    expect(body.data.displayName).toBe(proPlan.displayName);
    expect(body.data.priceMonthly).toBe(proPlan.priceMonthly);
    expect(body.data.priceYearly).toBe(proPlan.priceYearly);
    expect(body.data.trialDays).toBe(proPlan.trialDays);
    expect(body.data.limits).toEqual(proPlan.limits);
    expect(body.data.isActive).toBe(proPlan.isActive);
    expect(body.data.isPublic).toBe(proPlan.isPublic);
    expect(body.data.sortOrder).toBe(proPlan.sortOrder);
  });

  test("should handle empty id parameter", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/`)
    );
    // Empty id should hit the list endpoint
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.plans).toBeArray();
  });
});
