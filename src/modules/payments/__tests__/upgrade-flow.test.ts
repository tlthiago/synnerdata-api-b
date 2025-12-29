import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { diamondPlan } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createOrganizationViaApi } from "@/test/helpers/organization";
import { seedPlans } from "@/test/helpers/seed";
import { createTestUser } from "@/test/helpers/user";
import { createWebhookRequest, webhookPayloads } from "@/test/helpers/webhook";

const BASE_URL = env.API_URL;
const WEBHOOK_URL = `${BASE_URL}/v1/payments/webhooks/pagarme`;
const DEFAULT_EMPLOYEE_COUNT = 5;

/**
 * Test the complete upgrade flow from trial to paid subscription
 * WITHOUT real Pagarme API integration.
 *
 * This test simulates the full user journey:
 * 1. User signs up and creates organization (trial is created automatically)
 * 2. User initiates checkout (Pagarme API is mocked)
 * 3. Pagarme sends webhook after payment (simulated)
 * 4. Subscription is activated
 */
describe("Upgrade Flow: Trial → Paid (Mocked Pagarme)", () => {
  let app: TestApp;
  let sessionHeaders: Record<string, string>;
  let organizationId: string;
  let userId: string;
  let paymentLinkId: string;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  describe("Fase 1: Criação de Usuário e Organização via API", () => {
    test("should create user via auth API", async () => {
      const result = await createTestUser({ emailVerified: true });

      expect(result.user.id).toBeDefined();
      expect(result.user.emailVerified).toBe(true);

      userId = result.user.id;
      sessionHeaders = result.headers;
    });

    test("should create organization via API (triggers trial creation hook)", async () => {
      const userResult = {
        user: { id: userId, email: "", name: "", emailVerified: true },
        session: { id: "", token: sessionHeaders.Cookie.split("=")[1] },
        headers: sessionHeaders,
      };

      const result = await createOrganizationViaApi(userResult, {
        name: "Test Upgrade Org",
        tradeName: "Test Company",
        phone: "11999999999",
      });

      expect(result.organizationId).toBeDefined();
      organizationId = result.organizationId;
    });

    test("should have trial subscription created automatically", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription).toBeDefined();
      expect(subscription.status).toBe("trial");
      expect(subscription.trialStart).toBeInstanceOf(Date);
      expect(subscription.trialEnd).toBeInstanceOf(Date);
      expect(subscription.pagarmeSubscriptionId).toBeNull();
      expect(subscription.pagarmeCustomerId).toBeNull();
    });

    test("should have organization profile without pagarmeCustomerId", async () => {
      const [profile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, organizationId))
        .limit(1);

      expect(profile).toBeDefined();
      expect(profile.pagarmeCustomerId).toBeNull();
    });
  });

  describe("Fase 2: Checkout com Pagarme Mockado", () => {
    const mockPagarmePlanId = `plan_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const mockPaymentLinkId = `pl_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const mockCheckoutUrl = `https://pagar.me/checkout/${mockPaymentLinkId}`;

    test("should pre-configure pricing tier with Pagarme plan ID", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      // Pre-configure the pricing tier with a mock Pagarme plan ID
      // This simulates the tier already being synced with Pagarme
      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdMonthly: mockPagarmePlanId })
        .where(
          and(
            eq(schema.planPricingTiers.planId, diamondPlan.id),
            lte(schema.planPricingTiers.minEmployees, DEFAULT_EMPLOYEE_COUNT),
            gte(schema.planPricingTiers.maxEmployees, DEFAULT_EMPLOYEE_COUNT)
          )
        );

      const [tier] = await db
        .select()
        .from(schema.planPricingTiers)
        .where(
          and(
            eq(schema.planPricingTiers.planId, diamondPlan.id),
            lte(schema.planPricingTiers.minEmployees, DEFAULT_EMPLOYEE_COUNT),
            gte(schema.planPricingTiers.maxEmployees, DEFAULT_EMPLOYEE_COUNT)
          )
        )
        .limit(1);

      expect(tier.pagarmePlanIdMonthly).toBe(mockPagarmePlanId);
    });

    test("should create checkout with mocked Pagarme API", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      // Mock Pagarme API for payment link creation only
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
        name: "Test Plan",
        success_url: "https://example.com/success",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...sessionHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlan.id,
            employeeCount: DEFAULT_EMPLOYEE_COUNT,
            successUrl: "https://example.com/success",
          }),
        })
      );

      if (response.status !== 200) {
        const errorBody = await response.text();
        console.error("Checkout failed:", response.status, errorBody);
      }
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.checkoutUrl).toBe(mockCheckoutUrl);
      expect(body.data.paymentLinkId).toBe(mockPaymentLinkId);

      paymentLinkId = mockPaymentLinkId;

      // Restore spy
      createPaymentLinkSpy.mockRestore();
    });

    test("should create pending checkout record", async () => {
      const [checkout] = await db
        .select()
        .from(schema.pendingCheckouts)
        .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
        .limit(1);

      expect(checkout).toBeDefined();
      expect(checkout.organizationId).toBe(organizationId);
      expect(checkout.status).toBe("pending");
      expect(checkout.pricingTierId).toBeDefined();
    });

    test("should still have trial subscription (not activated yet)", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("trial");
    });
  });

  describe("Fase 3: Webhook - Ativação via subscription.created", () => {
    const customerData = {
      id: `cus_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      name: "João da Silva",
      email: "joao.silva@empresa.com.br",
      document: "12345678909",
      phone: "11987654321",
    };

    test("should receive and process subscription.created webhook", async () => {
      const payload = webhookPayloads.subscriptionCreatedFromPaymentLink(
        paymentLinkId,
        customerData
      );

      const request = createWebhookRequest(WEBHOOK_URL, payload);
      const response = await app.handle(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.received).toBe(true);
    });

    test("should activate subscription", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.pagarmeSubscriptionId).toBeString();
      expect(subscription.pagarmeSubscriptionId?.startsWith("sub_")).toBe(true);
      expect(subscription.trialUsed).toBe(true);
    });

    test("should store pagarmeCustomerId in subscription", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.pagarmeCustomerId).toBeString();
      expect(subscription.pagarmeCustomerId?.startsWith("cus_")).toBe(true);
    });

    test("should set current period dates", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);

      if (subscription.currentPeriodStart && subscription.currentPeriodEnd) {
        expect(subscription.currentPeriodEnd.getTime()).toBeGreaterThan(
          subscription.currentPeriodStart.getTime()
        );
      }
    });

    test("should mark pending checkout as completed", async () => {
      const [checkout] = await db
        .select()
        .from(schema.pendingCheckouts)
        .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
        .limit(1);

      expect(checkout.status).toBe("completed");
      expect(checkout.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("Fase 4: Sync de Dados do Customer", () => {
    test("should sync pagarmeCustomerId to organization profile", async () => {
      const [profile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, organizationId))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBeString();
      expect(profile.pagarmeCustomerId?.startsWith("cus_")).toBe(true);
    });
  });

  describe("Fase 5: Validação Final", () => {
    test("should have complete active subscription", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      // Status
      expect(subscription.status).toBe("active");

      // Pagarme IDs
      expect(subscription.pagarmeSubscriptionId).toBeDefined();
      expect(subscription.pagarmeSubscriptionId?.startsWith("sub_")).toBe(true);
      expect(subscription.pagarmeCustomerId).toBeDefined();
      expect(subscription.pagarmeCustomerId?.startsWith("cus_")).toBe(true);

      // Period
      expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);

      // Trial
      expect(subscription.trialUsed).toBe(true);

      // Plan
      expect(subscription.planId).toBe(diamondPlan.id);

      // Pricing tier
      expect(subscription.pricingTierId).toBeDefined();
    });

    test("should reject new checkout for already active subscription", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...sessionHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlan.id,
            employeeCount: DEFAULT_EMPLOYEE_COUNT,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
    });
  });
});
