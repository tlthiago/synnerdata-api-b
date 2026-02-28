import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { EMPLOYEE_TIERS } from "../plans.constants";

const BASE_URL = env.API_URL;

function generateTierPrices(basePrice: number) {
  return EMPLOYEE_TIERS.map((tier, index) => ({
    minEmployees: tier.min,
    maxEmployees: tier.max,
    priceMonthly: basePrice + index * 1000,
  }));
}

const createdPlanIds: string[] = [];

describe("GET /payments/plans/:id/archived-tiers", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  afterAll(async () => {
    if (createdPlanIds.length > 0) {
      // Delete subscriptions first (FK restrict on pricingTierId)
      await db
        .delete(schema.orgSubscriptions)
        .where(inArray(schema.orgSubscriptions.planId, createdPlanIds));
      await db
        .delete(schema.planPricingTiers)
        .where(inArray(schema.planPricingTiers.planId, createdPlanIds));
      await db
        .delete(schema.subscriptionPlans)
        .where(inArray(schema.subscriptionPlans.id, createdPlanIds));
    }
  });

  test("should return empty array when no archived tiers", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/archived-tiers`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test("should return archived tiers with subscription count", async () => {
    const { plan, tiers: oldTiers } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    // Create active subscription on first tier
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });
    await SubscriptionFactory.create(organizationId, plan.id, {
      status: "active",
      pricingTierId: oldTiers[0].id,
    });

    // Replace tiers to archive the originals
    const newTiers = generateTierPrices(6000);
    await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ pricingTiers: newTiers }),
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/archived-tiers`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(oldTiers.length);

    // First tier should show 1 active subscription
    const firstArchivedTier = body.data.find(
      (t: { id: string }) => t.id === oldTiers[0].id
    );
    expect(firstArchivedTier).toBeDefined();
    expect(firstArchivedTier.activeSubscriptionCount).toBe(1);
    expect(firstArchivedTier.archivedAt).toBeDefined();
  });

  test("should reject unauthenticated requests", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/archived-tiers`)
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/archived-tiers`, {
        headers: nonAdminHeaders,
      })
    );
    expect(response.status).toBe(403);
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/plans/plan-non-existent/archived-tiers`,
        { headers: authHeaders }
      )
    );
    expect(response.status).toBe(404);
  });
});
