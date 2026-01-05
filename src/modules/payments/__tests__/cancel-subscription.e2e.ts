import "dotenv/config";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp } from "@/test/support/app";
import { waitForSubscriptionActive } from "@/test/support/wait";

/**
 * E2E Test: Soft Cancel Subscription Flow
 *
 * This test validates the soft cancel flow with real Pagar.me integration:
 * 1. Create a paid subscription (via upgrade from trial)
 * 2. Cancel via API (sets local flags only, no Pagar.me call)
 * 3. Verify subscription remains active with cancelAtPeriodEnd=true
 * 4. Verify user still has access
 * 5. Verify restore works (clears flags)
 * 6. Cancel again and verify final state
 *
 * Note: The actual Pagar.me cancellation happens via processScheduledCancellations()
 * job at period end, tested separately in soft-cancel-use-case.test.ts
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

let goldPlanResult: CreatePlanResult;
let trialPlanResult: CreatePlanResult;

test.describe("Soft Cancel Subscription E2E: Active → Cancel → Restore → Cancel", () => {
  test.beforeAll(async () => {
    if (!TUNNEL_URL) {
      console.log(
        "TUNNEL_URL not set - skipping cancel subscription E2E tests"
      );
      return;
    }
    goldPlanResult = await PlanFactory.createPaid("gold");
    trialPlanResult = await PlanFactory.createTrial();
  });

  test("should complete soft cancel flow: Active → Cancel (flags only) → Restore → Cancel", async ({
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

    const { user, session, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    console.log(`  Organization ID: ${organizationId}`);

    // Create billing profile
    await BillingProfileFactory.create({ organizationId });

    // Create trial subscription
    await db
      .delete(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    await SubscriptionFactory.createTrial(
      organizationId,
      trialPlanResult.plan.id
    );
    console.log("  Trial subscription created");

    // Get first tier for checkout
    const tier = goldPlanResult.tiers[0];

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
          planId: goldPlanResult.plan.id,
          tierId: tier.id,
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
    // FASE 2: Soft Cancel via API (flags only, no Pagar.me call)
    // ============================================================

    console.log("\n=== FASE 2: Soft Cancel via API ===");

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

    // Verify local state after API call - status should remain "active"
    const [subscriptionAfterCancel] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscriptionAfterCancel.status).toBe("active"); // Soft cancel: status unchanged
    expect(subscriptionAfterCancel.cancelAtPeriodEnd).toBe(true);
    expect(subscriptionAfterCancel.canceledAt).toBeInstanceOf(Date);

    console.log("  [OK] Status remains: active (soft cancel)");
    console.log("  [OK] cancelAtPeriodEnd: true");
    console.log(`  [OK] canceledAt: ${subscriptionAfterCancel.canceledAt}`);

    // ============================================================
    // FASE 3: Verify Access Still Exists (Soft Cancel)
    // ============================================================

    console.log("\n=== FASE 3: Verify Access Still Exists ===");

    const { SubscriptionService } = await import(
      "../subscription/subscription.service"
    );
    const accessAfterCancel =
      await SubscriptionService.checkAccess(organizationId);

    expect(accessAfterCancel.hasAccess).toBe(true); // Soft cancel maintains access
    expect(accessAfterCancel.status).toBe("active");
    expect(accessAfterCancel.requiresPayment).toBe(false);

    console.log("  [OK] hasAccess: true (soft cancel maintains access)");
    console.log("  [OK] status: active");

    // ============================================================
    // FASE 4: Restore Subscription
    // ============================================================

    console.log("\n=== FASE 4: Restore Subscription ===");

    const restoreResponse = await app.handle(
      new Request("http://localhost/v1/payments/subscription/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${session.token}`,
        },
      })
    );

    expect(restoreResponse.status).toBe(200);

    const restoreResult = await restoreResponse.json();
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.data.restored).toBe(true);

    console.log("  Restore API called successfully");

    // Verify flags are cleared
    const [subscriptionAfterRestore] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscriptionAfterRestore.status).toBe("active");
    expect(subscriptionAfterRestore.cancelAtPeriodEnd).toBe(false);
    expect(subscriptionAfterRestore.canceledAt).toBeNull();

    console.log("  [OK] Status: active");
    console.log("  [OK] cancelAtPeriodEnd: false (cleared)");
    console.log("  [OK] canceledAt: null (cleared)");

    // Verify access still exists
    const accessAfterRestore =
      await SubscriptionService.checkAccess(organizationId);
    expect(accessAfterRestore.hasAccess).toBe(true);
    expect(accessAfterRestore.status).toBe("active");

    console.log("  [OK] Access maintained after restore");

    // ============================================================
    // FASE 5: Cancel Again (final state for this test)
    // ============================================================

    console.log("\n=== FASE 5: Cancel Again ===");

    const cancelAgainResponse = await app.handle(
      new Request("http://localhost/v1/payments/subscription/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${session.token}`,
        },
      })
    );

    expect(cancelAgainResponse.status).toBe(200);

    const [finalSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(finalSubscription.status).toBe("active"); // Still active until job runs
    expect(finalSubscription.cancelAtPeriodEnd).toBe(true);
    expect(finalSubscription.canceledAt).toBeInstanceOf(Date);

    console.log("  [OK] Second cancel successful");
    console.log("  [OK] Status: active (until period end)");
    console.log("  [OK] cancelAtPeriodEnd: true");

    // ============================================================
    // FASE 6: Verify Checkout Blocked (active subscription exists)
    // ============================================================

    console.log("\n=== FASE 6: Verify Checkout Blocked ===");

    const newCheckoutResponse = await app.handle(
      new Request("http://localhost/v1/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${session.token}`,
        },
        body: JSON.stringify({
          planId: goldPlanResult.plan.id,
          tierId: tier.id,
          successUrl: `${TUNNEL_URL}/checkout/success`,
        }),
      })
    );

    // Checkout should be blocked because subscription is still active
    expect(newCheckoutResponse.status).toBe(400);

    console.log(
      "  [OK] New checkout blocked (subscription still active until period end)"
    );

    // ============================================================
    // Summary
    // ============================================================

    console.log("\n=== SOFT CANCEL E2E TEST COMPLETE ===");
    console.log(`  Organization: ${organizationId}`);
    console.log(
      `  Pagarme Subscription: ${finalSubscription.pagarmeSubscriptionId}`
    );
    console.log(`  Final status: ${finalSubscription.status}`);
    console.log(`  cancelAtPeriodEnd: ${finalSubscription.cancelAtPeriodEnd}`);
    console.log(`  canceledAt: ${finalSubscription.canceledAt}`);
    console.log(
      "\n  Note: Actual Pagar.me cancellation happens via processScheduledCancellations()"
    );
    console.log("  job at period end (tested in soft-cancel-use-case.test.ts)");
  });
});
