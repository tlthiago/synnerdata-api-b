import { describe, expect, test } from "bun:test";
import { renderEmail } from "../render";
import { AccountActivationEmail } from "../templates/auth/account-activation";
import { AccountAnonymizedEmail } from "../templates/auth/account-anonymized";
import { OrganizationInvitationEmail } from "../templates/auth/organization-invitation";
import { PasswordResetEmail } from "../templates/auth/password-reset";
import { TwoFactorOtpEmail } from "../templates/auth/two-factor-otp";
import { VerificationEmail } from "../templates/auth/verification";
import { WelcomeEmail } from "../templates/auth/welcome";

describe("auth email templates", () => {
  test("AccountAnonymizedEmail renders with recipient address", async () => {
    const { html, text } = await renderEmail(
      <AccountAnonymizedEmail email="user@example.com" />
    );

    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
    expect(html).toContain("user@example.com");
    expect(text).toContain("user@example.com");
    expect(html).toContain("anonimizada");
    expect(text).toContain("anonimizada");
  });

  test("AccountAnonymizedEmail mentions the action is irreversible", async () => {
    const { html, text } = await renderEmail(
      <AccountAnonymizedEmail email="user@example.com" />
    );

    expect(html).toContain("irreversível");
    expect(text).toContain("irreversível");
  });

  test("AccountAnonymizedEmail mentions the email can be reused for a new registration", async () => {
    const { html, text } = await renderEmail(
      <AccountAnonymizedEmail email="user@example.com" />
    );

    expect(html).toContain("novo cadastro");
    expect(text).toContain("novo cadastro");
  });

  test("AccountAnonymizedEmail mentions audit history was preserved anonymously", async () => {
    const { html, text } = await renderEmail(
      <AccountAnonymizedEmail email="user@example.com" />
    );

    expect(html).toContain("auditoria");
    expect(html).toContain("anônima");
    expect(text).toContain("auditoria");
    expect(text).toContain("anônima");
  });

  test("VerificationEmail renders with url", async () => {
    const { html, text } = await renderEmail(
      <VerificationEmail url="https://app.test/verify?token=abc" />
    );

    expect(html).toContain("Verifique seu email");
    expect(html).toContain("https://app.test/verify?token=abc");
    expect(html).toContain("Verificar Email");
    expect(html).toContain("copie e cole");
    expect(text).toContain("VERIFIQUE SEU EMAIL");
  });

  test("PasswordResetEmail renders with url", async () => {
    const { html, text } = await renderEmail(
      <PasswordResetEmail url="https://app.test/reset?token=xyz" />
    );

    expect(html).toContain("Redefinir sua senha");
    expect(html).toContain("https://app.test/reset?token=xyz");
    expect(html).toContain("1 hora");
    expect(html).toContain("copie e cole");
    expect(text).toContain("Redefinir");
  });

  test("TwoFactorOtpEmail renders with otp code", async () => {
    const { html, text } = await renderEmail(
      <TwoFactorOtpEmail otp="123456" />
    );

    expect(html).toContain("123456");
    expect(html).toContain("5 minutos");
    expect(text).toContain("123456");
  });

  test("WelcomeEmail renders with user name", async () => {
    const { html, text } = await renderEmail(<WelcomeEmail userName="Maria" />);

    expect(html).toContain("Maria");
    expect(html).toContain("Bem-vindo ao Synnerdata");
    expect(html).toContain("Acessar Relatórios");
    expect(text).toContain("Maria");
  });

  test("AccountActivationEmail renders with name and url", async () => {
    const { html, text } = await renderEmail(
      <AccountActivationEmail
        url="https://app.test/activate?token=abc"
        userName="João"
      />
    );

    expect(html).toContain("João");
    expect(html).toContain("Definir Senha e Ativar Conta");
    expect(html).toContain("https://app.test/activate?token=abc");
    expect(html).toContain("copie e cole");
    expect(text).toContain("João");
  });

  test("OrganizationInvitationEmail renders with all fields", async () => {
    const { html, text } = await renderEmail(
      // biome-ignore lint/a11y/useValidAriaRole: role is a component prop, not an ARIA role
      <OrganizationInvitationEmail
        inviteLink="https://app.test/invite/abc"
        inviterEmail="admin@test.com"
        inviterName="Admin User"
        organizationName="Acme Corp"
        role="manager"
      />
    );

    expect(html).toContain("Acme Corp");
    expect(html).toContain("Admin User");
    expect(html).toContain("admin@test.com");
    expect(html).toContain("Gerente");
    expect(html).toContain("Aceitar Convite");
    expect(html).toContain("https://app.test/invite/abc");
    expect(html).toContain("copie e cole");
    expect(text).toContain("Acme Corp");
  });

  test("OrganizationInvitationEmail falls back to raw role if unknown", async () => {
    const { html } = await renderEmail(
      // biome-ignore lint/a11y/useValidAriaRole: role is a component prop, not an ARIA role
      <OrganizationInvitationEmail
        inviteLink="https://app.test/invite"
        inviterEmail="admin@test.com"
        inviterName="Admin"
        organizationName="Org"
        role="custom_role"
      />
    );

    expect(html).toContain("custom_role");
  });
});
