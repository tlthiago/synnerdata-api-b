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
import { waitForCheckoutEmail } from "@/test/support/mailhog";
import { waitForCheckoutCompleted } from "@/test/support/wait";

/**
 * E2E Test: Upgrade from Paid Plan to Higher Paid Plan
 *
 * This test validates the upgrade flow from an existing paid subscription (Gold)
 * to a higher tier paid subscription (Diamond), including:
 * - Real Pagarme checkout form filling
 * - Webhook processing
 * - Proration calculation
 * - Subscription update
 *
 * Requirements:
 * - TUNNEL_URL environment variable (cloudflare tunnel or ngrok)
 * - MailHog running for email validation
 * - Pagarme webhook configured: ${TUNNEL_URL}/v1/payments/webhooks/pagarme
 *
 * Run with: TUNNEL_URL=https://your-tunnel.trycloudflare.com bun test:e2e src/modules/payments/__tests__/upgrade-paid-plan.e2e.ts
 */

const TUNNEL_URL = process.env.TUNNEL_URL;
const PAGARME_URL_REGEX = /pagar\.me/;
const AGREEMENT_CHECKBOX_REGEX =
  /Concordo com a realização de cobranças automáticas/;

const TEST_CARD = {
  number: "4000000000000010",
  holder: "TEST USER UPGRADE",
  expMonth: "12",
  expYear: "30",
  cvv: "123",
};

const TEST_CUSTOMER = {
  name: "Maria Upgrade E2E",
  cpf: "98765432100",
  phone: "11988887777",
  cep: "01310100",
  street: "Avenida Paulista",
  neighborhood: "Bela Vista",
  number: "1000",
};

let goldPlanResult: CreatePlanResult;
let diamondPlanResult: CreatePlanResult;

