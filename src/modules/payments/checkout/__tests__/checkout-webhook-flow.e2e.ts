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

let goldPlanResult: CreatePlanResult;

test.describe("Checkout + Webhook E2E Flow", () => {
  test.beforeAll(async () => {
    if (!TUNNEL_URL) {
      console.log("TUNNEL_URL not set - skipping webhook E2E tests");
      return;
    }
    // Create plans dynamically using factories
    goldPlanResult = await PlanFactory.createPaid("gold");
  });

  test("should complete checkout and activate subscription via webhook", async ({
    page,
  }) => {
    // Skip if no tunnel URL
    test.skip(!TUNNEL_URL, "TUNNEL_URL required - run with cloudflare tunnel");

    test.setTimeout(120_000); // 2 minutes for full flow

    // 1. Setup: Create user with trial subscription
    const { user, session, organizationId } =
      await UserFactory.createWithOrganization({ emailVerified: true });

    // Create billing profile (required for checkout)
    await BillingProfileFactory.create({ organizationId });

    // Get first tier for the plan
    const tier = goldPlanResult.tiers[0];

    await SubscriptionFactory.createTrial(
      organizationId,
      goldPlanResult.plan.id
    );

    // 2. Create checkout with tunnel URL for webhook
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
    const body = await checkoutResponse.json();
    const { checkoutUrl, paymentLinkId } = body.data;

    console.log(`Checkout URL: ${checkoutUrl}`);
    console.log(`Payment Link ID: ${paymentLinkId}`);
    console.log(`Webhook URL: ${TUNNEL_URL}/v1/payments/webhooks/pagarme`);

    // 3. Navigate to Pagar.me checkout
    await page.goto(checkoutUrl);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(PAGARME_URL_REGEX);

    // 4. Fill customer data (step 1)
    await page.getByPlaceholder("anasilva@exemplo.com").click();
    await page
      .getByPlaceholder("anasilva@exemplo.com")
      .pressSequentially(user.email, { delay: 50 });

    await page.getByPlaceholder("Ana Cristina da Silva").click();
    await page
      .getByPlaceholder("Ana Cristina da Silva")
      .pressSequentially("Test User E2E", { delay: 50 });

    await page.getByPlaceholder("000.000.000-00").click();
    await page
      .getByPlaceholder("000.000.000-00")
      .pressSequentially("12345678909", { delay: 50 });

    await page.getByPlaceholder("(00) 0 0000-0000").click();
    await page
      .getByPlaceholder("(00) 0 0000-0000")
      .pressSequentially("11999999999", { delay: 50 });

    await page.screenshot({
      path: "test-results/checkout-webhook-step1.png",
    });

    // 5. Click continue to step 2
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.waitForTimeout(1000);

    // 6. Fill address
    await page.getByPlaceholder("00000-000").click();
    await page
      .getByPlaceholder("00000-000")
      .pressSequentially("80250104", { delay: 50 });
    await page.waitForTimeout(2000); // Wait for CEP auto-fill

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
      .pressSequentially("100", { delay: 50 });

    // 7. Fill credit card
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

    // 8. Check agreement and submit
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    await page.getByText(AGREEMENT_CHECKBOX_REGEX).click();

    await page.screenshot({
      path: "test-results/checkout-webhook-step2.png",
    });

    await page.getByRole("button", { name: "Finalizar" }).click();

    // 9. Wait for payment to process
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: "test-results/checkout-webhook-payment.png",
    });

    console.log("Payment submitted, waiting for webhook...");

    // 10. Wait for webhook to activate subscription
    const subscription = await waitForSubscriptionActive(organizationId, {
      timeout: 60_000, // 60 seconds max
      interval: 2000, // Check every 2 seconds
    });

    console.log("Subscription activated!");

    // 11. Verify subscription data
    expect(subscription.status).toBe("active");
    expect(subscription.pagarmeSubscriptionId).toBeDefined();
    expect(subscription.pagarmeSubscriptionId).toContain("sub_");
    expect(subscription.currentPeriodStart).toBeDefined();
    expect(subscription.currentPeriodEnd).toBeDefined();

    // 12. Verify pending checkout was marked completed
    const [checkout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
      .limit(1);

    expect(checkout.status).toBe("completed");
    expect(checkout.completedAt).toBeDefined();

    console.log("Full E2E flow completed successfully!");
    console.log(`  - Organization: ${organizationId}`);
    console.log(`  - Subscription ID: ${subscription.pagarmeSubscriptionId}`);
    console.log(`  - Status: ${subscription.status}`);
  });
});
