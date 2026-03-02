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
import { EMPLOYEE_TIERS } from "../plans.constants";

const BASE_URL = env.API_URL;

const DIAMOND_FEATURES = [
  "terminated_employees",
  "absences",
  "medical_certificates",
  "accidents",
  "warnings",
  "employee_status",
  "birthdays",
  "ppe",
  "employee_record",
];

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
    // Cleanup: delete subscriptions, pagarme history, pricing tiers, and plans created during tests
    if (createdPlanIds.length > 0) {
      await db
        .delete(schema.orgSubscriptions)
        .where(inArray(schema.orgSubscriptions.planId, createdPlanIds));
      await db
        .delete(schema.pagarmePlanHistory)
        .where(inArray(schema.pagarmePlanHistory.localPlanId, createdPlanIds));
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

  test("should update plan features with valid features", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ features: DIAMOND_FEATURES }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.features).toEqual(DIAMOND_FEATURES);
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

  test("should not deactivate Pagar.me plans for tiers with active subscriptions", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    // Create a Pagar.me plan history record for the first tier
    await db.insert(schema.pagarmePlanHistory).values({
      id: `pmh-${crypto.randomUUID()}`,
      localPlanId: plan.id,
      localTierId: tiers[0].id,
      pagarmePlanId: `pagarme-plan-${crypto.randomUUID()}`,
      billingCycle: "monthly",
      priceAtCreation: tiers[0].priceMonthly,
      isActive: true,
    });

    // Create a Pagar.me plan history record for the second tier (no subscription)
    await db.insert(schema.pagarmePlanHistory).values({
      id: `pmh-${crypto.randomUUID()}`,
      localPlanId: plan.id,
      localTierId: tiers[1].id,
      pagarmePlanId: `pagarme-plan-${crypto.randomUUID()}`,
      billingCycle: "monthly",
      priceAtCreation: tiers[1].priceMonthly,
      isActive: true,
    });

    // Create active subscription referencing first tier
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });
    await SubscriptionFactory.create(organizationId, plan.id, {
      status: "active",
      pricingTierId: tiers[0].id,
    });

    // Replace tiers
    const newTiers = generateTierPrices(11_000);
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ pricingTiers: newTiers }),
      })
    );
    expect(response.status).toBe(200);

    // First tier has active subscription — its Pagar.me plan should still be active
    const [tier0History] = await db
      .select()
      .from(schema.pagarmePlanHistory)
      .where(eq(schema.pagarmePlanHistory.localTierId, tiers[0].id));

    expect(tier0History.isActive).toBe(true);

    // Second tier has no active subscription — its Pagar.me plan should be deactivated
    const [tier1History] = await db
      .select()
      .from(schema.pagarmePlanHistory)
      .where(eq(schema.pagarmePlanHistory.localTierId, tiers[1].id));

    expect(tier1History.isActive).toBe(false);
  });

  // --- plan_limits tests ---

  test("should update plan with limits", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          limits: [
            { key: "max_employees", value: 50 },
            { key: "max_members", value: 10 },
          ],
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.limits).toBeArray();
    expect(body.data.limits.length).toBe(2);

    const maxEmployees = body.data.limits.find(
      (l: { key: string }) => l.key === "max_employees"
    );
    expect(maxEmployees.value).toBe(50);
  });

  test("should replace existing limits on update", async () => {
    const { plan } = await PlanFactory.createTrial();
    createdPlanIds.push(plan.id);

    // Trial plan already has max_employees=10 from factory
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          limits: [{ key: "max_employees", value: 20 }],
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.limits.length).toBe(1);
    expect(body.data.limits[0].key).toBe("max_employees");
    expect(body.data.limits[0].value).toBe(20);
  });

  test("should remove all limits with empty array", async () => {
    const { plan } = await PlanFactory.createTrial();
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ limits: [] }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.limits).toEqual([]);
  });

  // --- yearlyDiscountPercent tests ---

  test("should update yearlyDiscountPercent and recalculate tier prices", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ yearlyDiscountPercent: 10 }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.yearlyDiscountPercent).toBe(10);

    // Verify recalculation: yearly = monthly * 12 * 0.9
    const firstTier = body.data.pricingTiers[0];
    const expectedYearly = Math.round(tiers[0].priceMonthly * 12 * 0.9);
    expect(firstTier.priceYearly).toBe(expectedYearly);
  });

  test("should set yearlyDiscountPercent to 0 (no discount)", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("diamond");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ yearlyDiscountPercent: 0 }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.yearlyDiscountPercent).toBe(0);

    // yearly = monthly * 12 (no discount)
    const firstTier = body.data.pricingTiers[0];
    expect(firstTier.priceYearly).toBe(tiers[0].priceMonthly * 12);
  });

  test("should set yearlyDiscountPercent to 100 (free yearly)", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ yearlyDiscountPercent: 100 }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.yearlyDiscountPercent).toBe(100);

    for (const tier of body.data.pricingTiers) {
      expect(tier.priceYearly).toBe(0);
    }
  });

  test("should reject negative yearlyDiscountPercent", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ yearlyDiscountPercent: -5 }),
      })
    );
    expect(response.status).toBe(422);
  });

  test("should reject yearlyDiscountPercent > 100", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ yearlyDiscountPercent: 101 }),
      })
    );
    expect(response.status).toBe(422);
  });

  test("should reject non-integer yearlyDiscountPercent", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ yearlyDiscountPercent: 20.5 }),
      })
    );
    expect(response.status).toBe(422);
  });

  // --- Feature ID validation tests ---

  test("should reject update with non-existent feature ID", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          features: ["terminated_employees", "unknown_feature"],
        }),
      })
    );
    expect(response.status).toBe(422);

    const errorBody = await response.json();
    expect(errorBody.error.code).toBe("INVALID_FEATURE_IDS");
    expect(errorBody.error.details.invalidIds).toContain("unknown_feature");
  });

  test("should reject update with inactive feature", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    createdPlanIds.push(plan.id);

    // Deactivate a feature temporarily
    await db
      .update(schema.features)
      .set({ isActive: false })
      .where(eq(schema.features.id, "payroll"));

    try {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
          method: "PUT",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            features: ["terminated_employees", "payroll"],
          }),
        })
      );
      expect(response.status).toBe(422);

      const errorBody = await response.json();
      expect(errorBody.error.code).toBe("INVALID_FEATURE_IDS");
      expect(errorBody.error.details.invalidIds).toContain("payroll");
    } finally {
      await db
        .update(schema.features)
        .set({ isActive: true })
        .where(eq(schema.features.id, "payroll"));
    }
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
