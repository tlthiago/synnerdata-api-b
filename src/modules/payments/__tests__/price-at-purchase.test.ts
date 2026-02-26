import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanChangeService } from "@/modules/payments/plan-change/plan-change.service";
import { WebhookService } from "@/modules/payments/webhook/webhook.service";
import { WebhookPayloadBuilder } from "@/test/builders/webhook-payload.builder";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { CheckoutFactory } from "@/test/factories/payments/checkout.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

function createValidAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

let diamondResult: CreatePlanResult;
let goldResult: CreatePlanResult;
let trialResult: CreatePlanResult;

describe("priceAtPurchase tracking", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    [diamondResult, goldResult, trialResult] = await Promise.all([
      PlanFactory.createPaid("diamond"),
      PlanFactory.createPaid("gold"),
      PlanFactory.createTrial(),
    ]);
  });

  // ============================================================
  // AC1: Self-service checkout stores tier price via pending_checkouts
  // ============================================================

  describe("self-service checkout activation", () => {
    test("should store tier price as priceAtPurchase when activated via pending checkout", async () => {
      const org = await OrganizationFactory.create();
      const tier = PlanFactory.getFirstTier(diamondResult);

      const checkout = await CheckoutFactory.create(
        org.id,
        diamondResult.plan.id,
        { pricingTierId: tier.id, billingCycle: "monthly" }
      );

      await SubscriptionFactory.createTrial(org.id, diamondResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withPaymentLinkCode(checkout.paymentLinkId)
        .build();

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.priceAtPurchase).toBe(tier.priceMonthly);
      expect(subscription.isCustomPrice).toBe(false);
    });

    test("should store yearly price when billing cycle is yearly", async () => {
      const org = await OrganizationFactory.create();
      const tier = PlanFactory.getFirstTier(diamondResult);

      const checkout = await CheckoutFactory.create(
        org.id,
        diamondResult.plan.id,
        { pricingTierId: tier.id, billingCycle: "yearly" }
      );

      await SubscriptionFactory.createTrial(org.id, diamondResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withPaymentLinkCode(checkout.paymentLinkId)
        .build();

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.priceAtPurchase).toBe(tier.priceYearly);
      expect(subscription.isCustomPrice).toBe(false);
    });
  });

  // ============================================================
  // AC1 (metadata path): Self-service checkout stores tier price via metadata
  // ============================================================

  describe("self-service checkout activation via metadata", () => {
    test("should store tier price when activated via metadata with pricing_tier_id", async () => {
      const org = await OrganizationFactory.create();
      const tier = PlanFactory.getFirstTier(diamondResult);

      await SubscriptionFactory.createTrial(org.id, diamondResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withOrganizationId(org.id)
        .withPlanId(diamondResult.plan.id)
        .withPricingTierId(tier.id)
        .withBillingCycle("monthly")
        .build();

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.priceAtPurchase).toBe(tier.priceMonthly);
      expect(subscription.isCustomPrice).toBe(false);
    });
  });

  // ============================================================
  // AC4: Plan change (downgrade) updates priceAtPurchase
  // ============================================================

  describe("downgrade execution updates priceAtPurchase", () => {
    test("should set priceAtPurchase to new tier price after downgrade", async () => {
      const { organizationId } = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const diamondTier = PlanFactory.getFirstTier(diamondResult);
      const goldTier = PlanFactory.getFirstTier(goldResult);

      const subscriptionId = await SubscriptionFactory.createActive(
        organizationId,
        diamondResult.plan.id,
        {
          billingCycle: "monthly",
          pricingTierId: diamondTier.id,
        }
      );

      // Set initial priceAtPurchase (Diamond tier price)
      await db
        .update(schema.orgSubscriptions)
        .set({
          priceAtPurchase: diamondTier.priceMonthly,
          isCustomPrice: false,
        })
        .where(eq(schema.orgSubscriptions.id, subscriptionId));

      // Schedule downgrade to Gold
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() - 1);

      await db
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: goldResult.plan.id,
          pendingBillingCycle: "monthly",
          pendingPricingTierId: goldTier.id,
          planChangeAt: scheduledAt,
        })
        .where(eq(schema.orgSubscriptions.id, subscriptionId));

      // Mock Pagarme cancel
      const { PagarmeClient } = await import(
        "@/modules/payments/pagarme/client"
      );
      const cancelSpy = spyOn(
        PagarmeClient,
        "cancelSubscription"
      ).mockResolvedValue({} as never);

      await PlanChangeService.executeScheduledChange(subscriptionId);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      // priceAtPurchase should now reflect Gold tier price
      expect(subscription.priceAtPurchase).toBe(goldTier.priceMonthly);
      expect(subscription.isCustomPrice).toBe(false);
      expect(subscription.planId).toBe(goldResult.plan.id);

      cancelSpy.mockRestore();
    });

    test("should set yearly price when downgrade changes to yearly billing", async () => {
      const { organizationId } = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const diamondTier = PlanFactory.getFirstTier(diamondResult);
      const goldTier = PlanFactory.getFirstTier(goldResult);

      const subscriptionId = await SubscriptionFactory.createActive(
        organizationId,
        diamondResult.plan.id,
        {
          billingCycle: "yearly",
          pricingTierId: diamondTier.id,
        }
      );

      // Schedule downgrade to Gold yearly
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() - 1);

      await db
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: goldResult.plan.id,
          pendingBillingCycle: "yearly",
          pendingPricingTierId: goldTier.id,
          planChangeAt: scheduledAt,
        })
        .where(eq(schema.orgSubscriptions.id, subscriptionId));

      const { PagarmeClient } = await import(
        "@/modules/payments/pagarme/client"
      );
      const cancelSpy = spyOn(
        PagarmeClient,
        "cancelSubscription"
      ).mockResolvedValue({} as never);

      await PlanChangeService.executeScheduledChange(subscriptionId);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.priceAtPurchase).toBe(goldTier.priceYearly);
      expect(subscription.isCustomPrice).toBe(false);

      cancelSpy.mockRestore();
    });
  });

  // ============================================================
  // AC5: Trial has null priceAtPurchase
  // ============================================================

  describe("trial subscription", () => {
    test("should have null priceAtPurchase", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await SubscriptionFactory.create(organizationId, trialResult.plan.id, {
        status: "active",
        trialDays: 14,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/subscription`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.priceAtPurchase).toBeNull();
      expect(body.data.isCustomPrice).toBe(false);
    });
  });

  // ============================================================
  // AC6: priceAtPurchase unchanged when catalog price changes
  // ============================================================

  describe("price immutability", () => {
    test("should keep priceAtPurchase unchanged when tier catalog price changes", async () => {
      const org = await OrganizationFactory.create();
      const tier = PlanFactory.getFirstTier(diamondResult);
      const originalPrice = tier.priceMonthly;

      const checkout = await CheckoutFactory.create(
        org.id,
        diamondResult.plan.id,
        { pricingTierId: tier.id, billingCycle: "monthly" }
      );

      await SubscriptionFactory.createTrial(org.id, diamondResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withPaymentLinkCode(checkout.paymentLinkId)
        .build();

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      // Simulate catalog price change (update tier price)
      await db
        .update(schema.planPricingTiers)
        .set({ priceMonthly: originalPrice + 5000 })
        .where(eq(schema.planPricingTiers.id, tier.id));

      // Subscription priceAtPurchase should remain unchanged
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.priceAtPurchase).toBe(originalPrice);

      // Restore original price for other tests
      await db
        .update(schema.planPricingTiers)
        .set({ priceMonthly: originalPrice })
        .where(eq(schema.planPricingTiers.id, tier.id));
    });
  });

  // ============================================================
  // Response schema: GET /subscription returns priceAtPurchase
  // ============================================================

  describe("GET /subscription response", () => {
    test("should include priceAtPurchase and isCustomPrice in response", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      const tier = PlanFactory.getFirstTier(diamondResult);

      const subscriptionId = await SubscriptionFactory.createActive(
        organizationId,
        diamondResult.plan.id,
        { pricingTierId: tier.id }
      );

      // Set priceAtPurchase directly
      await db
        .update(schema.orgSubscriptions)
        .set({
          priceAtPurchase: tier.priceMonthly,
          isCustomPrice: false,
        })
        .where(eq(schema.orgSubscriptions.id, subscriptionId));

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/subscription`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.priceAtPurchase).toBe(tier.priceMonthly);
      expect(body.data.isCustomPrice).toBe(false);
    });

    test("should return isCustomPrice true for custom-priced subscriptions", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      const tier = PlanFactory.getFirstTier(diamondResult);
      const customPrice = 4990;

      const subscriptionId = await SubscriptionFactory.createActive(
        organizationId,
        diamondResult.plan.id,
        { pricingTierId: tier.id }
      );

      await db
        .update(schema.orgSubscriptions)
        .set({
          priceAtPurchase: customPrice,
          isCustomPrice: true,
        })
        .where(eq(schema.orgSubscriptions.id, subscriptionId));

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/subscription`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.priceAtPurchase).toBe(customPrice);
      expect(body.data.isCustomPrice).toBe(true);
    });
  });
});
