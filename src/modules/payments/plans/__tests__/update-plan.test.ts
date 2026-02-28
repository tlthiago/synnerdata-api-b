import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { LimitsService } from "@/modules/payments/limits/limits.service";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
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

// Track created plans for cleanup
const createdPlanIds: string[] = [];

describe("PUT /payments/plans/:id", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  afterAll(async () => {
    // Cleanup: delete subscriptions, pricing tiers, and plans created during tests
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

  test("should reject unauthenticated requests", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

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
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);
    const { headers: nonAdminHeaders } = await UserFactory.create({
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
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

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
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);
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
    const { plan } = await PlanFactory.createPaid("diamond");
    createdPlanIds.push(plan.id);

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
    const { plan } = await PlanFactory.createPaid("platinum");
    createdPlanIds.push(plan.id);

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
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

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
    const { plan } = await PlanFactory.createPaid("diamond");
    createdPlanIds.push(plan.id);
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

  test("should archive old tiers when updating pricing tiers", async () => {
    const { plan, tiers: oldTiers } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);
    const newTiers = generateTierPrices(5000);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ pricingTiers: newTiers }),
      })
    );
    expect(response.status).toBe(200);

    // Verify old tiers still exist in DB but are archived
    const archivedTiers = await db
      .select()
      .from(schema.planPricingTiers)
      .where(
        and(
          eq(schema.planPricingTiers.planId, plan.id),
          isNotNull(schema.planPricingTiers.archivedAt)
        )
      );

    expect(archivedTiers.length).toBe(oldTiers.length);

    for (const tier of archivedTiers) {
      expect(tier.archivedAt).not.toBeNull();
    }
  });

  test("should not break active subscription when archiving tiers", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });
    const pricingTierId = tiers[0].id;

    await SubscriptionFactory.create(organizationId, plan.id, {
      status: "active",
      pricingTierId,
    });

    // Replace tiers — should archive old ones, not delete
    const newTiers = generateTierPrices(7000);
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ pricingTiers: newTiers }),
      })
    );
    expect(response.status).toBe(200);

    // Verify subscription still resolves employee limit correctly
    const result = await LimitsService.checkEmployeeLimit(organizationId);
    expect(result.limit).toBe(tiers[0].maxEmployees);
    expect(result.canAdd).toBe(true);
  });

  test("should not include archived tiers in plan response", async () => {
    const { plan } = await PlanFactory.createPaid("diamond");
    createdPlanIds.push(plan.id);

    // Replace tiers to archive the originals
    const newTiers = generateTierPrices(8000);
    await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ pricingTiers: newTiers }),
      })
    );

    // Fetch plan — should only show new (active) tiers
    const getResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "GET",
        headers: authHeaders,
      })
    );
    const body = await getResponse.json();

    expect(body.data.pricingTiers.length).toBe(newTiers.length);
    expect(body.data.pricingTiers[0].priceMonthly).toBe(8000);
  });

  test("should allow replaceTiers when only canceled subscriptions reference tier", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    await SubscriptionFactory.create(organizationId, plan.id, {
      status: "canceled",
      pricingTierId: tiers[0].id,
    });

    const newTiers = generateTierPrices(9000);
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ pricingTiers: newTiers }),
      })
    );
    expect(response.status).toBe(200);
  });
});
