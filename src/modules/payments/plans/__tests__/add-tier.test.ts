import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { calculateYearlyPrice } from "@/modules/payments/plans/plans.constants";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("POST /payments/plans/:planId/tiers", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  async function createPlanWithoutTiers() {
    const planId = `plan-${crypto.randomUUID()}`;
    const [plan] = await db
      .insert(schema.subscriptionPlans)
      .values({
        id: planId,
        name: `test-${planId.slice(-8)}`,
        displayName: "Test Plan",
        isActive: true,
        isPublic: true,
        isTrial: false,
        trialDays: 0,
        limits: { features: ["absences"] },
        sortOrder: 0,
      })
      .returning();
    return plan;
  }

  test("should reject unauthenticated requests", async () => {
    const { plan } = await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 181,
          maxEmployees: 200,
          priceMonthly: 50_000,
        }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        method: "POST",
        headers: { ...nonAdminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 181,
          maxEmployees: 200,
          priceMonthly: 50_000,
        }),
      })
    );
    expect(response.status).toBe(403);
  });

  test("should add first tier to a plan with no tiers", async () => {
    const plan = await createPlanWithoutTiers();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 0,
          maxEmployees: 10,
          priceMonthly: 39_900,
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.minEmployees).toBe(0);
    expect(body.data.maxEmployees).toBe(10);
    expect(body.data.priceMonthly).toBe(39_900);
    expect(body.data.priceYearly).toBe(calculateYearlyPrice(39_900));
    expect(body.data.pagarmePlanIdMonthly).toBeNull();
    expect(body.data.pagarmePlanIdYearly).toBeNull();
  });

  test("should add contiguous tier after existing tiers", async () => {
    const plan = await createPlanWithoutTiers();

    // Add first tier
    await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 0,
          maxEmployees: 10,
          priceMonthly: 39_900,
        }),
      })
    );

    // Add contiguous second tier
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 11,
          maxEmployees: 20,
          priceMonthly: 49_900,
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.minEmployees).toBe(11);
    expect(body.data.maxEmployees).toBe(20);
  });

  test("should reject overlapping tier range", async () => {
    const { plan } = await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 5,
          maxEmployees: 15,
          priceMonthly: 50_000,
        }),
      })
    );
    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.error.code).toBe("TIER_OVERLAP");
  });

  test("should reject non-contiguous tier range", async () => {
    const plan = await createPlanWithoutTiers();

    // Add first tier (0-10)
    await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 0,
          maxEmployees: 10,
          priceMonthly: 39_900,
        }),
      })
    );

    // Try to add non-contiguous tier (21-30 instead of 11-20)
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 21,
          maxEmployees: 30,
          priceMonthly: 59_900,
        }),
      })
    );
    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.error.code).toBe("TIER_GAP");
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/plan-non-existent-id/tiers`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 0,
          maxEmployees: 10,
          priceMonthly: 39_900,
        }),
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });

  test("should persist tier in database", async () => {
    const plan = await createPlanWithoutTiers();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          minEmployees: 0,
          maxEmployees: 10,
          priceMonthly: 39_900,
        }),
      })
    );
    const body = await response.json();

    const [dbTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, body.data.id))
      .limit(1);

    expect(dbTier).toBeDefined();
    expect(dbTier.planId).toBe(plan.id);
    expect(dbTier.priceMonthly).toBe(39_900);
  });
});
