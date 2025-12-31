import "dotenv/config";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { proPlan, starterPlan } from "@/test/fixtures/plans";
import { createTestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import {
  createTestSubscription,
  waitForSubscriptionActive,
} from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";

/**
 * E2E Test: Complete Upgrade Flow with Real Webhook
 *
 * This test validates the entire upgrade flow from trial to paid subscription,
 * including real interaction with Pagarme checkout and webhook processing.
 *
 * Requirements:
 * - TUNNEL_URL environment variable must be set (use cloudflare tunnel or ngrok)
 * - Pagarme webhook must be configured to send to: ${TUNNEL_URL}/v1/payments/webhooks/pagarme
 *
 * Run with: bun run test:e2e src/modules/payments/__tests__/upgrade-use-case.e2e.ts
 */

const TUNNEL_URL = process.env.TUNNEL_URL;
const PAGARME_URL_REGEX = /pagar\.me/;
const AGREEMENT_CHECKBOX_REGEX =
  /Concordo com a realização de cobranças automáticas/;

// Pagarme test card that simulates approved transaction
const TEST_CARD = {
  number: "4000000000000010",
  holder: "TEST USER",
  expMonth: "12",
  expYear: "30",
  cvv: "123",
};

// Test customer data
const TEST_CUSTOMER = {
  name: "João da Silva E2E",
  cpf: "12345678909",
  phone: "11999999999",
  cep: "80250104",
  street: "Rua Teste E2E",
  neighborhood: "Centro",
  number: "100",
};

test.describe("Upgrade Use Case E2E: Trial → Paid Subscription (Real Webhook)", () => {
  test.beforeAll(async () => {
    if (!TUNNEL_URL) {
      console.log(
        "TUNNEL_URL not set - skipping real webhook E2E tests\n" +
          "To run this test, start a tunnel and set TUNNEL_URL environment variable:\n" +
          "  npx cloudflared tunnel --url http://localhost:3000"
      );
      return;
    }
    await seedPlans();

    // Reset pagarmePlanIds for pricing tiers to test sync
    if (proPlan) {
      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.planPricingTiers.planId, proPlan.id));
    }
  });

  test("should complete full upgrade flow: Trial → Checkout → Payment → Webhook → Active", async ({
    page,
  }) => {
    // Skip if no tunnel URL configured
    test.skip(
      !TUNNEL_URL,
      "TUNNEL_URL required - run with cloudflare tunnel or ngrok"
    );

    // Extended timeout for full E2E flow (2 minutes)
    test.setTimeout(120_000);

    // ============================================================
    // FASE 1: Setup - Create User with Trial Subscription
    // ============================================================

    console.log("\n=== FASE 1: Setup - Usuário com Trial ===");

    if (!(proPlan && starterPlan)) {
      throw new Error("Test plans not found in fixtures");
    }

    const { user, session, organizationId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    if (!organizationId) {
      throw new Error("Organization not created for test user");
    }

    console.log(`  User ID: ${user.id}`);
    console.log(`  Organization ID: ${organizationId}`);
    console.log(`  Email: ${user.email}`);

    // Delete any existing subscriptions for clean state
    await db
      .delete(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    await createTestSubscription(organizationId, starterPlan.id, "trial");

    // Verify trial subscription was created
    const [initialSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(initialSubscription).toBeDefined();
    expect(initialSubscription.status).toBe("active"); // Trial is a plan, not a status
    expect(initialSubscription.pagarmeSubscriptionId).toBeNull();

    console.log(`  Trial subscription created: ${initialSubscription.id}`);
    console.log(`  Status: ${initialSubscription.status}`);

    // Verify organization profile has no pagarmeCustomerId
    const [initialProfile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    expect(initialProfile).toBeDefined();
    expect(initialProfile.pagarmeCustomerId).toBeNull();

    console.log("  Profile pagarmeCustomerId: null (as expected)");

    // ============================================================
    // FASE 2: Checkout - Create Payment Link
    // ============================================================

    console.log("\n=== FASE 2: Checkout - Criação do Payment Link ===");

    const app = createTestApp();
    const checkoutResponse = await app.handle(
      new Request("http://localhost/v1/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${session.token}`,
        },
        body: JSON.stringify({
          planId: proPlan.id,
          employeeCount: 10,
          successUrl: `${TUNNEL_URL}/checkout/success`,
        }),
      })
    );

    expect(checkoutResponse.status).toBe(200);

    const checkoutResult = await checkoutResponse.json();
    expect(checkoutResult.success).toBe(true);
    expect(checkoutResult.data.checkoutUrl).toBeDefined();
    expect(checkoutResult.data.checkoutUrl).toContain("pagar.me");
    expect(checkoutResult.data.paymentLinkId).toBeDefined();

    const { checkoutUrl, paymentLinkId } = checkoutResult.data;

    console.log(`  Checkout URL: ${checkoutUrl}`);
    console.log(`  Payment Link ID: ${paymentLinkId}`);
    console.log(`  Webhook URL: ${TUNNEL_URL}/v1/payments/webhooks/pagarme`);

    // Verify pricing tier was synced to Pagarme
    const [pendingCheckoutWithTier] = await db
      .select({
        pricingTierId: schema.pendingCheckouts.pricingTierId,
      })
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
      .limit(1);

    expect(pendingCheckoutWithTier.pricingTierId).toBeDefined();

    const [syncedTier] = await db
      .select({
        pagarmePlanIdMonthly: schema.planPricingTiers.pagarmePlanIdMonthly,
      })
      .from(schema.planPricingTiers)
      .where(
        eq(
          schema.planPricingTiers.id,
          pendingCheckoutWithTier.pricingTierId as string
        )
      )
      .limit(1);

    expect(syncedTier.pagarmePlanIdMonthly).toBeDefined();
    expect(syncedTier.pagarmePlanIdMonthly?.startsWith("plan_")).toBe(true);

    console.log(
      `  Pricing tier synced to Pagarme: ${syncedTier.pagarmePlanIdMonthly}`
    );

    // Verify pending checkout was created
    const [pendingCheckout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
      .limit(1);

    expect(pendingCheckout).toBeDefined();
    expect(pendingCheckout.organizationId).toBe(organizationId);
    expect(pendingCheckout.planId).toBe(proPlan.id);
    expect(pendingCheckout.status).toBe("pending");

    console.log(`  Pending checkout created: ${pendingCheckout.id}`);

    // Verify checkout link email was sent via Mailhog
    const { waitForCheckoutEmail } = await import("@/test/helpers/mailhog");
    const checkoutEmail = await waitForCheckoutEmail(user.email);

    expect(checkoutEmail.subject).toContain("Complete seu upgrade");
    expect(checkoutEmail.checkoutUrl).toBe(checkoutUrl);
    expect(checkoutEmail.planName).toBe(proPlan.displayName);

    console.log(`  Checkout email sent to: ${user.email}`);
    console.log(`  Email subject: ${checkoutEmail.subject}`);

    // Verify subscription is still in trial
    const [subscriptionBeforePayment] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscriptionBeforePayment.status).toBe("active"); // Trial is a plan, not a status

    console.log("  Subscription status: active (trial plan)");

    // ============================================================
    // FASE 3: Payment - Fill Pagarme Checkout Form
    // ============================================================

    console.log(
      "\n=== FASE 3: Payment - Preenchimento do Checkout Pagarme ==="
    );

    // Navigate to Pagarme checkout page
    await page.goto(checkoutUrl);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(PAGARME_URL_REGEX);

    console.log("  Navigated to Pagarme checkout page");

    // Take screenshot for debugging
    await page.screenshot({
      path: "test-results/upgrade-e2e-step1-loaded.png",
    });

    // --- Step 1: Customer Data ---
    console.log("  Filling customer data...");

    // Email
    const emailInput = page.getByPlaceholder("anasilva@exemplo.com");
    await emailInput.click();
    await emailInput.pressSequentially(user.email, { delay: 50 });

    // Full name
    const nameInput = page.getByPlaceholder("Ana Cristina da Silva");
    await nameInput.click();
    await nameInput.pressSequentially(TEST_CUSTOMER.name, { delay: 50 });

    // CPF
    const documentInput = page.getByPlaceholder("000.000.000-00");
    await documentInput.click();
    await documentInput.pressSequentially(TEST_CUSTOMER.cpf, { delay: 50 });

    // Phone
    const phoneInput = page.getByPlaceholder("(00) 0 0000-0000");
    await phoneInput.click();
    await phoneInput.pressSequentially(TEST_CUSTOMER.phone, { delay: 50 });

    await page.screenshot({
      path: "test-results/upgrade-e2e-step1-filled.png",
    });

    // Click "Continue" to go to step 2
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.waitForTimeout(1000);

    console.log("  Customer data filled, proceeding to step 2...");

    // --- Step 2: Address + Card Data ---
    console.log("  Filling address data...");

    // CEP
    const cepInput = page.getByPlaceholder("00000-000");
    await cepInput.click();
    await cepInput.pressSequentially(TEST_CUSTOMER.cep, { delay: 50 });

    // Wait for CEP auto-fill
    await page.waitForTimeout(2000);

    // Fill address if not auto-filled
    const enderecoInput = page.getByPlaceholder("Avenida Água Verde");
    if ((await enderecoInput.inputValue()) === "") {
      await enderecoInput.click();
      await enderecoInput.pressSequentially(TEST_CUSTOMER.street, {
        delay: 50,
      });
    }

    const bairroInput = page.getByPlaceholder("Jardim das Américas");
    if ((await bairroInput.inputValue()) === "") {
      await bairroInput.click();
      await bairroInput.pressSequentially(TEST_CUSTOMER.neighborhood, {
        delay: 50,
      });
    }

    // Number
    const numeroInput = page.getByPlaceholder("123, 12A, 13B");
    await numeroInput.click();
    await numeroInput.pressSequentially(TEST_CUSTOMER.number, { delay: 50 });

    await page.screenshot({
      path: "test-results/upgrade-e2e-step2-address.png",
    });

    console.log("  Filling credit card data...");

    // Card number
    const cardNumberInput = page.getByPlaceholder("0000 0000 0000 0000");
    await cardNumberInput.click();
    await cardNumberInput.pressSequentially(TEST_CARD.number, { delay: 50 });

    // Card holder name
    const holderInput = page.getByPlaceholder("Nome no cartão");
    await holderInput.click();
    await holderInput.pressSequentially(TEST_CARD.holder, { delay: 50 });

    // Expiry date
    const expInput = page.getByPlaceholder("MM/AA");
    await expInput.click();
    await expInput.pressSequentially(
      `${TEST_CARD.expMonth}${TEST_CARD.expYear}`,
      { delay: 50 }
    );

    // CVV
    const cvvInput = page.getByRole("textbox", { name: "CVV" });
    await cvvInput.click();
    await cvvInput.pressSequentially(TEST_CARD.cvv, { delay: 50 });

    // Scroll to reveal checkbox and submit button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Check recurrence agreement checkbox
    const agreementLabel = page.getByText(AGREEMENT_CHECKBOX_REGEX);
    await agreementLabel.click();

    await page.screenshot({
      path: "test-results/upgrade-e2e-step2-complete.png",
    });

    console.log("  Form complete, submitting payment...");

    // Submit payment
    await page.getByRole("button", { name: "Finalizar" }).click();

    // Wait for payment processing
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: "test-results/upgrade-e2e-payment-submitted.png",
    });

    console.log("  Payment submitted!");

    // ============================================================
    // FASE 4: Webhook - Wait for Subscription Activation
    // ============================================================

    console.log("\n=== FASE 4: Webhook - Aguardando Ativação ===");
    console.log("  Waiting for Pagarme webhook to activate subscription...");

    const activatedSubscription = await waitForSubscriptionActive(
      organizationId,
      {
        timeout: 60_000, // 60 seconds max
        interval: 2000, // Check every 2 seconds
      }
    );

    console.log("  Subscription activated via webhook!");
    console.log(`  Status: ${activatedSubscription.status}`);
    console.log(
      `  Pagarme Subscription ID: ${activatedSubscription.pagarmeSubscriptionId}`
    );

    // ============================================================
    // FASE 5: Verification - Validate All Data
    // ============================================================

    console.log("\n=== FASE 5: Verification - Validação Final ===");

    // Verify subscription is active with all required data
    expect(activatedSubscription.status).toBe("active");
    expect(activatedSubscription.pagarmeSubscriptionId).toBeDefined();
    expect(
      activatedSubscription.pagarmeSubscriptionId?.startsWith("sub_")
    ).toBe(true);
    expect(activatedSubscription.trialUsed).toBe(true);
    expect(activatedSubscription.currentPeriodStart).toBeDefined();
    expect(activatedSubscription.currentPeriodEnd).toBeDefined();

    console.log("  [OK] Subscription status: active");
    console.log(
      `  [OK] Pagarme Subscription ID: ${activatedSubscription.pagarmeSubscriptionId}`
    );
    console.log("  [OK] Trial marked as used");
    console.log(
      `  [OK] Current period: ${activatedSubscription.currentPeriodStart?.toISOString()} → ${activatedSubscription.currentPeriodEnd?.toISOString()}`
    );

    // Verify pending checkout was marked as completed
    const [completedCheckout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
      .limit(1);

    expect(completedCheckout.status).toBe("completed");
    expect(completedCheckout.completedAt).toBeDefined();

    console.log("  [OK] Pending checkout marked as completed");

    // Verify customer data was synced to organization profile
    const [finalProfile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    expect(finalProfile.pagarmeCustomerId).toBeDefined();
    expect(finalProfile.pagarmeCustomerId?.startsWith("cus_")).toBe(true);

    console.log(
      `  [OK] Profile pagarmeCustomerId synced: ${finalProfile.pagarmeCustomerId}`
    );

    // Verify webhook event was recorded
    const [webhookEvent] = await db
      .select()
      .from(schema.subscriptionEvents)
      .where(eq(schema.subscriptionEvents.eventType, "subscription.created"))
      .orderBy(schema.subscriptionEvents.createdAt)
      .limit(1);

    if (webhookEvent) {
      expect(webhookEvent.processedAt).toBeDefined();
      console.log(`  [OK] Webhook event recorded: ${webhookEvent.id}`);
    }

    // ============================================================
    // FASE 6: Negative Test - Verify Checkout is Blocked
    // ============================================================

    console.log("\n=== FASE 6: Negative Test - Checkout Bloqueado ===");

    const blockedCheckoutResponse = await app.handle(
      new Request("http://localhost/v1/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${session.token}`,
        },
        body: JSON.stringify({
          planId: proPlan.id,
          employeeCount: 10,
          successUrl: `${TUNNEL_URL}/checkout/success`,
        }),
      })
    );

    expect(blockedCheckoutResponse.status).toBe(400);

    const blockedResult = await blockedCheckoutResponse.json();
    expect(blockedResult.error.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");

    console.log(
      "  [OK] New checkout correctly rejected with SUBSCRIPTION_ALREADY_ACTIVE"
    );

    // ============================================================
    // Summary
    // ============================================================

    console.log("\n=== TESTE E2E COMPLETO COM SUCESSO ===");
    console.log(`  Organization: ${organizationId}`);
    console.log(`  Plan: ${proPlan.displayName}`);
    console.log(
      `  Subscription: ${activatedSubscription.pagarmeSubscriptionId}`
    );
    console.log(`  Customer: ${finalProfile.pagarmeCustomerId}`);
    console.log(
      `  Next billing: ${activatedSubscription.currentPeriodEnd?.toISOString()}`
    );
  });
});
