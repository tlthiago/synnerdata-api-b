import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { billingProfiles } from "@/db/schema/billing-profiles";
import { env } from "@/env";
import type { PagarmeWebhookPayload } from "@/modules/payments/pagarme/pagarme.types";
import { WebhookPayloadBuilder } from "@/test/builders/webhook-payload.builder";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { createWebhookAuthHeader } from "@/test/support/auth";
import { waitForCheckoutEmail } from "@/test/support/mailhog";
import { skipIntegration } from "@/test/support/skip-integration";

const BASE_URL = env.API_URL;
const WEBHOOK_URL = `${BASE_URL}/v1/payments/webhooks/pagarme`;
const DEFAULT_EMPLOYEE_COUNT = 15;

function createWebhookRequest(
  url: string,
  payload: PagarmeWebhookPayload
): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: createWebhookAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
}

describe.skipIf(skipIntegration)(
  "Upgrade Use Case: Trial → Paid Subscription - Pagarme API",
  () => {
    let app: TestApp;
    let sessionHeaders: Record<string, string>;
    let organizationId: string;
    let userEmail: string;
    let paymentLinkId: string;
    let checkoutUrl: string;
    let tierId: string;
    let trialPlanResult: CreatePlanResult;
    let diamondPlanResult: CreatePlanResult;

    beforeAll(async () => {
      app = createTestApp();
      // Create plans dynamically
      trialPlanResult = await PlanFactory.createTrial();
      diamondPlanResult = await PlanFactory.createPaid("diamond");

      // Get tier for employee count (15 falls in 11-20 range)
      const tier = diamondPlanResult.tiers.find(
        (t) =>
          DEFAULT_EMPLOYEE_COUNT >= t.minEmployees &&
          DEFAULT_EMPLOYEE_COUNT <= t.maxEmployees
      );
      if (!tier) {
        throw new Error(
          `No tier found for employee count ${DEFAULT_EMPLOYEE_COUNT}`
        );
      }
      tierId = tier.id;
    });

    describe("Fase 1: Setup - Usuário com Trial", () => {
      test("should create authenticated user with organization", async () => {
        const result = await UserFactory.createWithOrganization({
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
        // Delete any existing subscriptions for this org to ensure clean state
        await db
          .delete(schema.orgSubscriptions)
          .where(eq(schema.orgSubscriptions.organizationId, organizationId));

        await SubscriptionFactory.createTrial(
          organizationId,
          trialPlanResult.plan.id
        );

        const [subscription] = await db
          .select()
          .from(schema.orgSubscriptions)
          .where(eq(schema.orgSubscriptions.organizationId, organizationId))
          .limit(1);

        expect(subscription).toBeDefined();
        expect(subscription.status).toBe("active"); // Trial is a plan, not a status
        expect(subscription.pagarmeSubscriptionId).toBeNull();
      });

      test("should create billing profile for organization", async () => {
        await BillingProfileFactory.create({ organizationId });

        const [profile] = await db
          .select()
          .from(billingProfiles)
          .where(eq(billingProfiles.organizationId, organizationId))
          .limit(1);

        expect(profile).toBeDefined();
        expect(profile.pagarmeCustomerId).toBeNull();
      });
    });

    describe("Fase 2: Checkout - Criação do Payment Link", () => {
      test(
        "should create payment link for upgrade",
        async () => {
          const response = await app.handle(
            new Request(`${BASE_URL}/v1/payments/checkout`, {
              method: "POST",
              headers: {
                ...sessionHeaders,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                planId: diamondPlanResult.plan.id,
                tierId,
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
        // The pricing tier for the employee count should have a Pagarme plan ID
        const [tier] = await db
          .select()
          .from(schema.planPricingTiers)
          .where(
            and(
              eq(schema.planPricingTiers.planId, diamondPlanResult.plan.id),
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
        const [checkout] = await db
          .select()
          .from(schema.pendingCheckouts)
          .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
          .limit(1);

        expect(checkout).toBeDefined();
        expect(checkout.organizationId).toBe(organizationId);
        expect(checkout.planId).toBe(diamondPlanResult.plan.id);
        expect(checkout.status).toBe("pending");
        expect(checkout.pricingTierId).toBeDefined();
        expect(checkout.expiresAt).toBeInstanceOf(Date);
        expect(checkout.expiresAt.getTime()).toBeGreaterThan(Date.now());
      });

      test("should send checkout link email", async () => {
        const emailData = await waitForCheckoutEmail(userEmail);

        expect(emailData.subject).toContain("Complete seu upgrade");
        expect(emailData.checkoutUrl).toBe(checkoutUrl);
        expect(emailData.planName).toBe(diamondPlanResult.plan.displayName);
      });

      test("should still have trial subscription (not activated yet)", async () => {
        const [subscription] = await db
          .select()
          .from(schema.orgSubscriptions)
          .where(eq(schema.orgSubscriptions.organizationId, organizationId))
          .limit(1);

        expect(subscription.status).toBe("active"); // Trial is a plan, not a status
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
        const payload = new WebhookPayloadBuilder()
          .subscriptionCreated()
          .withPaymentLinkCode(paymentLinkId)
          .withCustomer(customerData)
          .build();

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
        expect(subscription.pagarmeSubscriptionId?.startsWith("sub_")).toBe(
          true
        );
        expect(subscription.trialUsed).toBe(true);
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
      test("should sync pagarmeCustomerId to billing profile", async () => {
        const [profile] = await db
          .select()
          .from(billingProfiles)
          .where(eq(billingProfiles.organizationId, organizationId))
          .limit(1);

        expect(profile.pagarmeCustomerId).toBeString();
        expect(profile.pagarmeCustomerId?.startsWith("cus_")).toBe(true);
      });

      test("should not overwrite existing billing profile data", async () => {
        const [profile] = await db
          .select()
          .from(billingProfiles)
          .where(eq(billingProfiles.organizationId, organizationId))
          .limit(1);

        // Profile was created with data, should not be overwritten
        expect(profile.legalName).toBeDefined();
        expect(profile.legalName).not.toBe("");
      });
    });

    describe("Fase 5: Validação Final", () => {
      test("should have complete active subscription", async () => {
        const [subscription] = await db
          .select()
          .from(schema.orgSubscriptions)
          .where(eq(schema.orgSubscriptions.organizationId, organizationId))
          .limit(1);

        // Status
        expect(subscription.status).toBe("active");

        // Pagarme Subscription ID
        expect(subscription.pagarmeSubscriptionId).toBeDefined();
        expect(subscription.pagarmeSubscriptionId?.startsWith("sub_")).toBe(
          true
        );

        // Period
        expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
        expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);

        // Trial
        expect(subscription.trialUsed).toBe(true);

        // Plan
        expect(subscription.planId).toBe(diamondPlanResult.plan.id);
      });

      test("should reject new checkout for already active subscription", async () => {
        const response = await app.handle(
          new Request(`${BASE_URL}/v1/payments/checkout`, {
            method: "POST",
            headers: {
              ...sessionHeaders,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              planId: diamondPlanResult.plan.id,
              tierId,
              successUrl: "https://example.com/success",
            }),
          })
        );

        expect(response.status).toBe(400);

        const body = await response.json();
        expect(body.error.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
      });

      test("should have synced customer data in billing profile", async () => {
        const [profile] = await db
          .select()
          .from(billingProfiles)
          .where(eq(billingProfiles.organizationId, organizationId))
          .limit(1);

        expect(profile.pagarmeCustomerId).toBeDefined();
        expect(profile.pagarmeCustomerId?.startsWith("cus_")).toBe(true);
      });
    });
  }
);
