import { describe, expect, test } from "bun:test";
import { renderEmail } from "../render";
import { CancellationScheduledEmail } from "../templates/payments/cancellation-scheduled";
import { CheckoutLinkEmail } from "../templates/payments/checkout-link";
import { PaymentFailedEmail } from "../templates/payments/payment-failed";
import { PlanChangeExecutedEmail } from "../templates/payments/plan-change-executed";
import { PriceAdjustmentEmail } from "../templates/payments/price-adjustment";
import { SubscriptionCanceledEmail } from "../templates/payments/subscription-canceled";
import { TrialExpiredEmail } from "../templates/payments/trial-expired";
import { TrialExpiringEmail } from "../templates/payments/trial-expiring";
import { UpgradeConfirmationEmail } from "../templates/payments/upgrade-confirmation";

describe("payment email templates", () => {
  test("UpgradeConfirmationEmail renders with plan details", async () => {
    const { html, text } = await renderEmail(
      <UpgradeConfirmationEmail
        cardLast4="4242"
        nextBillingDate={new Date("2026-04-01")}
        organizationName="Acme Corp"
        planName="Professional"
        planPrice={9900}
      />
    );
    expect(html).toContain("Professional");
    expect(html).toContain("Acme Corp");
    expect(html).toContain("4242");
    expect(html).toContain("Gerenciar Assinatura");
    expect(text).toContain("Professional");
  });

  test("UpgradeConfirmationEmail handles null billing date and no card", async () => {
    const { html } = await renderEmail(
      <UpgradeConfirmationEmail
        nextBillingDate={null}
        organizationName="Test Org"
        planName="Basic"
        planPrice={4900}
      />
    );
    expect(html).toContain("N/A");
    expect(html).not.toContain("4242");
  });

  test("TrialExpiringEmail renders with days remaining", async () => {
    const { html, text } = await renderEmail(
      <TrialExpiringEmail
        daysRemaining={3}
        organizationName="Startup Inc"
        trialEndDate={new Date("2026-03-04")}
        userName="Maria"
      />
    );
    expect(html).toContain("Maria");
    expect(html).toContain("Startup Inc");
    expect(html).toContain("3 dias");
    expect(html).toContain("Fazer Upgrade Agora");
    expect(text).toContain("3 dias");
  });

  test("TrialExpiredEmail renders", async () => {
    const { html } = await renderEmail(
      <TrialExpiredEmail organizationName="My Org" userName="João" />
    );
    expect(html).toContain("João");
    expect(html).toContain("My Org");
    expect(html).toContain("expirou");
    expect(html).toContain("30 dias");
  });

  test("CancellationScheduledEmail renders with access date and success button", async () => {
    const { html } = await renderEmail(
      <CancellationScheduledEmail
        accessUntil={new Date("2026-04-15")}
        organizationName="Acme"
        planName="Pro"
      />
    );
    expect(html).toContain("Acme");
    expect(html).toContain("Pro");
    expect(html).toContain("Restaurar Assinatura");
    expect(html).toContain("Mudou de ideia");
  });

  test("SubscriptionCanceledEmail renders with all details", async () => {
    const { html } = await renderEmail(
      <SubscriptionCanceledEmail
        accessUntil={new Date("2026-04-01")}
        canceledAt={new Date("2026-03-01T14:30:00")}
        organizationName="Org X"
        planName="Enterprise"
      />
    );
    expect(html).toContain("Org X");
    expect(html).toContain("Enterprise");
    expect(html).toContain("Reativar Assinatura");
  });

  test("SubscriptionCanceledEmail handles null accessUntil", async () => {
    const { html } = await renderEmail(
      <SubscriptionCanceledEmail
        accessUntil={null}
        canceledAt={new Date("2026-03-01")}
        organizationName="Org"
        planName="Basic"
      />
    );
    expect(html).not.toContain("Acesso até");
  });

  test("PriceAdjustmentEmail renders with old and new prices", async () => {
    const { html } = await renderEmail(
      <PriceAdjustmentEmail
        newPrice={12_900}
        oldPrice={9900}
        organizationName="Corp"
        planName="Pro"
        reason="Reajuste anual"
      />
    );
    expect(html).toContain("Corp");
    expect(html).toContain("Pro");
    expect(html).toContain("Reajuste anual");
    expect(html).toContain("Ver Assinatura");
  });

  test("PlanChangeExecutedEmail renders with both plan names", async () => {
    const { html } = await renderEmail(
      <PlanChangeExecutedEmail
        newPlanName="Professional"
        organizationName="Acme"
        previousPlanName="Basic"
      />
    );
    expect(html).toContain("Basic");
    expect(html).toContain("Professional");
    expect(html).toContain("Gerenciar Assinatura");
  });

  test("PaymentFailedEmail renders with grace period", async () => {
    const { html } = await renderEmail(
      <PaymentFailedEmail
        errorMessage="Cartão recusado"
        gracePeriodEnds={new Date("2026-03-15")}
        organizationName="Acme"
        planName="Pro"
      />
    );
    expect(html).toContain("Acme");
    expect(html).toContain("Cartão recusado");
    expect(html).toContain("Atualizar Pagamento");
  });

  test("PaymentFailedEmail renders without error message", async () => {
    const { html } = await renderEmail(
      <PaymentFailedEmail
        gracePeriodEnds={new Date("2026-03-15")}
        organizationName="Org"
        planName="Basic"
      />
    );
    expect(html).not.toContain("Motivo:");
  });

  test("CheckoutLinkEmail renders with checkout url and expiry", async () => {
    const { html } = await renderEmail(
      <CheckoutLinkEmail
        checkoutUrl="https://checkout.stripe.com/abc"
        expiresAt={new Date("2026-03-02T14:30:00")}
        organizationName="Startup"
        planName="Pro"
        userName="Maria"
      />
    );
    expect(html).toContain("Maria");
    expect(html).toContain("Startup");
    expect(html).toContain("Pro");
    expect(html).toContain("https://checkout.stripe.com/abc");
    expect(html).toContain("Continuar Pagamento");
    expect(html).toContain("copie e cole");
  });
});
