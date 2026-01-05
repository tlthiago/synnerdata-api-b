import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("GET /payments/plans", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should list plans without authentication (public route)", async () => {
    await PlanFactory.createPaid("gold");

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
    const { plan: activePlan } = await PlanFactory.createPaid("diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();

    for (const plan of body.data.plans) {
      expect(plan.isActive).toBe(true);
      expect(plan.isPublic).toBe(true);
    }

    const foundPlan = body.data.plans.find(
      (p: { id: string }) => p.id === activePlan.id
    );
    expect(foundPlan).toBeDefined();
  });

  test("should not return inactive plans", async () => {
    const { plan: inactivePlan } = await PlanFactory.createInactive({
      type: "gold",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();

    const foundPlan = body.data.plans.find(
      (p: { id: string }) => p.id === inactivePlan.id
    );
    expect(foundPlan).toBeUndefined();
  });

  test("should not return private plans", async () => {
    const { plan: privatePlan } = await PlanFactory.createPaid("platinum", {
      isPublic: false,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();

    const foundPlan = body.data.plans.find(
      (p: { id: string }) => p.id === privatePlan.id
    );
    expect(foundPlan).toBeUndefined();
  });

  test("should return plans ordered by sortOrder", async () => {
    await PlanFactory.createPaid("gold", { sortOrder: 10 });
    await PlanFactory.createPaid("diamond", { sortOrder: 20 });

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
    await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();
    const plan = body.data.plans[0];

    expect(plan).toHaveProperty("id");
    expect(plan).toHaveProperty("name");
    expect(plan).toHaveProperty("displayName");
    expect(plan).toHaveProperty("description");
    expect(plan).toHaveProperty("startingPriceMonthly");
    expect(plan).toHaveProperty("startingPriceYearly");
    expect(plan).toHaveProperty("trialDays");
    expect(plan).toHaveProperty("limits");
    expect(plan).toHaveProperty("isActive");
    expect(plan).toHaveProperty("isPublic");
    expect(plan).toHaveProperty("sortOrder");
    expect(plan).toHaveProperty("pricingTiers");
    expect(plan.pricingTiers).toBeArray();
  });

  test("should return plan limits with features array", async () => {
    const { plan: createdPlan } = await PlanFactory.createPaid("diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();

    const plan = body.data.plans.find(
      (p: { id: string }) => p.id === createdPlan.id
    );

    expect(plan).toBeDefined();
    expect(plan.limits).toHaveProperty("features");
    expect(plan.limits.features).toBeArray();
    expect(plan.limits.features.length).toBeGreaterThan(0);
  });

  test("should return pricing tiers with correct structure", async () => {
    const { plan: createdPlan } = await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`)
    );
    const body = await response.json();

    const plan = body.data.plans.find(
      (p: { id: string }) => p.id === createdPlan.id
    );

    expect(plan).toBeDefined();
    expect(plan.pricingTiers).toBeArray();
    expect(plan.pricingTiers.length).toBe(10);

    const tier = plan.pricingTiers[0];
    expect(tier).toHaveProperty("id");
    expect(tier).toHaveProperty("minEmployees");
    expect(tier).toHaveProperty("maxEmployees");
    expect(tier).toHaveProperty("priceMonthly");
    expect(tier).toHaveProperty("priceYearly");
  });
});