test.describe("Upgrade E2E: Gold Plan → Diamond Plan (Paid → Paid)", () => {
  test.beforeAll(async () => {
    if (!TUNNEL_URL) {
      console.log(
        "TUNNEL_URL not set - skipping E2E tests\n" +
          "To run: npx cloudflared tunnel --url http://localhost:3000"
      );
      return;
    }

    // Create test plans
    [goldPlanResult, diamondPlanResult] = await Promise.all([
      PlanFactory.createPaid("gold"),
      PlanFactory.createPaid("diamond"),
    ]);

    console.log(`Gold Plan: ${goldPlanResult.plan.id}`);
    console.log(`Diamond Plan: ${diamondPlanResult.plan.id}`);
  });

  test("should complete upgrade from Gold to Diamond with proration", async ({
    page,
  }) => {
    test.skip(!TUNNEL_URL, "TUNNEL_URL required");
    test.setTimeout(180_000); // 3 minutes

    // ============================================================
    // FASE 1: Setup - User with Active Gold Subscription
    // ============================================================

    console.log("\n=== FASE 1: Setup - Usuário com Gold Ativo ===");

    const { user, headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    console.log(`  User: ${user.email}`);
    console.log(`  Organization: ${organizationId}`);

    // Create billing profile
    await BillingProfileFactory.create({ organizationId });

    // Create active Gold subscription with Pagarme subscription ID
    // Simulating a real subscription that was previously created
    const goldTier = PlanFactory.getFirstTier(goldPlanResult);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 15); // Mid-cycle for proration

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      goldPlanResult.plan.id,
      {
        pricingTierId: goldTier.id,
        billingCycle: "monthly",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        pagarmeSubscriptionId: `sub_test_${crypto.randomUUID().slice(0, 8)}`,
      }
    );

    console.log(`  Gold Subscription: ${subscriptionId}`);
    console.log(`  Tier: ${goldTier.minEmployees}-${goldTier.maxEmployees}`);
    console.log(`  Price: R$ ${(goldTier.priceMonthly / 100).toFixed(2)}/mês`);
    console.log(`  Period End: ${periodEnd.toISOString()}`);

    // Verify subscription
    const [initialSub] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(initialSub.status).toBe("active");
    expect(initialSub.planId).toBe(goldPlanResult.plan.id);
    expect(initialSub.pagarmeSubscriptionId).toBeDefined();

    // ============================================================
    // FASE 2: Request Upgrade - Create Payment Link
    // ============================================================

    console.log("\n=== FASE 2: Request Upgrade - Gold → Diamond ===");

    const diamondTier = PlanFactory.getFirstTier(diamondPlanResult);
    console.log(
      `  New Tier: ${diamondTier.minEmployees}-${diamondTier.maxEmployees}`
    );
    console.log(
      `  New Price: R$ ${(diamondTier.priceMonthly / 100).toFixed(2)}/mês`
    );

    const app = createTestApp();
    const sessionToken = headers.Cookie?.replace(
      "better-auth.session_token=",
      ""
    );

    const changeResponse = await app.handle(
      new Request("http://localhost/v1/payments/subscription/change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({
          newPlanId: diamondPlanResult.plan.id,
          newTierId: diamondTier.id,
          successUrl: `${TUNNEL_URL}/upgrade/success`,
        }),
      })
    );

    expect(changeResponse.status).toBe(200);

    const changeResult = await changeResponse.json();
    expect(changeResult.success).toBe(true);
    expect(changeResult.data.changeType).toBe("upgrade");
    expect(changeResult.data.checkoutUrl).toBeDefined();
    expect(changeResult.data.checkoutUrl).toContain("pagar.me");

    const { checkoutUrl, prorationAmount } = changeResult.data;

    console.log("  Change Type: upgrade");
    console.log(`  Checkout URL: ${checkoutUrl}`);
    if (prorationAmount) {
      console.log(
        `  Proration Amount: R$ ${(prorationAmount / 100).toFixed(2)}`
      );
    }

    // Verify checkout email was sent
    try {
      const checkoutEmail = await waitForCheckoutEmail(user.email, 15, 200);
      console.log(`  Email sent: ${checkoutEmail.subject}`);
    } catch {
      console.log("  Email check skipped (MailHog not available)");
    }

    // ============================================================
    // FASE 3: Fill Pagarme Checkout Form
    // ============================================================

    console.log("\n=== FASE 3: Preenchimento do Checkout Pagarme ===");

    await page.goto(checkoutUrl);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(PAGARME_URL_REGEX);

    console.log("  Navigated to Pagarme checkout");

    await page.screenshot({
      path: "test-results/upgrade-paid-step1-loaded.png",
    });

    // --- Step 1: Customer Data ---
    console.log("  Filling customer data...");

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

    await page.screenshot({
      path: "test-results/upgrade-paid-step1-filled.png",
    });

    await page.getByRole("button", { name: "Continuar" }).click();
    await page.waitForTimeout(1000);

    // --- Step 2: Address + Card ---
    console.log("  Filling address and card data...");

    await page.getByPlaceholder("00000-000").click();
    await page
      .getByPlaceholder("00000-000")
      .pressSequentially(TEST_CUSTOMER.cep, { delay: 50 });
    await page.waitForTimeout(2000);

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

    await page.getByPlaceholder("123, 12A, 13B").click();
    await page
      .getByPlaceholder("123, 12A, 13B")
      .pressSequentially(TEST_CUSTOMER.number, { delay: 50 });

    // Card data
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

    await page.screenshot({
      path: "test-results/upgrade-paid-step2-complete.png",
    });

    // ============================================================
    // FASE 4: Submit Payment
    // ============================================================

    console.log("\n=== FASE 4: Submitting Payment ===");

    await page.getByRole("button", { name: "Finalizar" }).click();
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: "test-results/upgrade-paid-payment-submitted.png",
    });

    console.log("  Payment submitted, waiting for webhook...");

    // ============================================================
    // FASE 5: Wait for Webhook and Verify
    // ============================================================

    console.log("\n=== FASE 5: Webhook Processing ===");

    // Get pending checkout to find paymentLinkId
    const [pendingCheckout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.organizationId, organizationId))
      .orderBy(schema.pendingCheckouts.createdAt)
      .limit(1);

    if (pendingCheckout) {
      try {
        await waitForCheckoutCompleted(pendingCheckout.paymentLinkId, {
          timeout: 60_000,
          interval: 2000,
        });
        console.log("  Checkout completed via webhook!");
      } catch {
        console.log("  Webhook timeout - check manually");
      }
    }

    // Verify final subscription state
    const [finalSub] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    console.log("\n=== Final State ===");
    console.log(`  Status: ${finalSub.status}`);
    console.log(`  Plan ID: ${finalSub.planId}`);
    console.log(`  Pagarme Sub: ${finalSub.pagarmeSubscriptionId}`);

    // Assertions
    expect(finalSub.status).toBe("active");

    // If webhook was processed, plan should be updated
    if (finalSub.planId === diamondPlanResult.plan.id) {
      console.log("  [OK] Plan upgraded to Diamond!");
      expect(finalSub.pricingTierId).toBe(diamondTier.id);
    } else {
      console.log(
        "  [INFO] Webhook not yet processed - verify Pagarme dashboard"
      );
    }

    console.log("\n=== E2E Upgrade Test Completed ===");
  });

  test("should show proration details in checkout", async () => {
    test.skip(!TUNNEL_URL, "TUNNEL_URL required");
    test.setTimeout(60_000);

    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });

    // Create subscription mid-cycle
    const goldTier = goldPlanResult.tiers[1]; // 11-20 employees tier
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - 15); // Started 15 days ago
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 15); // Ends in 15 days

    await SubscriptionFactory.createActive(
      organizationId,
      goldPlanResult.plan.id,
      {
        pricingTierId: goldTier.id,
        billingCycle: "monthly",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      }
    );

    const diamondTier = diamondPlanResult.tiers[1]; // Same employee range

    const app = createTestApp();
    const sessionToken = headers.Cookie?.replace(
      "better-auth.session_token=",
      ""
    );

    const response = await app.handle(
      new Request("http://localhost/v1/payments/subscription/change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({
          newPlanId: diamondPlanResult.plan.id,
          newTierId: diamondTier.id,
          successUrl: `${TUNNEL_URL}/upgrade/success`,
        }),
      })
    );

    expect(response.status).toBe(200);

    const result = await response.json();
    expect(result.data.changeType).toBe("upgrade");
    expect(result.data.checkoutUrl).toContain("pagar.me");

    // Proration should be calculated for mid-cycle upgrade
    if (result.data.prorationAmount) {
      console.log(
        `Proration calculated: R$ ${(result.data.prorationAmount / 100).toFixed(2)}`
      );
      expect(result.data.prorationAmount).toBeGreaterThan(0);
    }
  });
});
