import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { diamondPlan, goldPlan } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { createWebhookRequest, webhookPayloads } from "@/test/helpers/webhook";

const BASE_URL = env.API_URL;
const WEBHOOK_URL = `${BASE_URL}/v1/payments/webhooks/pagarme`;
const DEFAULT_EMPLOYEE_COUNT = 15;

describe("Upgrade Use Case: Trial → Paid Subscription", () => {
  let app: TestApp;
  let sessionHeaders: Record<string, string>;
  let organizationId: string;
  let userEmail: string;
  let paymentLinkId: string;
  let checkoutUrl: string;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();

    // Reset pagarmePlanIds for diamond plan to test sync
    if (diamondPlan) {
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, diamondPlan.id));
    }
  });

  describe("Fase 1: Setup - Usuário com Trial", () => {
    test("should create authenticated user with organization", async () => {
      const result = await createTestUserWithOrganization({
        emailVerified: true,
      });

      expect(result.user.id).toBeDefined();
      expect(result.organizationId).toBeDefined();
      expect(result.user.emailVerified).toBe(true);

      organizationId = result.organizationId;
      userEmail = result.user.email;
      sessionHeaders = result.headers;
    });

    test("should create trial subscription for organization", async () => {
      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      // Delete any existing subscriptions for this org to ensure clean state
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      await createTestSubscription(organizationId, goldPlan.id, "trial");

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription).toBeDefined();
      expect(subscription.status).toBe("trial");
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

  describe("Fase 2: Checkout - Criação do Payment Link", () => {
    test(
      "should create payment link for upgrade",
      async () => {
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
              organizationId,
              planId: diamondPlan.id,
              employeeCount: DEFAULT_EMPLOYEE_COUNT,
              successUrl: "https://example.com/success",
            }),
          })
        );

        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.checkoutUrl).toBeDefined();
        expect(body.data.checkoutUrl).toContain("pagar.me");
        expect(body.data.paymentLinkId).toBeDefined();
        expect(body.data.paymentLinkId).toStartWith("pl_");

        paymentLinkId = body.data.paymentLinkId;
        checkoutUrl = body.data.checkoutUrl;
      },
      { timeout: 30_000 }
    );

    test("should create pricing tier plan in Pagarme", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      // The pricing tier for the employee count should have a Pagarme plan ID
      // DEFAULT_EMPLOYEE_COUNT = 15 falls in the 11-50 tier
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

      expect(tier).toBeDefined();
      // After checkout, the tier should have a pagarmePlanIdMonthly
      expect(tier.pagarmePlanIdMonthly).toBeDefined();
      expect(tier.pagarmePlanIdMonthly).toBeString();
      expect(tier.pagarmePlanIdMonthly?.startsWith("plan_")).toBe(true);
    });

    test("should create pending checkout record", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const [checkout] = await db
        .select()
        .from(schema.pendingCheckouts)
        .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
        .limit(1);

      expect(checkout).toBeDefined();
      expect(checkout.organizationId).toBe(organizationId);
      expect(checkout.planId).toBe(diamondPlan.id);
      expect(checkout.status).toBe("pending");
      expect(checkout.employeeCount).toBe(DEFAULT_EMPLOYEE_COUNT);
      expect(checkout.expiresAt).toBeInstanceOf(Date);
      expect(checkout.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test("should send checkout link email", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const { waitForCheckoutEmail } = await import("@/test/helpers/mailhog");
      const emailData = await waitForCheckoutEmail(userEmail);

      expect(emailData.subject).toContain("Complete seu upgrade");
      expect(emailData.checkoutUrl).toBe(checkoutUrl);
      expect(emailData.planName).toBe(diamondPlan.displayName);
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

    test("should receive subscription.created webhook", async () => {
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

    test("should not overwrite existing profile data", async () => {
      const [profile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, organizationId))
        .limit(1);

      // Profile was created with data in createTestUser, should not be overwritten
      expect(profile.tradeName).toBeDefined();
      expect(profile.tradeName).not.toBe("");
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
            organizationId,
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

    test("should have synced customer data in profile", async () => {
      const [profile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, organizationId))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBeDefined();
      expect(profile.pagarmeCustomerId?.startsWith("cus_")).toBe(true);
    });
  });
});
