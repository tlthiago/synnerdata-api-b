import { createTransport } from "nodemailer";
import { env } from "@/env";

const transporter = createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
});

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    html,
  });
}

type SendOTPEmailParams = {
  email: string;
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password";
};

export async function sendOTPEmail({ email, otp, type }: SendOTPEmailParams) {
  const subjects: Record<typeof type, string> = {
    "sign-in": "Seu código de acesso",
    "email-verification": "Verifique seu email",
    "forget-password": "Redefinir sua senha",
  };

  const messages: Record<typeof type, string> = {
    "sign-in": "Use o código abaixo para acessar sua conta:",
    "email-verification": "Use o código abaixo para verificar seu email:",
    "forget-password": "Use o código abaixo para redefinir sua senha:",
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${subjects[type]}</h2>
      <p style="color: #666;">${messages[type]}</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">
          ${otp}
        </span>
      </div>
      <p style="color: #999; font-size: 12px;">
        Este código expira em 5 minutos. Se você não solicitou este código, ignore este email.
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: subjects[type],
    html,
  });
}

// ============================================================
// PAYMENT EMAILS
// ============================================================

type UpgradeConfirmationEmailParams = {
  to: string;
  organizationName: string;
  planName: string;
  planPrice: number; // em centavos
  nextBillingDate: Date | null;
  cardLast4?: string;
};

export async function sendUpgradeConfirmationEmail(
  params: UpgradeConfirmationEmailParams
): Promise<void> {
  const {
    to,
    organizationName,
    planName,
    planPrice,
    nextBillingDate,
    cardLast4,
  } = params;

  const formattedPrice = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(planPrice / 100);

  const formattedDate = nextBillingDate
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(nextBillingDate)
    : "N/A";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Bem-vindo ao Plano ${planName}!</h1>

      <p>Olá <strong>${organizationName}</strong>,</p>

      <p>Seu upgrade foi concluído com sucesso!</p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <h2 style="color: #333;">Detalhes da Assinatura</h2>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Plano:</strong></td>
          <td style="padding: 8px 0;">${planName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Valor:</strong></td>
          <td style="padding: 8px 0;">${formattedPrice}/mês</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Próxima cobrança:</strong></td>
          <td style="padding: 8px 0;">${formattedDate}</td>
        </tr>
        ${
          cardLast4
            ? `
        <tr>
          <td style="padding: 8px 0;"><strong>Cartão:</strong></td>
          <td style="padding: 8px 0;">**** ${cardLast4}</td>
        </tr>
        `
            : ""
        }
      </table>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <p>Você agora tem acesso a todos os recursos do plano ${planName}!</p>

      <p>
        <a href="${env.APP_URL}/billing"
           style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Gerenciar Assinatura
        </a>
      </p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Precisa de ajuda? Responda este email.
      </p>

      <p style="color: #999; font-size: 12px;">
        Equipe Synnerdata
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject: `Bem-vindo ao Plano ${planName} - Synnerdata`,
    html,
  });
}
