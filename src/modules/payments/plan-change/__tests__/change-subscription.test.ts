import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/subscription/change`;

describe("POST /v1/payments/subscription/change", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("Authentication", () => {
    test("should reject unauthenticated requests", async () => {
      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ successUrl: "https://example.com/success" }),
        })
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authorization", () => {
    test("should reject user without subscription:update permission", async () => {
      // Create owner user with org
      const ownerResult = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      // Create viewer user and add to same org with limited permissions
      const viewerResult = await UserFactory.create({ emailVerified: true });

      await db.insert(schema.members).values({
        id: `member-${crypto.randomUUID()}`,
        organizationId: ownerResult.organizationId,
        userId: viewerResult.user.id,
        role: "viewer",
        createdAt: new Date(),
      });

      // Set viewer's active organization
      await db
        .update(schema.sessions)
        .set({ activeOrganizationId: ownerResult.organizationId })
        .where(eq(schema.sessions.userId, viewerResult.user.id));

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...viewerResult.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ successUrl: "https://example.com/success" }),
        })
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Validation Errors", () => {
    test("should return SUBSCRIPTION_NOT_FOUND when org has no subscription", async () => {
      const result = await UserFactory.create({ emailVerified: true });

      // Create org without subscription
      const org = await OrganizationFactory.create({
        name: "No Subscription Org",
        tradeName: "No Sub",
        phone: "11999999999",
      });

      // Add user as owner of the organization
      await OrganizationFactory.addMember(result, {
        organizationId: org.id,
        role: "owner",
      });

      // Create billing profile (required)
      await BillingProfileFactory.create({ organizationId: org.id });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: "some-plan-id",
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
    });

    test("should return SUBSCRIPTION_NOT_ACTIVE when subscription is canceled", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tiers[0].id,
      });

      // Mark subscription as canceled
      await db
        .update(schema.orgSubscriptions)
        .set({ status: "canceled" })
        .where(
          eq(schema.orgSubscriptions.organizationId, result.organizationId)
        );

      // Create billing profile
      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: "some-plan-id",
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_NOT_ACTIVE");
    });

    test("should return PLAN_CHANGE_IN_PROGRESS when change already scheduled", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");
      const { plan: goldPlan } = await PlanFactory.createPaid("gold");

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tiers[0].id,
      });

      // Schedule a pending change
      await db
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: goldPlan.id,
          pendingBillingCycle: "monthly",
          planChangeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
        .where(
          eq(schema.orgSubscriptions.organizationId, result.organizationId)
        );

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: goldPlan.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("PLAN_CHANGE_IN_PROGRESS");
    });

    test("should return NO_CHANGE_REQUESTED when same configuration", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");
      const tierId = tiers[0].id;

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tierId,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: diamondPlan.id,
            newBillingCycle: "monthly",
            newTierId: tierId,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("NO_CHANGE_REQUESTED");
    });

    test("should return YEARLY_BILLING_NOT_AVAILABLE when tier has no yearly price", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");
      const tierId = tiers[0].id;

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tierId,
      });

      // Set priceYearly to 0
      await db
        .update(schema.planPricingTiers)
        .set({ priceYearly: 0 })
        .where(eq(schema.planPricingTiers.id, tierId));

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newBillingCycle: "yearly",
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("YEARLY_BILLING_NOT_AVAILABLE");
    });

    test("should return EMPLOYEE_COUNT_EXCEEDS_NEW_PLAN_LIMIT on downgrade with too many employees", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      // Start with higher tier (11-20 employees, index 1)
      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");
      const higherTier = tiers[1]; // 11-20 employees

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: higherTier.id,
      });

      // Create 15 employees (more than lower tier allows)
      const { createTestEmployees } = await import("@/test/helpers/employee");
      await createTestEmployees({
        organizationId: result.organizationId,
        userId: result.user.id,
        count: 15,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const lowerTier = tiers[0]; // 0-10 employees

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newTierId: lowerTier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("EMPLOYEE_COUNT_EXCEEDS_NEW_PLAN_LIMIT");
    });

    test("should return PLAN_NOT_FOUND for non-existent plan", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tiers[0].id,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: "non-existent-plan-id",
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("PLAN_NOT_FOUND");
    });
  });

  describe("Upgrade Flow", () => {
    test("should return checkout URL for upgrade (mocked Pagarme)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: goldPlan, tiers: goldTiers } =
        await PlanFactory.createPaid("gold");
      const { plan: diamondPlan, tiers: diamondTiers } =
        await PlanFactory.createPaid("diamond");

      const goldTier = goldTiers[0];
      const diamondTier = diamondTiers[0];

      // Make diamond more expensive than gold (ensure upgrade)
      await db
        .update(schema.planPricingTiers)
        .set({ priceMonthly: 5000 })
        .where(eq(schema.planPricingTiers.id, goldTier.id));

      await db
        .update(schema.planPricingTiers)
        .set({ priceMonthly: 10_000 })
        .where(eq(schema.planPricingTiers.id, diamondTier.id));

      await SubscriptionFactory.create(result.organizationId, goldPlan.id, {
        pricingTierId: goldTier.id,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      // Pre-configure diamond tier with mock Pagarme plan ID
      const mockPagarmePlanId = `plan_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdMonthly: mockPagarmePlanId })
        .where(eq(schema.planPricingTiers.id, diamondTier.id));

      // Mock Pagarme API
      const mockPaymentLinkId = `pl_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const mockCheckoutUrl = `https://pagar.me/checkout/${mockPaymentLinkId}`;

      const { PagarmeClient } = await import(
        "@/modules/payments/pagarme/client"
      );

      const createPaymentLinkSpy = spyOn(
        PagarmeClient,
        "createPaymentLink"
      ).mockResolvedValue({
        id: mockPaymentLinkId,
        url: mockCheckoutUrl,
        short_url: mockCheckoutUrl,
        status: "active",
        type: "subscription",
        name: "Upgrade Plan",
        success_url: "https://example.com/success",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: diamondPlan.id,
            newTierId: diamondTier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.changeType).toBe("upgrade");
      expect(body.data.checkoutUrl).toBe(mockCheckoutUrl);
      expect(body.data.newPlan.id).toBe(diamondPlan.id);
      expect(body.data.newTierId).toBe(diamondTier.id);

      createPaymentLinkSpy.mockRestore();
    });
  });

  describe("Downgrade Flow", () => {
    test("should schedule downgrade for period end", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: goldPlan, tiers: goldTiers } =
        await PlanFactory.createPaid("gold");
      const { plan: diamondPlan, tiers: diamondTiers } =
        await PlanFactory.createPaid("diamond");

      const goldTier = goldTiers[0];
      const diamondTier = diamondTiers[0];

      // Make diamond more expensive than gold (so going to gold is downgrade)
      await db
        .update(schema.planPricingTiers)
        .set({ priceMonthly: 5000 })
        .where(eq(schema.planPricingTiers.id, goldTier.id));

      await db
        .update(schema.planPricingTiers)
        .set({ priceMonthly: 10_000 })
        .where(eq(schema.planPricingTiers.id, diamondTier.id));

      const currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: diamondTier.id,
      });

      // Set current period end for scheduling
      await db
        .update(schema.orgSubscriptions)
        .set({ currentPeriodEnd })
        .where(
          eq(schema.orgSubscriptions.organizationId, result.organizationId)
        );

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: goldPlan.id,
            newTierId: goldTier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.changeType).toBe("downgrade");
      expect(body.data.scheduledAt).toBeDefined();
      expect(body.data.checkoutUrl).toBeUndefined();
      expect(body.data.newPlan.id).toBe(goldPlan.id);
      expect(body.data.newTierId).toBe(goldTier.id);

      // Verify DB has pending change
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(
          eq(schema.orgSubscriptions.organizationId, result.organizationId)
        )
        .limit(1);

      expect(subscription.pendingPlanId).toBe(goldPlan.id);
      expect(subscription.pendingPricingTierId).toBe(goldTier.id);
      expect(subscription.planChangeAt).toBeInstanceOf(Date);
    });
  });

  describe("Tier Change Only", () => {
    test("should handle tier upgrade within same plan", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");

      const lowerTier = tiers[0]; // 0-10 employees
      const higherTier = tiers[1]; // 11-20 employees

      // Make higher tier more expensive
      await db
        .update(schema.planPricingTiers)
        .set({ priceMonthly: 5000 })
        .where(eq(schema.planPricingTiers.id, lowerTier.id));

      await db
        .update(schema.planPricingTiers)
        .set({ priceMonthly: 8000 })
        .where(eq(schema.planPricingTiers.id, higherTier.id));

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: lowerTier.id,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      // Pre-configure higher tier with mock Pagarme plan ID
      const mockPagarmePlanId = `plan_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdMonthly: mockPagarmePlanId })
        .where(eq(schema.planPricingTiers.id, higherTier.id));

      // Mock Pagarme API
      const mockPaymentLinkId = `pl_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const mockCheckoutUrl = `https://pagar.me/checkout/${mockPaymentLinkId}`;

      const { PagarmeClient } = await import(
        "@/modules/payments/pagarme/client"
      );

      const createPaymentLinkSpy = spyOn(
        PagarmeClient,
        "createPaymentLink"
      ).mockResolvedValue({
        id: mockPaymentLinkId,
        url: mockCheckoutUrl,
        short_url: mockCheckoutUrl,
        status: "active",
        type: "subscription",
        name: "Tier Upgrade",
        success_url: "https://example.com/success",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newTierId: higherTier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.changeType).toBe("upgrade");
      expect(body.data.checkoutUrl).toBe(mockCheckoutUrl);
      expect(body.data.newPlan.id).toBe(diamondPlan.id);
      expect(body.data.newTierId).toBe(higherTier.id);

      createPaymentLinkSpy.mockRestore();
    });
  });

  describe("Billing Cycle Change Only", () => {
    test("should handle billing cycle change to yearly (upgrade)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");
      const tier = tiers[0];

      // Set yearly price higher (upgrade)
      await db
        .update(schema.planPricingTiers)
        .set({ priceMonthly: 5000, priceYearly: 50_000 })
        .where(eq(schema.planPricingTiers.id, tier.id));

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tier.id,
      });

      // Ensure billing cycle is monthly
      await db
        .update(schema.orgSubscriptions)
        .set({ billingCycle: "monthly" })
        .where(
          eq(schema.orgSubscriptions.organizationId, result.organizationId)
        );

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      // Pre-configure tier with mock Pagarme yearly plan ID
      const mockPagarmePlanId = `plan_mock_yearly_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdYearly: mockPagarmePlanId })
        .where(eq(schema.planPricingTiers.id, tier.id));

      // Mock Pagarme API
      const mockPaymentLinkId = `pl_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const mockCheckoutUrl = `https://pagar.me/checkout/${mockPaymentLinkId}`;

      const { PagarmeClient } = await import(
        "@/modules/payments/pagarme/client"
      );

      const createPaymentLinkSpy = spyOn(
        PagarmeClient,
        "createPaymentLink"
      ).mockResolvedValue({
        id: mockPaymentLinkId,
        url: mockCheckoutUrl,
        short_url: mockCheckoutUrl,
        status: "active",
        type: "subscription",
        name: "Billing Cycle Change",
        success_url: "https://example.com/success",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newBillingCycle: "yearly",
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.changeType).toBe("upgrade");
      expect(body.data.checkoutUrl).toBe(mockCheckoutUrl);
      expect(body.data.newBillingCycle).toBe("yearly");

      createPaymentLinkSpy.mockRestore();
    });
  });
});
