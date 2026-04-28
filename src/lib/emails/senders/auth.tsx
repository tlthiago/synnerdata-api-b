import { sendEmail } from "@/lib/emails/mailer";
import { renderEmail } from "@/lib/emails/render";
import { AccountActivationEmail } from "@/lib/emails/templates/auth/account-activation";
import { AccountAnonymizedEmail } from "@/lib/emails/templates/auth/account-anonymized";
import { OrganizationInvitationEmail } from "@/lib/emails/templates/auth/organization-invitation";
import { PasswordResetEmail } from "@/lib/emails/templates/auth/password-reset";
import { ProvisionActivationEmail } from "@/lib/emails/templates/auth/provision-activation";
import { TwoFactorOtpEmail } from "@/lib/emails/templates/auth/two-factor-otp";
import { VerificationEmail } from "@/lib/emails/templates/auth/verification";
import { WelcomeEmail } from "@/lib/emails/templates/auth/welcome";

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

export async function sendAccountAnonymizedEmail(params: { email: string }) {
  const { html, text } = await renderEmail(
    <AccountAnonymizedEmail email={params.email} />
  );
  await sendEmail({
    to: params.email,
    subject: "Sua conta foi anonimizada no Synnerdata",
    html,
    text,
  });
}
