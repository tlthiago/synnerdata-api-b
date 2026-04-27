import { sendEmail } from "@/lib/emails/mailer";
import { renderEmail } from "@/lib/emails/render";
import { CancellationScheduledEmail } from "@/lib/emails/templates/payments/cancellation-scheduled";
import { CheckoutLinkEmail } from "@/lib/emails/templates/payments/checkout-link";
import { PaymentFailedEmail } from "@/lib/emails/templates/payments/payment-failed";
import { PlanChangeExecutedEmail } from "@/lib/emails/templates/payments/plan-change-executed";
import { PriceAdjustmentEmail } from "@/lib/emails/templates/payments/price-adjustment";
import { ProvisionCheckoutLinkEmail } from "@/lib/emails/templates/payments/provision-checkout-link";
import { SubscriptionCanceledEmail } from "@/lib/emails/templates/payments/subscription-canceled";
import { TrialExpiredEmail } from "@/lib/emails/templates/payments/trial-expired";
import { TrialExpiringEmail } from "@/lib/emails/templates/payments/trial-expiring";
import { UpgradeConfirmationEmail } from "@/lib/emails/templates/payments/upgrade-confirmation";

export async function sendUpgradeConfirmationEmail(params: {
  to: string;
  organizationName: string;
  planName: string;
  planPrice: number;
  nextBillingDate: Date | null;
  cardLast4?: string;
}) {
  const { html, text } = await renderEmail(
    <UpgradeConfirmationEmail
      cardLast4={params.cardLast4}
      nextBillingDate={params.nextBillingDate}
      organizationName={params.organizationName}
      planName={params.planName}
      planPrice={params.planPrice}
    />
  );
  await sendEmail({
    to: params.to,
    subject: `Bem-vindo ao Plano ${params.planName} - Synnerdata`,
    html,
    text,
  });
}

export async function sendTrialExpiringEmail(params: {
  to: string;
  userName: string;
  organizationName: string;
  daysRemaining: number;
  trialEndDate: Date;
}) {
  const { html, text } = await renderEmail(
    <TrialExpiringEmail
      daysRemaining={params.daysRemaining}
      organizationName={params.organizationName}
      trialEndDate={params.trialEndDate}
      userName={params.userName}
    />
  );
  await sendEmail({
    to: params.to,
    subject: `Seu trial expira em ${params.daysRemaining} dias - Synnerdata`,
    html,
    text,
  });
}

export async function sendTrialExpiredEmail(params: {
  to: string;
  userName: string;
  organizationName: string;
}) {
  const { html, text } = await renderEmail(
    <TrialExpiredEmail
      organizationName={params.organizationName}
      userName={params.userName}
    />
  );
  await sendEmail({
    to: params.to,
    subject: "Seu trial expirou - Synnerdata",
    html,
    text,
  });
}

export async function sendCancellationScheduledEmail(params: {
  to: string;
  organizationName: string;
  planName: string;
  accessUntil: Date;
}) {
  const { html, text } = await renderEmail(
    <CancellationScheduledEmail
      accessUntil={params.accessUntil}
      organizationName={params.organizationName}
      planName={params.planName}
    />
  );
  await sendEmail({
    to: params.to,
    subject: `Cancelamento Agendado - ${params.planName} - Synnerdata`,
    html,
    text,
  });
}

export async function sendSubscriptionCanceledEmail(params: {
  to: string;
  organizationName: string;
  planName: string;
  canceledAt: Date;
  accessUntil: Date | null;
}) {
  const { html, text } = await renderEmail(
    <SubscriptionCanceledEmail
      accessUntil={params.accessUntil}
      canceledAt={params.canceledAt}
      organizationName={params.organizationName}
      planName={params.planName}
    />
  );
  await sendEmail({
    to: params.to,
    subject: `Assinatura Cancelada - ${params.planName} - Synnerdata`,
    html,
    text,
  });
}

export async function sendPriceAdjustmentEmail(params: {
  to: string;
  organizationName: string;
  planName: string;
  oldPrice: number;
  newPrice: number;
  reason: string;
}) {
  const { html, text } = await renderEmail(
    <PriceAdjustmentEmail
      newPrice={params.newPrice}
      oldPrice={params.oldPrice}
      organizationName={params.organizationName}
      planName={params.planName}
      reason={params.reason}
    />
  );
  await sendEmail({
    to: params.to,
    subject: "Aviso de reajuste no valor da sua assinatura - Synnerdata",
    html,
    text,
  });
}

export async function sendPlanChangeExecutedEmail(params: {
  to: string;
  organizationName: string;
  previousPlanName: string;
  newPlanName: string;
}) {
  const { html, text } = await renderEmail(
    <PlanChangeExecutedEmail
      newPlanName={params.newPlanName}
      organizationName={params.organizationName}
      previousPlanName={params.previousPlanName}
    />
  );
  await sendEmail({
    to: params.to,
    subject: `Mudança de Plano Concluída - ${params.newPlanName} - Synnerdata`,
    html,
    text,
  });
}

export async function sendPaymentFailedEmail(params: {
  to: string;
  organizationName: string;
  planName: string;
  gracePeriodEnds: Date;
  errorMessage?: string;
}) {
  const { html, text } = await renderEmail(
    <PaymentFailedEmail
      errorMessage={params.errorMessage}
      gracePeriodEnds={params.gracePeriodEnds}
      organizationName={params.organizationName}
      planName={params.planName}
    />
  );
  await sendEmail({
    to: params.to,
    subject: `Falha no Pagamento - ${params.planName} - Synnerdata`,
    html,
    text,
  });
}

export async function sendCheckoutLinkEmail(params: {
  to: string;
  userName: string;
  organizationName: string;
  planName: string;
  checkoutUrl: string;
  expiresAt: Date;
}) {
  const { html, text } = await renderEmail(
    <CheckoutLinkEmail
      checkoutUrl={params.checkoutUrl}
      expiresAt={params.expiresAt}
      organizationName={params.organizationName}
      planName={params.planName}
      userName={params.userName}
    />
  );
  await sendEmail({
    to: params.to,
    subject: `Complete seu upgrade para o Plano ${params.planName} - Synnerdata`,
    html,
    text,
  });
}

export async function sendProvisionCheckoutLinkEmail(params: {
  to: string;
  userName: string;
  organizationName: string;
  planName: string;
  checkoutUrl: string;
  expiresAt: Date;
}) {
  const { html, text } = await renderEmail(
    <ProvisionCheckoutLinkEmail
      checkoutUrl={params.checkoutUrl}
      expiresAt={params.expiresAt}
      organizationName={params.organizationName}
      planName={params.planName}
      userName={params.userName}
    />
  );
  await sendEmail({
    to: params.to,
    subject: `Bem-vindo ao Synnerdata — finalize o pagamento do Plano ${params.planName}`,
    html,
    text,
  });
}
