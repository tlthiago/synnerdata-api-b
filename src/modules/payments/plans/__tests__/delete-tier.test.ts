import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("DELETE /payments/plans/:planId/tiers/:tierId", () => {
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
        method: "DELETE",
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
        method: "DELETE",
        headers: nonAdminHeaders,
      })
    );
    expect(response.status).toBe(403);
  });

  test("should delete tier with no active subscriptions", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tierId = tiers[9].id;

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers/${tierId}`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);

    // Verify tier was deleted from database
    const [deletedTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tierId))
      .limit(1);
    expect(deletedTier).toBeUndefined();
  });

  test("should reject deletion of tier with active subscriptions", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("diamond");
    const tier = tiers[0];
    const organization = await OrganizationFactory.create();

    await SubscriptionFactory.createActive(organization.id, plan.id, {
      pricingTierId: tier.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers/${tier.id}`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("TIER_HAS_ACTIVE_SUBSCRIPTIONS");

    // Verify tier still exists
    const [existingTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tier.id))
      .limit(1);
    expect(existingTier).toBeDefined();
  });

  test("should allow deletion of tier with canceled subscriptions", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("platinum");
    const tier = tiers[0];
    const organization = await OrganizationFactory.create();

    await SubscriptionFactory.createCanceled(organization.id, plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers/${tier.id}`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.deleted).toBe(true);
  });

  test("should return 404 for non-existent tier", async () => {
    const { plan } = await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/plans/${plan.id}/tiers/tier-non-existent`,
        { method: "DELETE", headers: authHeaders }
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
        { method: "DELETE", headers: authHeaders }
      )
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("TIER_NOT_FOUND");
  });
});
