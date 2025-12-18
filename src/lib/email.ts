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

type TrialExpiringEmailParams = {
  to: string;
  userName: string;
  organizationName: string;
  daysRemaining: number;
  trialEndDate: Date;
};

export async function sendTrialExpiringEmail(
  params: TrialExpiringEmailParams
): Promise<void> {
  const { to, userName, organizationName, daysRemaining, trialEndDate } =
    params;

  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(trialEndDate);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Seu trial está acabando!</h1>

      <p>Olá ${userName},</p>

      <p>
        O período de trial da organização <strong>${organizationName}</strong>
        expira em <strong>${daysRemaining} dias</strong> (${formattedDate}).
      </p>

      <p>
        Para continuar usando todos os recursos do Synnerdata,
        faça o upgrade para um plano pago.
      </p>

      <p>
        <a href="${env.APP_URL}/billing/upgrade"
           style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Fazer Upgrade Agora
        </a>
      </p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <p style="color: #666; font-size: 14px;">
        Após o trial, você perderá acesso às funcionalidades premium.
        Seus dados serão mantidos por 30 dias.
      </p>

      <p style="color: #999; font-size: 12px;">
        Equipe Synnerdata
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject: `Seu trial expira em ${daysRemaining} dias - Synnerdata`,
    html,
  });
}

type TrialExpiredEmailParams = {
  to: string;
  userName: string;
  organizationName: string;
};

export async function sendTrialExpiredEmail(
  params: TrialExpiredEmailParams
): Promise<void> {
  const { to, userName, organizationName } = params;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Seu período de trial expirou</h1>

      <p>Olá ${userName},</p>

      <p>
        O período de trial da organização <strong>${organizationName}</strong>
        chegou ao fim.
      </p>

      <p>
        Para continuar usando todos os recursos do Synnerdata,
        faça o upgrade para um plano pago agora mesmo.
      </p>

      <p>
        <a href="${env.APP_URL}/billing/upgrade"
           style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Fazer Upgrade Agora
        </a>
      </p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <p style="color: #666; font-size: 14px;">
        Seus dados serão mantidos por 30 dias. Após esse período,
        eles poderão ser removidos permanentemente.
      </p>

      <p style="color: #999; font-size: 12px;">
        Equipe Synnerdata
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject: "Seu trial expirou - Synnerdata",
    html,
  });
}

type CancellationScheduledEmailParams = {
  to: string;
  organizationName: string;
  planName: string;
  accessUntil: Date;
};

export async function sendCancellationScheduledEmail(
  params: CancellationScheduledEmailParams
): Promise<void> {
  const { to, organizationName, planName, accessUntil } = params;

  const formattedAccessUntil = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(accessUntil);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Cancelamento Agendado</h1>

      <p>Olá <strong>${organizationName}</strong>,</p>

      <p>Confirmamos sua solicitação de cancelamento do plano <strong>${planName}</strong>.</p>

      <div style="background: #fff8e6; border-left: 4px solid #f0ad4e; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #8a6d3b;">
          <strong>Sua assinatura continua ativa até ${formattedAccessUntil}.</strong>
        </p>
      </div>

      <p>Até lá, você pode continuar usando todos os recursos do plano ${planName} normalmente.</p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <h2 style="color: #333;">Mudou de ideia?</h2>

      <p>
        Você pode restaurar sua assinatura a qualquer momento antes de ${formattedAccessUntil}
        e continuar aproveitando todos os benefícios.
      </p>

      <p>
        <a href="${env.APP_URL}/billing"
           style="display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Restaurar Assinatura
        </a>
      </p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <p style="color: #666; font-size: 14px;">
        Após ${formattedAccessUntil}, sua assinatura será cancelada definitivamente
        e você perderá acesso aos recursos premium.
      </p>

      <p style="color: #999; font-size: 12px;">
        Equipe Synnerdata
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject: `Cancelamento Agendado - ${planName} - Synnerdata`,
    html,
  });
}

type SubscriptionCanceledEmailParams = {
  to: string;
  organizationName: string;
  planName: string;
  canceledAt: Date;
  accessUntil: Date | null;
};

export async function sendSubscriptionCanceledEmail(
  params: SubscriptionCanceledEmailParams
): Promise<void> {
  const { to, organizationName, planName, canceledAt, accessUntil } = params;

  const formattedCanceledAt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(canceledAt);

  const formattedAccessUntil = accessUntil
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(accessUntil)
    : null;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Assinatura Cancelada</h1>

      <p>Olá <strong>${organizationName}</strong>,</p>

      <p>Confirmamos o cancelamento da sua assinatura do plano <strong>${planName}</strong>.</p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <h2 style="color: #333;">Detalhes do Cancelamento</h2>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Plano cancelado:</strong></td>
          <td style="padding: 8px 0;">${planName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Data do cancelamento:</strong></td>
          <td style="padding: 8px 0;">${formattedCanceledAt}</td>
        </tr>
        ${
          formattedAccessUntil
            ? `
        <tr>
          <td style="padding: 8px 0;"><strong>Acesso até:</strong></td>
          <td style="padding: 8px 0;">${formattedAccessUntil}</td>
        </tr>
        `
            : ""
        }
      </table>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <p>Sentiremos sua falta! Se mudar de ideia, você pode reativar sua assinatura a qualquer momento.</p>

      <p>
        <a href="${env.APP_URL}/billing"
           style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Reativar Assinatura
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
    subject: `Assinatura Cancelada - ${planName} - Synnerdata`,
    html,
  });
}

// ============================================================
// PLAN CHANGE EMAILS
// ============================================================

type PlanChangeExecutedEmailParams = {
  to: string;
  organizationName: string;
  previousPlanName: string;
  newPlanName: string;
};

