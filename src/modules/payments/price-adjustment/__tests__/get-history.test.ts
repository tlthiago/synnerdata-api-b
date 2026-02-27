import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestOrganization } from "@/test/helpers/organization";
import {
  createTestAdminUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/payments/price-adjustments/subscriptions/:subscriptionId/history", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id/history`,
        {
          method: "GET",
        }
      )
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id/history`,
        {
          method: "GET",
          headers,
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should return empty history for subscription with no adjustments", async () => {
    const adminResult = await createTestAdminUser();

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-nonexistent/history`,
        {
          method: "GET",
          headers: adminResult.headers,
        }
      )
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  test("should return price adjustment history with pagination", async () => {
    const adminResult = await createTestAdminUser();

    // Create an organization and subscription to insert adjustments against
    const organization = await createTestOrganization();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const subscriptionId = await SubscriptionFactory.createActive(
      organization.id,
      plan.id,
      { pricingTierId: tier.id }
    );

    // Insert 3 price adjustment records directly
    const adjustmentIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const adjustmentId = `price-adj-${crypto.randomUUID()}`;
      adjustmentIds.push(adjustmentId);

      await db.insert(schema.priceAdjustments).values({
        id: adjustmentId,
        subscriptionId,
        organizationId: organization.id,
        oldPrice: 9990 + i * 1000,
        newPrice: 12_990 + i * 1000,
        reason: `Test adjustment ${i + 1}`,
        adjustmentType: "individual",
        billingCycle: "monthly",
        pricingTierId: tier.id,
        adminId: adminResult.user.id,
        createdAt: new Date(Date.now() - (2 - i) * 60_000),
      });
    }

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/${subscriptionId}/history`,
        {
          method: "GET",
          headers: adminResult.headers,
        }
      )
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(3);
    expect(body.pagination.total).toBe(3);

    // Should be ordered by createdAt descending (most recent first)
    const firstItem = body.data[0];
    expect(firstItem.subscriptionId).toBe(subscriptionId);
    expect(firstItem.organizationId).toBe(organization.id);
    expect(firstItem.adjustmentType).toBe("individual");
    expect(firstItem.reason).toBe("Test adjustment 3");
  });

  test("should respect pagination query params (page, limit)", async () => {
    const adminResult = await createTestAdminUser();

    // Create an organization and subscription
    const organization = await createTestOrganization();
    const { plan, tiers } = await PlanFactory.createPaid("diamond");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const subscriptionId = await SubscriptionFactory.createActive(
      organization.id,
      plan.id,
      { pricingTierId: tier.id }
    );

    // Insert 5 adjustment records
    for (let i = 0; i < 5; i++) {
      await db.insert(schema.priceAdjustments).values({
        id: `price-adj-${crypto.randomUUID()}`,
        subscriptionId,
        organizationId: organization.id,
        oldPrice: 5000 + i * 500,
        newPrice: 6000 + i * 500,
        reason: `Paginated adjustment ${i + 1}`,
        adjustmentType: "bulk",
        billingCycle: "yearly",
        pricingTierId: tier.id,
        adminId: adminResult.user.id,
        createdAt: new Date(Date.now() - (4 - i) * 60_000),
      });
    }

    // Request page 1 with limit 2
    const responsePage1 = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/${subscriptionId}/history?page=1&limit=2`,
        {
          method: "GET",
          headers: adminResult.headers,
        }
      )
    );

    expect(responsePage1.status).toBe(200);
    const bodyPage1 = await responsePage1.json();
    expect(bodyPage1.data).toHaveLength(2);
    expect(bodyPage1.pagination.total).toBe(5);
    expect(bodyPage1.pagination.limit).toBe(2);
    expect(bodyPage1.pagination.offset).toBe(0);

    // Request page 2 with limit 2
    const responsePage2 = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/${subscriptionId}/history?page=2&limit=2`,
        {
          method: "GET",
          headers: adminResult.headers,
        }
      )
    );

    expect(responsePage2.status).toBe(200);
    const bodyPage2 = await responsePage2.json();
    expect(bodyPage2.data).toHaveLength(2);
    expect(bodyPage2.pagination.offset).toBe(2);

    // Request page 3 with limit 2 (should have 1 remaining item)
    const responsePage3 = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/${subscriptionId}/history?page=3&limit=2`,
        {
          method: "GET",
          headers: adminResult.headers,
        }
      )
    );

    expect(responsePage3.status).toBe(200);
    const bodyPage3 = await responsePage3.json();
    expect(bodyPage3.data).toHaveLength(1);
  });
});
