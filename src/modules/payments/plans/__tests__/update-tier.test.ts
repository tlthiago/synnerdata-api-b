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

describe("PATCH /payments/plans/:planId/tiers/:tierId", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tierId = tiers[0].id;

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers/${tierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceMonthly: 50_000 }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tierId = tiers[0].id;
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers/${tierId}`, {
        method: "PATCH",
        headers: { ...nonAdminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ priceMonthly: 50_000 }),
      })
    );
    expect(response.status).toBe(403);
  });

  test("should update tier price and recalculate yearly", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tierId = tiers[0].id;
    const newPriceMonthly = 45_000;

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers/${tierId}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ priceMonthly: newPriceMonthly }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.priceMonthly).toBe(newPriceMonthly);
    expect(body.data.priceYearly).toBe(calculateYearlyPrice(newPriceMonthly));
  });

  test("should invalidate Pagar.me plan cache on price update", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("diamond");
    const tierId = tiers[0].id;

    // Set fake Pagar.me IDs to simulate cached state
    await db
      .update(schema.planPricingTiers)
      .set({
        pagarmePlanIdMonthly: "pagarme_monthly_123",
        pagarmePlanIdYearly: "pagarme_yearly_123",
      })
      .where(eq(schema.planPricingTiers.id, tierId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers/${tierId}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ priceMonthly: 55_000 }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.pagarmePlanIdMonthly).toBeNull();
    expect(body.data.pagarmePlanIdYearly).toBeNull();

    // Verify in database
    const [dbTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tierId))
      .limit(1);

    expect(dbTier.pagarmePlanIdMonthly).toBeNull();
    expect(dbTier.pagarmePlanIdYearly).toBeNull();
  });

  test("should return 404 for non-existent tier", async () => {
    const { plan } = await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/plans/${plan.id}/tiers/tier-non-existent`,
        {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ priceMonthly: 50_000 }),
        }
      )
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("TIER_NOT_FOUND");
  });

  test("should return 404 for tier belonging to another plan", async () => {
    const { plan: plan1 } = await PlanFactory.createPaid("gold");
    const { tiers: tiers2 } = await PlanFactory.createPaid("diamond");

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/plans/${plan1.id}/tiers/${tiers2[0].id}`,
        {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ priceMonthly: 50_000 }),
        }
      )
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("TIER_NOT_FOUND");
  });

  test("should preserve tier range when updating price", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("platinum");
    const tier = tiers[3];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers/${tier.id}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ priceMonthly: 99_999 }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.minEmployees).toBe(tier.minEmployees);
    expect(body.data.maxEmployees).toBe(tier.maxEmployees);
    expect(body.data.priceMonthly).toBe(99_999);
  });
});
