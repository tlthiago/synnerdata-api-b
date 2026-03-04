import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { generateCnpj, generateMobile } from "@/test/helpers/faker";
import { createTestApp, type TestApp } from "@/test/support/app";
import { clearMailbox, waitForActivationEmail } from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const CHECKOUT_ENDPOINT = `${BASE_URL}/v1/payments/admin/provisions/checkout`;
const WEBHOOK_ENDPOINT = `${BASE_URL}/v1/payments/webhooks/pagarme`;
const POLLING_ENDPOINT = `${BASE_URL}/v1/public/provision-status`;

function createWebhookAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

describe("e2e: checkout provision — payment, activation, and login", () => {
  let app: TestApp;
  let adminHeaders: Record<string, string>;
  let goldPlanId: string;

  beforeAll(async () => {
    app = createTestApp();

    // Register payment listeners (needed for subscription.activated → provision activation)
    const { registerPaymentListeners } = await import(
      "@/modules/payments/hooks/listeners"
    );
    registerPaymentListeners();

    await PlanFactory.createTrial();
    const goldResult = await PlanFactory.createPaid("gold");
    goldPlanId = goldResult.plan.id;

    const { headers } = await UserFactory.createAdmin();
    adminHeaders = headers;
  });

  test("full flow: admin request → webhook → activation email → define password → login", async () => {
    const NEW_PASSWORD = "SecurePassword123!";
    const ownerEmail = `e2e-checkout-${crypto.randomUUID().slice(0, 8)}@example.com`;

    await clearMailbox(ownerEmail);

    // ── Mock IDs for Pagar.me responses ────────────────────────
    const mockPagarmePlanId = `plan_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const mockPaymentLinkId = `pl_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const mockCheckoutUrl = `https://pagar.me/checkout/${mockPaymentLinkId}`;
    const mockCustomerId = `cus_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

    // ── Step 1: Mock Pagar.me API calls ────────────────────────
    const { PagarmeClient } = await import("@/modules/payments/pagarme/client");

    const createPlanSpy = spyOn(PagarmeClient, "createPlan").mockResolvedValue({
      id: mockPagarmePlanId,
      name: "custom-gold-mock",
      interval: "month",
      interval_count: 1,
      billing_type: "prepaid",
      payment_methods: ["credit_card"],
      currency: "BRL",
      items: [],
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const createPaymentLinkSpy = spyOn(
      PagarmeClient,
      "createPaymentLink"
    ).mockResolvedValue({
      id: mockPaymentLinkId,
      url: mockCheckoutUrl,
      short_url: mockCheckoutUrl,
      status: "active",
      type: "subscription",
      name: "Custom Gold Plan",
      success_url: `${env.APP_URL}/ativacao?email=${encodeURIComponent(ownerEmail)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const createCustomerSpy = spyOn(
      PagarmeClient,
      "createCustomer"
    ).mockResolvedValue({
      id: mockCustomerId,
      name: "E2E Checkout Corp",
      email: "org@empresa.com",
      document: "24004752000199",
      type: "company",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // ── Step 2: Call the real admin checkout provision endpoint ─
    const CUSTOM_MAX_EMPLOYEES = 75;
    const CUSTOM_PRICE_MONTHLY = 5000;

    const payload = {
      ownerName: "E2E Checkout Owner",
      ownerEmail,
      organization: {
        name: "E2E Checkout Corp",
        tradeName: "E2E Fantasia",
        legalName: "E2E Checkout Corp LTDA",
        taxId: generateCnpj(),
        email: "org@empresa.com",
        phone: generateMobile(),
        street: "Rua Exemplo",
        number: "123",
        neighborhood: "Centro",
        city: "Sao Paulo",
        state: "SP",
        zipCode: "01001000",
      },
      organizationSlug: `e2e-checkout-${crypto.randomUUID().slice(0, 8)}`,
      basePlanId: goldPlanId,
      maxEmployees: CUSTOM_MAX_EMPLOYEES,
      billingCycle: "monthly",
      customPriceMonthly: CUSTOM_PRICE_MONTHLY,
      notes: "E2E checkout provision test",
    };

    const provisionResponse = await app.handle(
      new Request(CHECKOUT_ENDPOINT, {
        method: "POST",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(provisionResponse.status).toBe(200);
    const provisionBody = await provisionResponse.json();
    expect(provisionBody.success).toBe(true);

    const provisionData = provisionBody.data;
    expect(provisionData.type).toBe("checkout");
    expect(provisionData.status).toBe("pending_payment");
    expect(provisionData.ownerEmail).toBe(ownerEmail);
    expect(provisionData.checkoutUrl).toBe(mockCheckoutUrl);

    // Verify subscription shows contracted plan data (not interim trial)
    expect(provisionData.subscription).toBeDefined();
    expect(provisionData.subscription.status).toBe("pending_payment");
    expect(provisionData.subscription.maxEmployees).toBe(CUSTOM_MAX_EMPLOYEES);
    expect(provisionData.subscription.billingCycle).toBe("monthly");
    expect(provisionData.subscription.customPriceMonthly).toBe(
      CUSTOM_PRICE_MONTHLY
    );
    expect(provisionData.subscription.planName).toBeString();
    expect(provisionData.subscription.trialDays).toBeNull();
    expect(provisionData.subscription.trialEnd).toBeNull();

    const provisionId = provisionData.id;
    const organizationId = provisionData.organizationId;

    // Restore Pagar.me spies — no longer needed
    createPlanSpy.mockRestore();
    createPaymentLinkSpy.mockRestore();
    createCustomerSpy.mockRestore();

    // ── Step 3: Verify private plan + custom tier were created ──
    const [privatePlan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.organizationId, organizationId))
      .limit(1);

    expect(privatePlan).toBeDefined();
    expect(privatePlan.isPublic).toBe(false);
    expect(privatePlan.isTrial).toBe(false);
    expect(privatePlan.basePlanId).toBe(goldPlanId);

    const [customTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.planId, privatePlan.id))
      .limit(1);

    expect(customTier).toBeDefined();
    expect(customTier.minEmployees).toBe(0);
    expect(customTier.maxEmployees).toBe(CUSTOM_MAX_EMPLOYEES);
    expect(customTier.priceMonthly).toBe(CUSTOM_PRICE_MONTHLY);

    // Verify features were copied from gold plan
    const privateFeatures = await db
      .select()
      .from(schema.planFeatures)
      .where(eq(schema.planFeatures.planId, privatePlan.id));

    const goldFeatures = await db
      .select()
      .from(schema.planFeatures)
      .where(eq(schema.planFeatures.planId, goldPlanId));

    expect(privateFeatures.length).toBe(goldFeatures.length);
    expect(privateFeatures.length).toBeGreaterThan(0);

    // Verify pending checkout references private plan + tier
    const [pendingCheckout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, mockPaymentLinkId))
      .limit(1);

    expect(pendingCheckout).toBeDefined();
    expect(pendingCheckout.planId).toBe(privatePlan.id);
    expect(pendingCheckout.pricingTierId).toBe(customTier.id);
    expect(pendingCheckout.customPriceMonthly).toBe(CUSTOM_PRICE_MONTHLY);

    // Verify org profile enriched
    const [orgProfile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    expect(orgProfile).toBeDefined();
    expect(orgProfile.tradeName).toBe(payload.organization.tradeName);
    expect(orgProfile.legalName).toBe(payload.organization.legalName);
    expect(orgProfile.taxId).toBe(payload.organization.taxId);

    // Verify billing profile created
    const [billingProfile] = await db
      .select()
      .from(schema.billingProfiles)
      .where(eq(schema.billingProfiles.organizationId, organizationId))
      .limit(1);

    expect(billingProfile).toBeDefined();
    expect(billingProfile.legalName).toBe(payload.organization.legalName);
    expect(billingProfile.taxId).toBe(payload.organization.taxId);

    // ── Step 4: Verify polling returns "processing" ────────────
    const pollingBefore = await app.handle(
      new Request(`${POLLING_ENDPOINT}?email=${encodeURIComponent(ownerEmail)}`)
    );

    expect(pollingBefore.status).toBe(200);
    const pollingBeforeBody = await pollingBefore.json();
    expect(pollingBeforeBody.data.status).toBe("processing");

    // ── Step 5: Simulate Pagar.me webhook (subscription.created) ─
    const { WebhookPayloadBuilder } = await import(
      "@/test/builders/webhook-payload.builder"
    );

    const webhookPayload = new WebhookPayloadBuilder()
      .subscriptionCreated()
      .withPaymentLinkCode(mockPaymentLinkId)
      .withCustomer({
        id: mockCustomerId,
        name: "E2E Checkout Owner",
        email: ownerEmail,
        document: payload.organization.taxId,
      })
      .build();

    const webhookResponse = await app.handle(
      new Request(WEBHOOK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: JSON.stringify(webhookPayload),
      })
    );

    expect(webhookResponse.status).toBe(200);
    const webhookBody = await webhookResponse.json();
    expect(webhookBody.success).toBe(true);

    // ── Step 6: Verify subscription activated with custom data ──
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscription.status).toBe("active");
    expect(subscription.pagarmeSubscriptionId).toBeDefined();
    expect(subscription.trialUsed).toBe(true);
    expect(subscription.planId).toBe(privatePlan.id);
    expect(subscription.pricingTierId).toBe(customTier.id);
    expect(subscription.isCustomPrice).toBe(true);
    expect(subscription.priceAtPurchase).toBe(CUSTOM_PRICE_MONTHLY);

    // ── Step 7: Wait for activation email from MailHog ──────────
    // The activation email is sent by the async listener (subscription.activated
    // → provision pending_payment → pending_activation → requestPasswordReset).
    // Waiting for the email implicitly waits for the listener to complete.
    const activationEmail = await waitForActivationEmail(ownerEmail);
    expect(activationEmail.activationUrl).toBeTruthy();

    // ── Step 8: Verify provision transitioned to pending_activation
    const [provisionAfterWebhook] = await db
      .select()
      .from(schema.adminOrgProvisions)
      .where(eq(schema.adminOrgProvisions.id, provisionId))
      .limit(1);

    expect(provisionAfterWebhook.status).toBe("pending_activation");

    // ── Step 9: Verify activation URL structure ─────────────────
    const activationUrl = new URL(activationEmail.activationUrl);
    expect(activationUrl.origin).toBe(env.APP_URL);
    expect(activationUrl.pathname).toBe("/definir-senha");

    const token = activationUrl.searchParams.get("token");
    expect(token).toBeTruthy();

    const emailParam = activationUrl.searchParams.get("email");
    expect(emailParam).toBe(ownerEmail);

    // ── Step 10: Verify polling returns "ready" ─────────────────
    const pollingReady = await app.handle(
      new Request(`${POLLING_ENDPOINT}?email=${encodeURIComponent(ownerEmail)}`)
    );

    expect(pollingReady.status).toBe(200);
    const pollingReadyBody = await pollingReady.json();
    expect(pollingReadyBody.data.status).toBe("ready");
    expect(pollingReadyBody.data.activationUrl).toBeString();

    // ── Step 11: User defines password ──────────────────────────
    const resetResponse = await app.handle(
      new Request(`${BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: NEW_PASSWORD, token }),
      })
    );

    expect(resetResponse.status).toBe(200);

    // ── Step 12: Verify account activation ──────────────────────
    const [userAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, ownerEmail))
      .limit(1);

    expect(userAfter.emailVerified).toBe(true);

    // ── Step 13: Verify provision transitioned to active ────────
    const [provisionFinal] = await db
      .select()
      .from(schema.adminOrgProvisions)
      .where(eq(schema.adminOrgProvisions.id, provisionId))
      .limit(1);

    expect(provisionFinal.status).toBe("active");
    expect(provisionFinal.activatedAt).toBeDefined();

    // ── Step 14: Verify pending checkout marked as completed ────
    const [completedCheckout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, mockPaymentLinkId))
      .limit(1);

    expect(completedCheckout.status).toBe("completed");
    expect(completedCheckout.completedAt).toBeInstanceOf(Date);

    // ── Step 15: Verify polling returns "not_found" (already active)
    const pollingAfter = await app.handle(
      new Request(`${POLLING_ENDPOINT}?email=${encodeURIComponent(ownerEmail)}`)
    );

    expect(pollingAfter.status).toBe(200);
    const pollingAfterBody = await pollingAfter.json();
    expect(pollingAfterBody.data.status).toBe("not_found");

    // ── Step 16: Verify user can login with new password ────────
    const signInResponse = await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ownerEmail,
          password: NEW_PASSWORD,
        }),
      })
    );

    expect(signInResponse.status).toBe(200);
    const setCookie = signInResponse.headers.get("set-cookie");
    expect(setCookie).toContain("better-auth.session_token");
  }, 30_000);
});
