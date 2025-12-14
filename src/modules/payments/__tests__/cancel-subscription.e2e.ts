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
  waitForSubscriptionStatus,
} from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";

/**
 * E2E Test: Cancel Subscription Flow with Real Webhook
 *
 * This test validates the complete cancellation flow:
 * 1. Create a paid subscription (via upgrade from trial)
 * 2. Cancel via API (calls Pagarme)
 * 3. Wait for real webhook from Pagarme
 * 4. Verify subscription is canceled
 *
 * Requirements:
 * - TUNNEL_URL environment variable must be set
 * - Pagarme webhook configured to: ${TUNNEL_URL}/v1/payments/webhooks/pagarme
 */

const TUNNEL_URL = process.env.TUNNEL_URL;
const PAGARME_URL_REGEX = /pagar\.me/;
const AGREEMENT_CHECKBOX_REGEX =
  /Concordo com a realização de cobranças automáticas/;

const TEST_CARD = {
  number: "4000000000000010",
  holder: "TEST USER",
  expMonth: "12",
  expYear: "30",
  cvv: "123",
};

const TEST_CUSTOMER = {
  name: "Cancel Test User",
  cpf: "12345678909",
  phone: "11999999999",
  cep: "80250104",
  number: "100",
};

test.describe("Cancel Subscription E2E: Active → Canceled (Real Webhook)", () => {
  test.beforeAll(async () => {
    if (!TUNNEL_URL) {
      console.log(
        "TUNNEL_URL not set - skipping cancel subscription E2E tests"
      );
      return;
    }
    await seedPlans();
  });

  test("should complete full cancellation flow: Active → Cancel API → Webhook → Canceled", async ({
    page,
  }) => {
    test.skip(
      !TUNNEL_URL,
      "TUNNEL_URL required - run with cloudflare tunnel or ngrok"
    );

    // Extended timeout for full E2E flow (3 minutes)
    test.setTimeout(180_000);

    // ============================================================
    // FASE 1: Setup - Create Active Subscription via Upgrade
    // ============================================================

    console.log("\n=== FASE 1: Setup - Criando Subscription Ativa ===");

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

    console.log(`  Organization ID: ${organizationId}`);

    // Create trial subscription
    await db
      .delete(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    await createTestSubscription(organizationId, starterPlan.id, "trial");
    console.log("  Trial subscription created");

    // Create checkout and complete payment
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
          successUrl: `${TUNNEL_URL}/checkout/success`,
        }),
      })
    );

    expect(checkoutResponse.status).toBe(200);
    const { checkoutUrl } = (await checkoutResponse.json()).data;
    console.log(`  Checkout URL: ${checkoutUrl}`);

    // Navigate and fill Pagarme checkout
    await page.goto(checkoutUrl);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(PAGARME_URL_REGEX);

    // Step 1: Customer data
    await page.getByPlaceholder("anasilva@exemplo.com").click();
    await page
      .getByPlaceholder("anasilva@exemplo.com")
      .pressSequentially(user.email, { delay: 50 });

    await page.getByPlaceholder("Ana Cristina da Silva").click();
    await page
      .getByPlaceholder("Ana Cristina da Silva")
      .pressSequentially(TEST_CUSTOMER.name, { delay: 50 });

    await page.getByPlaceholder("000.000.000-00").click();
    await page
      .getByPlaceholder("000.000.000-00")
      .pressSequentially(TEST_CUSTOMER.cpf, { delay: 50 });

    await page.getByPlaceholder("(00) 0 0000-0000").click();
    await page
      .getByPlaceholder("(00) 0 0000-0000")
      .pressSequentially(TEST_CUSTOMER.phone, { delay: 50 });

    await page.getByRole("button", { name: "Continuar" }).click();
    await page.waitForTimeout(1000);

    // Step 2: Address + Card
    await page.getByPlaceholder("00000-000").click();
    await page
      .getByPlaceholder("00000-000")
      .pressSequentially(TEST_CUSTOMER.cep, { delay: 50 });
    await page.waitForTimeout(2000);

    const enderecoInput = page.getByPlaceholder("Avenida Água Verde");
    if ((await enderecoInput.inputValue()) === "") {
      await enderecoInput.click();
      await enderecoInput.pressSequentially("Rua Teste", { delay: 50 });
    }

    const bairroInput = page.getByPlaceholder("Jardim das Américas");
    if ((await bairroInput.inputValue()) === "") {
      await bairroInput.click();
      await bairroInput.pressSequentially("Centro", { delay: 50 });
    }

    await page.getByPlaceholder("123, 12A, 13B").click();
    await page
      .getByPlaceholder("123, 12A, 13B")
      .pressSequentially(TEST_CUSTOMER.number, { delay: 50 });

    await page.getByPlaceholder("0000 0000 0000 0000").click();
    await page
      .getByPlaceholder("0000 0000 0000 0000")
      .pressSequentially(TEST_CARD.number, { delay: 50 });

    await page.getByPlaceholder("Nome no cartão").click();
    await page
      .getByPlaceholder("Nome no cartão")
      .pressSequentially(TEST_CARD.holder, { delay: 50 });

    await page.getByPlaceholder("MM/AA").click();
    await page
      .getByPlaceholder("MM/AA")
      .pressSequentially(`${TEST_CARD.expMonth}${TEST_CARD.expYear}`, {
        delay: 50,
      });

    await page.getByRole("textbox", { name: "CVV" }).click();
    await page
      .getByRole("textbox", { name: "CVV" })
      .pressSequentially(TEST_CARD.cvv, { delay: 50 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    await page.getByText(AGREEMENT_CHECKBOX_REGEX).click();
    await page.getByRole("button", { name: "Finalizar" }).click();
    await page.waitForTimeout(5000);

    console.log("  Payment submitted, waiting for activation...");

    // Wait for subscription to become active
    const activeSubscription = await waitForSubscriptionActive(organizationId, {
      timeout: 60_000,
      interval: 2000,
    });

    expect(activeSubscription.status).toBe("active");
    expect(activeSubscription.pagarmeSubscriptionId).toBeDefined();

    console.log("  Subscription activated!");
    console.log(
      `  Pagarme Subscription ID: ${activeSubscription.pagarmeSubscriptionId}`
    );

    // ============================================================
    // FASE 2: Cancelamento via API
    // ============================================================

    console.log("\n=== FASE 2: Cancelamento via API ===");

    const cancelResponse = await app.handle(
      new Request("http://localhost/v1/payments/subscription/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${session.token}`,
        },
      })
    );

    expect(cancelResponse.status).toBe(200);

    const cancelResult = await cancelResponse.json();
    expect(cancelResult.success).toBe(true);
    expect(cancelResult.data.cancelAtPeriodEnd).toBe(true);

    console.log("  Cancel API called successfully");
    console.log(
      `  Cancel at period end: ${cancelResult.data.cancelAtPeriodEnd}`
    );
    console.log(`  Current period end: ${cancelResult.data.currentPeriodEnd}`);

    // Verify local state after API call (before webhook)
    const [subscriptionAfterCancel] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscriptionAfterCancel.cancelAtPeriodEnd).toBe(true);
    expect(subscriptionAfterCancel.canceledAt).toBeInstanceOf(Date);

    console.log("  Local cancelAtPeriodEnd: true");
    console.log(`  Local canceledAt: ${subscriptionAfterCancel.canceledAt}`);

    // ============================================================
    // FASE 3: Aguardar Webhook subscription.canceled
    // ============================================================

    console.log("\n=== FASE 3: Aguardando Webhook subscription.canceled ===");
    console.log(
      "  Waiting for Pagarme to send subscription.canceled webhook..."
    );

    const canceledSubscription = await waitForSubscriptionStatus(
      organizationId,
      "canceled",
      {
        timeout: 60_000,
        interval: 2000,
      }
    );

    console.log("  Webhook received! Subscription canceled.");

    // ============================================================
    // FASE 4: Verificações Finais
    // ============================================================

    console.log("\n=== FASE 4: Verificações Finais ===");

    // Verify subscription status
    expect(canceledSubscription.status).toBe("canceled");
    expect(canceledSubscription.canceledAt).toBeInstanceOf(Date);

    console.log("  [OK] Subscription status: canceled");
    console.log(`  [OK] Canceled at: ${canceledSubscription.canceledAt}`);

    // Verify webhook event was recorded
    const [webhookEvent] = await db
      .select()
      .from(schema.subscriptionEvents)
      .where(eq(schema.subscriptionEvents.eventType, "subscription.canceled"))
      .orderBy(schema.subscriptionEvents.createdAt)
      .limit(1);

    if (webhookEvent) {
      expect(webhookEvent.processedAt).toBeInstanceOf(Date);
      console.log(`  [OK] Webhook event recorded: ${webhookEvent.id}`);
    }

    // Verify access is revoked via checkAccess
    const { SubscriptionService } = await import(
      "../subscription/subscription.service"
    );
    const accessCheck = await SubscriptionService.checkAccess(organizationId);

    expect(accessCheck.hasAccess).toBe(false);
    expect(accessCheck.status).toBe("canceled");
    expect(accessCheck.requiresPayment).toBe(true);

    console.log("  [OK] Access check: hasAccess = false");
    console.log("  [OK] Access check: requiresPayment = true");

    // ============================================================
    // FASE 5: Testes Negativos
    // ============================================================

    console.log("\n=== FASE 5: Testes Negativos ===");

    // Test: Restore should fail for fully canceled subscription (via Pagarme)
    const restoreResponse = await app.handle(
      new Request("http://localhost/v1/payments/subscription/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${session.token}`,
        },
      })
    );

    // Restore should fail because subscription is already canceled (not just scheduled)
    expect(restoreResponse.status).toBe(400);
    console.log("  [OK] Restore correctly rejected for canceled subscription");

    // Test: New checkout should be allowed (subscription is no longer active)
    const newCheckoutResponse = await app.handle(
      new Request("http://localhost/v1/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${session.token}`,
        },
        body: JSON.stringify({
          planId: proPlan.id,
          successUrl: `${TUNNEL_URL}/checkout/success`,
        }),
      })
    );

    expect(newCheckoutResponse.status).toBe(200);
    const newCheckoutResult = await newCheckoutResponse.json();
    expect(newCheckoutResult.data.checkoutUrl).toBeDefined();

    console.log("  [OK] New checkout allowed for canceled subscription");

    // ============================================================
    // Summary
    // ============================================================

    console.log("\n=== TESTE E2E DE CANCELAMENTO COMPLETO ===");
    console.log(`  Organization: ${organizationId}`);
    console.log(
      `  Pagarme Subscription: ${canceledSubscription.pagarmeSubscriptionId}`
    );
    console.log(`  Final status: ${canceledSubscription.status}`);
    console.log(`  Canceled at: ${canceledSubscription.canceledAt}`);
  });
});
