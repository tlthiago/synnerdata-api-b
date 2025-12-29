import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import {
  createInactivePlan,
  createPaidPlan,
  getFirstTier,
} from "@/test/factories/plan";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestAdminUser, createTestUser } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /payments/plans/:id", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await createTestAdminUser({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const { plan } = await createPaidPlan("diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`)
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { plan } = await createPaidPlan("diamond");
    const { headers: nonAdminHeaders } = await createTestUser({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        headers: nonAdminHeaders,
      })
    );
    expect(response.status).toBe(403);
  });

  test("should get plan by id with admin authentication", async () => {
    const { plan } = await createPaidPlan("diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(plan.id);
    expect(body.data.name).toBe(plan.name);
    expect(body.data.displayName).toBe(plan.displayName);
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/plan-non-existent-id`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });

  test("should return inactive plans (no filter on get by id)", async () => {
    const { plan: inactivePlan } = await createInactivePlan({ type: "gold" });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${inactivePlan.id}`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(inactivePlan.id);
    expect(body.data.isActive).toBe(false);
  });

  test("should return all plan properties", async () => {
    const result = await createPaidPlan("diamond");
    const { plan } = result;
    const tier = getFirstTier(result);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        headers: authHeaders,
      })
    );
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(plan.id);
    expect(body.data.name).toBe(plan.name);
    expect(body.data.displayName).toBe(plan.displayName);
    expect(body.data.startingPriceMonthly).toBe(tier.priceMonthly);
    expect(body.data.startingPriceYearly).toBe(tier.priceYearly);
    expect(body.data.trialDays).toBe(plan.trialDays);
    expect(body.data.limits).toEqual(plan.limits);
    expect(body.data.isActive).toBe(plan.isActive);
    expect(body.data.isPublic).toBe(plan.isPublic);
    expect(body.data.sortOrder).toBe(plan.sortOrder);
    expect(body.data.pricingTiers).toBeArray();
    expect(body.data.pricingTiers.length).toBe(10);
  });
});
