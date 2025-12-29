import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createPaidPlan } from "@/test/factories/plan";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestAdminUser, createTestUser } from "@/test/helpers/user";
import { EMPLOYEE_TIERS, PLAN_FEATURES } from "../plans.constants";

const BASE_URL = env.API_URL;

const DIAMOND_FEATURES = [...PLAN_FEATURES.diamond];

function generateTierPrices(basePrice: number) {
  return EMPLOYEE_TIERS.map((tier, index) => ({
    minEmployees: tier.min,
    maxEmployees: tier.max,
    priceMonthly: basePrice + index * 1000,
  }));
}

describe("PUT /payments/plans/:id", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await createTestAdminUser({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const { plan } = await createPaidPlan("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Name" }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { plan } = await createPaidPlan("gold");
    const { headers: nonAdminHeaders } = await createTestUser({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...nonAdminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Name" }),
      })
    );
    expect(response.status).toBe(403);
  });

  test("should update plan displayName", async () => {
    const { plan } = await createPaidPlan("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Display Name" }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.displayName).toBe("Updated Display Name");
    expect(body.data.name).toBe(plan.name);
  });

  test("should update plan limits with valid features", async () => {
    const { plan } = await createPaidPlan("gold");
    const newLimits = { features: DIAMOND_FEATURES };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ limits: newLimits }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.limits).toEqual(newLimits);
  });

  test("should update plan status flags", async () => {
    const { plan } = await createPaidPlan("diamond");

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
    expect(body.success).toBe(true);
    expect(body.data.isActive).toBe(false);
    expect(body.data.isPublic).toBe(false);
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/plan-non-existent-id`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Name" }),
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });

  test("should preserve plan name when updating other fields", async () => {
    const { plan } = await createPaidPlan("platinum");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Display" }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe(plan.name);
    expect(body.data.displayName).toBe("Updated Display");
  });

  test("should update multiple fields at once", async () => {
    const { plan } = await createPaidPlan("gold");

    const updateData = {
      displayName: "Multi Update Plan",
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
    expect(body.success).toBe(true);
    expect(body.data.displayName).toBe(updateData.displayName);
    expect(body.data.trialDays).toBe(updateData.trialDays);
    expect(body.data.sortOrder).toBe(updateData.sortOrder);
  });

  test("should update all pricing tiers at once", async () => {
    const { plan } = await createPaidPlan("diamond");
    const newTiers = generateTierPrices(5000);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ pricingTiers: newTiers }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.pricingTiers[0].priceMonthly).toBe(5000);
    expect(body.data.startingPriceMonthly).toBe(5000);
  });
});