export async function sendPlanChangeExecutedEmail(
  params: PlanChangeExecutedEmailParams
): Promise<void> {
  const { to, organizationName, previousPlanName, newPlanName } = params;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Mudança de Plano Executada</h1>

      <p>Olá <strong>${organizationName}</strong>,</p>

      <p>Sua mudança de plano foi concluída com sucesso!</p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <h2 style="color: #333;">Detalhes da Mudança</h2>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Plano anterior:</strong></td>
          <td style="padding: 8px 0;">${previousPlanName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Novo plano:</strong></td>
          <td style="padding: 8px 0;">${newPlanName}</td>
        </tr>
      </table>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <p>Você agora tem acesso a todos os recursos do plano ${newPlanName}!</p>

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
    subject: `Mudança de Plano Concluída - ${newPlanName} - Synnerdata`,
    html,
  });
}

// ============================================================
// WELCOME EMAIL
// ============================================================

type WelcomeEmailParams = {
  to: string;
  userName: string;
};

export async function sendWelcomeEmail(
  params: WelcomeEmailParams
): Promise<void> {
  const { to, userName } = params;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Bem-vindo ao Synnerdata!</h1>

      <p>Olá <strong>${userName}</strong>,</p>

      <p>Estamos muito felizes em ter você conosco!</p>

      <p>Sua conta foi criada com sucesso e você já pode começar a explorar todos os recursos da plataforma.</p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <h2 style="color: #333;">Próximos passos</h2>

      <ul style="color: #666; line-height: 1.8;">
        <li>Complete seu perfil</li>
        <li>Crie sua primeira organização</li>
        <li>Explore os recursos disponíveis no seu plano</li>
      </ul>

      <p>
        <a href="${env.APP_URL}/dashboard"
           style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Acessar Dashboard
        </a>
      </p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <p style="color: #666; font-size: 14px;">
        Precisa de ajuda? Responda este email ou acesse nossa central de suporte.
      </p>

      <p style="color: #999; font-size: 12px;">
        Equipe Synnerdata
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject: "Bem-vindo ao Synnerdata!",
    html,
  });
}

// ============================================================
// PAYMENT FAILED EMAIL
// ============================================================

type PaymentFailedEmailParams = {
  to: string;
  organizationName: string;
  planName: string;
  gracePeriodEnds: Date;
  errorMessage?: string;
};

export async function sendPaymentFailedEmail(
  params: PaymentFailedEmailParams
): Promise<void> {
  const { to, organizationName, planName, gracePeriodEnds, errorMessage } =
    params;

  const formattedGracePeriodEnds = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(gracePeriodEnds);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #d9534f;">Falha no Pagamento</h1>

      <p>Olá <strong>${organizationName}</strong>,</p>

      <p>
        Não foi possível processar o pagamento da sua assinatura do plano <strong>${planName}</strong>.
      </p>

      ${
        errorMessage
          ? `
      <div style="background: #f8d7da; border-left: 4px solid #d9534f; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #721c24;">
          <strong>Motivo:</strong> ${errorMessage}
        </p>
      </div>
      `
          : ""
      }

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <h2 style="color: #333;">O que acontece agora?</h2>

      <p>
        Sua assinatura está em <strong>período de graça</strong> e continuará funcionando
        normalmente até <strong>${formattedGracePeriodEnds}</strong>.
      </p>

      <div style="background: #fff8e6; border-left: 4px solid #f0ad4e; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #8a6d3b;">
          <strong>Importante:</strong> Se o pagamento não for regularizado até ${formattedGracePeriodEnds},
          sua assinatura será cancelada automaticamente.
        </p>
      </div>

      <h2 style="color: #333;">Como resolver?</h2>

      <p>Atualize seu método de pagamento para evitar a interrupção do serviço:</p>

      <p>
        <a href="${env.APP_URL}/billing"
           style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Atualizar Pagamento
        </a>
      </p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <p style="color: #666; font-size: 14px;">
        Precisa de ajuda? Responda este email ou entre em contato com nosso suporte.
      </p>

      <p style="color: #999; font-size: 12px;">
        Equipe Synnerdata
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject: `Falha no Pagamento - ${planName} - Synnerdata`,
    html,
  });
}

// ============================================================
// CHECKOUT LINK EMAIL
// ============================================================

type CheckoutLinkEmailParams = {
  to: string;
  userName: string;
  organizationName: string;
  planName: string;
  checkoutUrl: string;
  expiresAt: Date;
};

export async function sendCheckoutLinkEmail(
  params: CheckoutLinkEmailParams
): Promise<void> {
  const { to, userName, organizationName, planName, checkoutUrl, expiresAt } =
    params;

  const formattedExpiresAt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(expiresAt);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Complete seu upgrade para o Plano ${planName}</h1>

      <p>Olá <strong>${userName}</strong>,</p>

      <p>
        Você iniciou o upgrade da organização <strong>${organizationName}</strong>
        para o plano <strong>${planName}</strong>.
      </p>

      <p>Clique no botão abaixo para continuar com o pagamento:</p>

      <p>
        <a href="${checkoutUrl}"
           style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Continuar Pagamento
        </a>
      </p>

      <hr style="border: 1px solid #eee; margin: 20px 0;">

      <div style="background: #fff8e6; border-left: 4px solid #f0ad4e; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #8a6d3b;">
          <strong>Este link expira em ${formattedExpiresAt}.</strong>
        </p>
      </div>

      <p style="color: #666; font-size: 14px;">
        Se você não solicitou este upgrade, ignore este email.
      </p>

      <p style="color: #999; font-size: 12px;">
        Equipe Synnerdata
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject: `Complete seu upgrade para o Plano ${planName} - Synnerdata`,
    html,
  });
}
