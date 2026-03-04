import { createTransport } from "nodemailer";
import { renderEmail } from "@/emails/render";
import { AccountActivationEmail } from "@/emails/templates/auth/account-activation";
import { OrganizationInvitationEmail } from "@/emails/templates/auth/organization-invitation";
import { PasswordResetEmail } from "@/emails/templates/auth/password-reset";
import { ProvisionActivationEmail } from "@/emails/templates/auth/provision-activation";
import { TwoFactorOtpEmail } from "@/emails/templates/auth/two-factor-otp";
import { VerificationEmail } from "@/emails/templates/auth/verification";
import { WelcomeEmail } from "@/emails/templates/auth/welcome";
import { ContactMessageEmail } from "@/emails/templates/contact/contact-message";
import { CancellationScheduledEmail } from "@/emails/templates/payments/cancellation-scheduled";
import { CheckoutLinkEmail } from "@/emails/templates/payments/checkout-link";
import { PaymentFailedEmail } from "@/emails/templates/payments/payment-failed";
import { PlanChangeExecutedEmail } from "@/emails/templates/payments/plan-change-executed";
import { PriceAdjustmentEmail } from "@/emails/templates/payments/price-adjustment";
import { ProvisionCheckoutLinkEmail } from "@/emails/templates/payments/provision-checkout-link";
import { SubscriptionCanceledEmail } from "@/emails/templates/payments/subscription-canceled";
import { TrialExpiredEmail } from "@/emails/templates/payments/trial-expired";
import { TrialExpiringEmail } from "@/emails/templates/payments/trial-expiring";
import { UpgradeConfirmationEmail } from "@/emails/templates/payments/upgrade-confirmation";
import { env } from "@/env";

const transporter = createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth:
    env.SMTP_USER && env.SMTP_PASSWORD
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
});

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail({ to, subject, html, text }: SendEmailParams) {
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    html,
    ...(text && { text }),
  });
}

// ============================================================
// AUTH EMAILS
// ============================================================

export async function sendVerificationEmail(params: {
  email: string;
  url: string;
}) {
  const { html, text } = await renderEmail(
    <VerificationEmail url={params.url} />
  );
  await sendEmail({
    to: params.email,
    subject: "Verifique seu email - Synnerdata",
    html,
    text,
  });
}

export async function sendPasswordResetEmail(params: {
  email: string;
  url: string;
}) {
  const { html, text } = await renderEmail(
    <PasswordResetEmail url={params.url} />
  );
  await sendEmail({
    to: params.email,
    subject: "Redefinir sua senha - Synnerdata",
    html,
    text,
  });
}

export async function sendTwoFactorOTPEmail(params: {
  email: string;
  otp: string;
}) {
  const { html, text } = await renderEmail(
    <TwoFactorOtpEmail otp={params.otp} />
  );
  await sendEmail({
    to: params.email,
    subject: "Código de verificação - Synnerdata",
    html,
    text,
  });
}

export async function sendWelcomeEmail(params: {
  to: string;
  userName: string;
}) {
  const { html, text } = await renderEmail(
    <WelcomeEmail userName={params.userName} />
  );
  await sendEmail({
    to: params.to,
    subject: "Bem-vindo ao Synnerdata!",
    html,
    text,
  });
}

export async function sendAccountActivationEmail(params: {
  email: string;
  url: string;
  userName: string;
}) {
  const { html, text } = await renderEmail(
    <AccountActivationEmail url={params.url} userName={params.userName} />
  );
  await sendEmail({
    to: params.email,
    subject: "Ative sua conta — Synnerdata",
    html,
    text,
  });
}

export async function sendProvisionActivationEmail(params: {
  email: string;
  url: string;
  userName: string;
  organizationName: string;
  isTrial: boolean;
}) {
  const { html, text } = await renderEmail(
    <ProvisionActivationEmail
      isTrial={params.isTrial}
      organizationName={params.organizationName}
      url={params.url}
      userName={params.userName}
    />
  );
  await sendEmail({
    to: params.email,
    subject: `Ative sua conta — ${params.organizationName} — Synnerdata`,
    html,
    text,
  });
}

export async function sendOrganizationInvitationEmail(params: {
  to: string;
  inviterName: string;
  inviterEmail: string;
  organizationName: string;
  inviteLink: string;
  role: string;
}) {
  const { html, text } = await renderEmail(
    <OrganizationInvitationEmail
      inviteLink={params.inviteLink}
      inviterEmail={params.inviterEmail}
      inviterName={params.inviterName}
      organizationName={params.organizationName}
      role={params.role}
    />
  );
  await sendEmail({
    to: params.to,
    subject: `Convite para ${params.organizationName} - Synnerdata`,
    html,
    text,
  });
}

// ============================================================
// PAYMENT EMAILS
// ============================================================

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

// ============================================================
// CONTACT EMAILS
// ============================================================

export async function sendContactEmail(params: {
  name: string;
  email: string;
  company: string;
  phone?: string;
  subject: string;
  message: string;
}) {
  const { html, text } = await renderEmail(
    <ContactMessageEmail
      company={params.company}
      email={params.email}
      message={params.message}
      name={params.name}
      phone={params.phone}
      subject={params.subject}
    />
  );
  await sendEmail({
    to: "contato@synnerdata.com.br",
    subject: `[Contato Site] ${params.subject}`,
    html,
    text,
  });
}
