import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  organizationProfiles,
  orgSubscriptions,
  pendingCheckouts,
  subscriptionPlans,
} from "@/db/schema";
import { env } from "@/env";
import { proPlan, starterPlan } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { createWebhookRequest, webhookPayloads } from "@/test/helpers/webhook";

const BASE_URL = env.API_URL;
const WEBHOOK_URL = `${BASE_URL}/v1/payments/webhooks/pagarme`;

describe("Upgrade Use Case: Trial → Paid Subscription", () => {
  let app: TestApp;
  let sessionHeaders: Record<string, string>;
  let organizationId: string;
  let paymentLinkId: string;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();

    // Reset pagarmePlanId for pro plan to test sync
    if (proPlan) {
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: null })
        .where(eq(subscriptionPlans.id, proPlan.id));
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
      sessionHeaders = result.headers;
    });

    test("should create trial subscription for organization", async () => {
      if (!starterPlan) {
        throw new Error("Starter plan not found in fixtures");
      }

      // Delete any existing subscriptions for this org to ensure clean state
      await db
        .delete(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId));

      await createTestSubscription(organizationId, starterPlan.id, "trial");

      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription).toBeDefined();
      expect(subscription.status).toBe("trial");
      expect(subscription.pagarmeSubscriptionId).toBeNull();
      expect(subscription.pagarmeCustomerId).toBeNull();
    });

    test("should have organization profile without pagarmeCustomerId", async () => {
      const [profile] = await db
        .select()
        .from(organizationProfiles)
        .where(eq(organizationProfiles.organizationId, organizationId))
        .limit(1);

      expect(profile).toBeDefined();
      expect(profile.pagarmeCustomerId).toBeNull();
    });
  });

  describe("Fase 2: Checkout - Criação do Payment Link", () => {
    test(
      "should create payment link for upgrade",
      async () => {
        if (!proPlan) {
          throw new Error("Pro plan not found in fixtures");
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
              planId: proPlan.id,
              successUrl: "https://example.com/success",
            }),
          })
        );

        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.checkoutUrl).toBeDefined();
        expect(body.checkoutUrl).toContain("pagar.me");
        expect(body.paymentLinkId).toBeDefined();
        expect(body.paymentLinkId).toStartWith("pl_");

        paymentLinkId = body.paymentLinkId;
      },
      { timeout: 30_000 }
    );

    test("should sync plan to Pagarme", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      const [dbPlan] = await db
        .select({ pagarmePlanId: subscriptionPlans.pagarmePlanId })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, proPlan.id))
        .limit(1);

      expect(dbPlan.pagarmePlanId).toBeDefined();
      expect(dbPlan.pagarmePlanId).toBeString();
      expect(dbPlan.pagarmePlanId?.startsWith("plan_")).toBe(true);
    });

    test("should create pending checkout record", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      const [checkout] = await db
        .select()
        .from(pendingCheckouts)
        .where(eq(pendingCheckouts.paymentLinkId, paymentLinkId))
        .limit(1);

      expect(checkout).toBeDefined();
      expect(checkout.organizationId).toBe(organizationId);
      expect(checkout.planId).toBe(proPlan.id);
      expect(checkout.status).toBe("pending");
      expect(checkout.expiresAt).toBeInstanceOf(Date);
      expect(checkout.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test("should still have trial subscription (not activated yet)", async () => {
      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
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
      // Use the payment link ID from checkout to simulate real Pagarme flow
      const payload = webhookPayloads.subscriptionCreatedFromPaymentLink(
        paymentLinkId,
        customerData
      );

      const request = createWebhookRequest(WEBHOOK_URL, payload);
      const response = await app.handle(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.received).toBe(true);
    });

    test("should activate subscription", async () => {
      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.pagarmeSubscriptionId).toBeString();
      expect(subscription.pagarmeSubscriptionId?.startsWith("sub_")).toBe(true);
      expect(subscription.trialUsed).toBe(true);
    });

    test("should store pagarmeCustomerId in subscription", async () => {
      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.pagarmeCustomerId).toBeString();
      expect(subscription.pagarmeCustomerId?.startsWith("cus_")).toBe(true);
    });

    test("should set current period dates", async () => {
      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
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
        .from(pendingCheckouts)
        .where(eq(pendingCheckouts.paymentLinkId, paymentLinkId))
        .limit(1);

      expect(checkout.status).toBe("completed");
      expect(checkout.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("Fase 4: Sync de Dados do Customer", () => {
    test("should sync pagarmeCustomerId to organization profile", async () => {
      const [profile] = await db
        .select()
        .from(organizationProfiles)
        .where(eq(organizationProfiles.organizationId, organizationId))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBeString();
      expect(profile.pagarmeCustomerId?.startsWith("cus_")).toBe(true);
    });

    test("should not overwrite existing profile data", async () => {
      const [profile] = await db
        .select()
        .from(organizationProfiles)
        .where(eq(organizationProfiles.organizationId, organizationId))
        .limit(1);

      // Profile was created with data in createTestUser, should not be overwritten
      expect(profile.tradeName).toBeDefined();
      expect(profile.tradeName).not.toBe("");
    });
  });

  describe("Fase 5: Validação Final", () => {
    test("should have complete active subscription", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
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
      expect(subscription.planId).toBe(proPlan.id);
    });

    test("should reject new checkout for already active subscription", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
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
            planId: proPlan.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
    });

    test("should have synced customer data in profile", async () => {
      const [profile] = await db
        .select()
        .from(organizationProfiles)
        .where(eq(organizationProfiles.organizationId, organizationId))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBeDefined();
      expect(profile.pagarmeCustomerId?.startsWith("cus_")).toBe(true);
    });
  });
});
