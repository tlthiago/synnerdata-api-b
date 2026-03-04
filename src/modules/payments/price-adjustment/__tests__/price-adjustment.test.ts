import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PaymentHooks } from "@/modules/payments/hooks";
import { PagarmeClient } from "@/modules/payments/pagarme/client";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestOrganization } from "@/test/helpers/organization";
import {
  createTestAdminUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/price-adjustments/subscriptions/:subscriptionId", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newPriceMonthly: 5000,
            reason: "Test adjustment",
          }),
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
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPriceMonthly: 5000,
            reason: "Test adjustment",
          }),
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject with missing reason", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPriceMonthly: 5000,
          }),
        }
      )
    );

    expect(response.status).toBe(422);
  });

  test("should reject with price too low", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPriceMonthly: 50,
            reason: "Too cheap",
          }),
        }
      )
    );

    expect(response.status).toBe(422);
  });

  describe("happy-path", () => {
    let getSubscriptionSpy: ReturnType<typeof spyOn>;
    let updateSubscriptionItemSpy: ReturnType<typeof spyOn>;
    let hookEmitSpy: ReturnType<typeof spyOn>;

    afterEach(() => {
      getSubscriptionSpy?.mockRestore();
      updateSubscriptionItemSpy?.mockRestore();
      hookEmitSpy?.mockRestore();
    });

    function mockPagarme() {
      getSubscriptionSpy = spyOn(
        PagarmeClient,
        "getSubscription"
      ).mockResolvedValue({
        id: "sub_mock_123",
        plan: { name: "Plan" },
        items: [
          { id: "item_mock_1", name: "Plan", quantity: 1, status: "active" },
        ],
      } as never);
      updateSubscriptionItemSpy = spyOn(
        PagarmeClient,
        "updateSubscriptionItem"
      ).mockResolvedValue({ id: "sub_mock_123" } as never);
      hookEmitSpy = spyOn(PaymentHooks, "emit");
    }

    test("should return 200 with adjustment and subscription data", async () => {
      mockPagarme();

      const { headers } = await createTestAdminUser();
      const { plan, tiers } = await PlanFactory.createPaid("gold");
      const tier = PlanFactory.getFirstTier({ plan, tiers });

      const org = await createTestOrganization();
      const subId = await SubscriptionFactory.createActive(org.id, plan.id, {
        pricingTierId: tier.id,
        billingCycle: "monthly",
        pagarmeSubscriptionId: "sub_mock_123",
      });

      // Set priceAtPurchase (factory doesn't support this directly)
      await db
        .update(schema.orgSubscriptions)
        .set({ priceAtPurchase: 39_900 })
        .where(eq(schema.orgSubscriptions.id, subId));

      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/payments/price-adjustments/subscriptions/${subId}`,
          {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              newPriceMonthly: 45_000,
              reason: "Annual price increase",
            }),
          }
        )
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);

      // Adjustment data
      const { adjustment, subscription } = body.data;
      expect(adjustment.subscriptionId).toBe(subId);
      expect(adjustment.oldPrice).toBe(39_900);
      expect(adjustment.newPrice).toBe(45_000);
      expect(adjustment.reason).toBe("Annual price increase");
      expect(adjustment.adjustmentType).toBe("individual");
      expect(adjustment.billingCycle).toBe("monthly");

      // Subscription data
      expect(subscription.id).toBe(subId);
      expect(subscription.priceAtPurchase).toBe(45_000);
      expect(subscription.isCustomPrice).toBe(true);

      // Verify Pagar.me calls — no custom plan creation, only item pricing update
      expect(getSubscriptionSpy).toHaveBeenCalledWith("sub_mock_123");
      expect(updateSubscriptionItemSpy).toHaveBeenCalledWith(
        "sub_mock_123",
        "item_mock_1",
        {
          description: "Plan",
          quantity: 1,
          status: "active",
          pricing_scheme: {
            price: 45_000,
            scheme_type: "unit",
          },
        }
      );

      // Verify DB was updated
      const [updatedSub] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subId))
        .limit(1);

      expect(updatedSub.priceAtPurchase).toBe(45_000);
      expect(updatedSub.isCustomPrice).toBe(true);
    });
  });
});

describe("POST /v1/payments/price-adjustments/bulk", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/price-adjustments/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "plan-fake-id",
          pricingTierId: "tier-fake-id",
          billingCycle: "monthly",
          newPriceMonthly: 5000,
          reason: "Bulk test",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/price-adjustments/bulk`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "plan-fake-id",
          pricingTierId: "tier-fake-id",
          billingCycle: "monthly",
          newPriceMonthly: 5000,
          reason: "Bulk test",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject with invalid body", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/price-adjustments/bulk`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "plan-fake-id",
          // missing pricingTierId, billingCycle, newPriceMonthly, reason
        }),
      })
    );

    expect(response.status).toBe(422);
  });
});
