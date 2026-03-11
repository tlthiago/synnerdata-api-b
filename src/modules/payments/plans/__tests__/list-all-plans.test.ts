import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("GET /payments/plans/all", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/all`)
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/all`, {
        headers: nonAdminHeaders,
      })
    );
    expect(response.status).toBe(403);
  });

  test("should list all plans with admin authentication", async () => {
    await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/all`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("should include inactive plans", async () => {
    const { plan: inactivePlan } = await PlanFactory.createInactive({
      type: "diamond",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/all`, {
        headers: authHeaders,
      })
    );
    const body = await response.json();

    const foundPlan = body.data.find(
      (p: { id: string }) => p.id === inactivePlan.id
    );
    expect(foundPlan).toBeDefined();
    expect(foundPlan.isActive).toBe(false);
  });

  test("should include private plans", async () => {
    const { plan: privatePlan } = await PlanFactory.createPaid("platinum", {
      isPublic: false,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/all`, {
        headers: authHeaders,
      })
    );
    const body = await response.json();

    const foundPlan = body.data.find(
      (p: { id: string }) => p.id === privatePlan.id
    );
    expect(foundPlan).toBeDefined();
    expect(foundPlan.isPublic).toBe(false);
  });

  test("should return plans ordered by sortOrder", async () => {
    await PlanFactory.createPaid("gold", { sortOrder: 100 });
    await PlanFactory.createPaid("diamond", { sortOrder: 200 });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/all`, {
        headers: authHeaders,
      })
    );
    const body = await response.json();
    const plans = body.data;

    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].sortOrder).toBeGreaterThanOrEqual(plans[i - 1].sortOrder);
    }
  });

  test("should return correct plan properties with pricing tiers", async () => {
    const { plan: createdPlan } = await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/all`, {
        headers: authHeaders,
      })
    );
    const body = await response.json();

    const plan = body.data.find((p: { id: string }) => p.id === createdPlan.id);

    expect(plan).toBeDefined();
    expect(plan).toHaveProperty("id");
    expect(plan).toHaveProperty("name");
    expect(plan).toHaveProperty("displayName");
    expect(plan).toHaveProperty("description");
    expect(plan).toHaveProperty("startingPriceMonthly");
    expect(plan).toHaveProperty("startingPriceYearly");
    expect(plan).toHaveProperty("trialDays");
    expect(plan).toHaveProperty("features");
    expect(plan).toHaveProperty("yearlyDiscountPercent");
    expect(plan).toHaveProperty("isActive");
    expect(plan).toHaveProperty("isPublic");
    expect(plan).toHaveProperty("isTrial");
    expect(plan).toHaveProperty("sortOrder");
    expect(plan).toHaveProperty("limits");
    expect(plan).toHaveProperty("pricingTiers");
    expect(plan.pricingTiers).toBeArray();
    expect(plan.limits).toBeArray();
  });

  test("should exclude custom (org-specific) plans", async () => {
    const { plan: basePlan } = await PlanFactory.createPaid("diamond");
    const org = await OrganizationFactory.create();

    const { plan: customPlan } = await PlanFactory.createCustom({
      organizationId: org.id,
      basePlanId: basePlan.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/all`, {
        headers: authHeaders,
      })
    );
    const body = await response.json();

    const foundCustom = body.data.find(
      (p: { id: string }) => p.id === customPlan.id
    );
    expect(foundCustom).toBeUndefined();

    const foundBase = body.data.find(
      (p: { id: string }) => p.id === basePlan.id
    );
    expect(foundBase).toBeDefined();
  });
});
