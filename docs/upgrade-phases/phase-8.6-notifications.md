# Fase 8.6: Notificações

> **Prioridade:** Média/Baixa
> **Complexidade:** Baixa/Média
> **Status:** ⏳ Pendente

## Objetivo

Implementar sistema de notificações para eventos de pagamento: emails transacionais, dunning (cobrança) e notificações internas (Slack/Discord).

## Pré-requisitos

- Fases 1-7 completas
- Webhook handler funcionando
- Sistema de email configurado

---

## 8.6.1 Email de Pagamento Falhou

> **Prioridade:** Média
> **Complexidade:** Baixa

Notificar o cliente quando uma cobrança falhar.

### Implementação

**Arquivo:** `src/lib/email.ts`

```typescript
type PaymentFailedEmailParams = {
  to: string;
  organizationName: string;
  amount: number;
  failureReason: string;
  retryDate?: Date;
};

export async function sendPaymentFailedEmail(
  params: PaymentFailedEmailParams
): Promise<void> {
  const { to, organizationName, amount, failureReason, retryDate } = params;

  const formattedAmount = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount / 100);

  await sendEmail({
    to,
    subject: `Falha no pagamento - Ação necessária - Synnerdata`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #dc3545;">Falha no Pagamento</h1>

        <p>Olá,</p>

        <p>
          Não conseguimos processar o pagamento de <strong>${formattedAmount}</strong>
          para a organização <strong>${organizationName}</strong>.
        </p>

        <p><strong>Motivo:</strong> ${failureReason}</p>

        ${
          retryDate
            ? `<p>Tentaremos novamente em ${new Intl.DateTimeFormat("pt-BR").format(retryDate)}.</p>`
            : ""
        }

        <p>
          Para evitar a suspensão do serviço, por favor atualize seu método de pagamento:
        </p>

        <p>
          <a href="${env.APP_URL}/billing"
             style="display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Atualizar Pagamento
          </a>
        </p>

        <p style="color: #999; font-size: 12px;">
          Equipe Synnerdata
        </p>
      </div>
    `,
  });
}
```

### Integração no Webhook

**Arquivo:** `src/modules/payments/webhook/webhook.service.ts`

No método `handleChargePaymentFailed()`:

```typescript
// Após atualizar status para past_due

// Enviar email de falha
const [owner] = await db
  .select({ email: users.email })
  .from(members)
  .innerJoin(users, eq(members.userId, users.id))
  .where(
    and(
      eq(members.organizationId, organizationId),
      eq(members.role, "owner")
    )
  )
  .limit(1);

if (owner?.email) {
  await sendPaymentFailedEmail({
    to: owner.email,
    organizationName: org.name,
    amount: data.amount,
    failureReason: data.last_transaction?.gateway_response?.message ?? "Erro desconhecido",
  });
}
```

---

## 8.6.2 Dunning Emails (Emails de Cobrança)

> **Prioridade:** Média
> **Complexidade:** Média

Sequência de emails para recuperar pagamentos falhos.

> **Referência:** Better Auth + Stripe usa `invoice.past_due` e `invoice.payment_failed` com retry automático.

### Estratégia de Dunning

```text
Dia 0: Pagamento falha
  │
  └─► Email 1: "Pagamento falhou - Atualize seu cartão"
      │
      ▼
Dia 3: Retry automático (Pagarme)
  │
  ├─► Sucesso → Email de confirmação
  │
  └─► Falha → Email 2: "Segunda tentativa falhou"
      │
      ▼
Dia 5: Email 3: "Última chance - Acesso será suspenso em 2 dias"
      │
      ▼
Dia 7: Grace period expira
  │
  └─► Email 4: "Acesso suspenso"
```

### Schema para Tracking

**Arquivo:** `src/db/schema/payments.ts`

```typescript
export const dunningEmails = pgTable("dunning_emails", {
  id: varchar("id", { length: 36 }).primaryKey(),
  subscriptionId: varchar("subscription_id", { length: 36 })
    .notNull()
    .references(() => orgSubscriptions.id),
  emailType: varchar("email_type", { length: 50 }).notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
});
```

### Service

**Arquivo:** `src/modules/payments/dunning/dunning.service.ts`

```typescript
export abstract class DunningService {
  /**
   * Process dunning emails for past_due subscriptions.
   * Should run daily.
   */
  static async processDunning(): Promise<{
    processed: number;
    emails: { type: string; subscriptionId: string }[];
  }> {
    const now = new Date();
    const emailsSent: { type: string; subscriptionId: string }[] = [];

    // Buscar subscriptions past_due
    const pastDueSubscriptions = await db
      .select({
        subscription: orgSubscriptions,
        organization: organizations,
      })
      .from(orgSubscriptions)
      .innerJoin(
        organizations,
        eq(orgSubscriptions.organizationId, organizations.id)
      )
      .where(eq(orgSubscriptions.status, "past_due"));

    for (const { subscription, organization } of pastDueSubscriptions) {
      const daysPastDue = subscription.pastDueSince
        ? Math.floor(
            (now.getTime() - subscription.pastDueSince.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

      // Buscar owner
      const [owner] = await db
        .select({ email: users.email, name: users.name })
        .from(members)
        .innerJoin(users, eq(members.userId, users.id))
        .where(
          and(
            eq(members.organizationId, subscription.organizationId),
            eq(members.role, "owner")
          )
        )
        .limit(1);

      if (!owner?.email) continue;

      // Determinar qual email enviar baseado nos dias
      let emailType: string | null = null;

      if (daysPastDue === 0) {
        emailType = "payment_failed_initial";
      } else if (daysPastDue === 3) {
        emailType = "payment_failed_retry";
      } else if (daysPastDue === 5) {
        emailType = "payment_failed_final_warning";
      } else if (daysPastDue === 7) {
        emailType = "subscription_suspended";
      }

      if (emailType) {
        // Verificar se já enviou este tipo de email
        const alreadySent = await DunningService.hasEmailBeenSent(
          subscription.id,
          emailType
        );

        if (!alreadySent) {
          await DunningService.sendDunningEmail({
            type: emailType,
            to: owner.email,
            userName: owner.name ?? "Usuário",
            organizationName: organization.name,
            daysRemaining: 7 - daysPastDue,
          });

          await DunningService.recordEmailSent(subscription.id, emailType);
          emailsSent.push({ type: emailType, subscriptionId: subscription.id });
        }
      }
    }

    return {
      processed: pastDueSubscriptions.length,
      emails: emailsSent,
    };
  }

  private static async sendDunningEmail(params: {
    type: string;
    to: string;
    userName: string;
    organizationName: string;
    daysRemaining: number;
  }): Promise<void> {
    const subjects: Record<string, string> = {
      payment_failed_initial: "Ação necessária: Pagamento não processado",
      payment_failed_retry: "Segunda tentativa de pagamento falhou",
      payment_failed_final_warning: "Última chance: Atualize seu pagamento",
      subscription_suspended: "Seu acesso foi suspenso",
    };

    await sendEmail({
      to: params.to,
      subject: `${subjects[params.type]} - Synnerdata`,
      html: DunningService.getEmailTemplate(params),
    });
  }

  private static getEmailTemplate(params: {
    type: string;
    userName: string;
    organizationName: string;
    daysRemaining: number;
  }): string {
    const { type, userName, organizationName, daysRemaining } = params;

    const templates: Record<string, string> = {
      payment_failed_initial: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #dc3545;">Pagamento não processado</h1>
          <p>Olá ${userName},</p>
          <p>Não conseguimos processar o pagamento da organização <strong>${organizationName}</strong>.</p>
          <p>Por favor, atualize seu método de pagamento para continuar usando nossos serviços.</p>
          <p>
            <a href="${env.APP_URL}/billing" style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Atualizar Pagamento
            </a>
          </p>
          <p style="color: #999;">Equipe Synnerdata</p>
        </div>
      `,
      payment_failed_retry: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #dc3545;">Segunda tentativa falhou</h1>
          <p>Olá ${userName},</p>
          <p>Tentamos processar o pagamento novamente, mas não foi possível.</p>
          <p>Você tem <strong>${daysRemaining} dias</strong> para atualizar seu pagamento antes que o acesso seja suspenso.</p>
          <p>
            <a href="${env.APP_URL}/billing" style="display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Atualizar Agora
            </a>
          </p>
          <p style="color: #999;">Equipe Synnerdata</p>
        </div>
      `,
      payment_failed_final_warning: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #dc3545;">Última chance!</h1>
          <p>Olá ${userName},</p>
          <p><strong>Seu acesso será suspenso em ${daysRemaining} dias.</strong></p>
          <p>Atualize seu método de pagamento imediatamente para evitar a suspensão.</p>
          <p>
            <a href="${env.APP_URL}/billing" style="display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Atualizar Pagamento Agora
            </a>
          </p>
          <p style="color: #999;">Equipe Synnerdata</p>
        </div>
      `,
      subscription_suspended: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #dc3545;">Acesso suspenso</h1>
          <p>Olá ${userName},</p>
          <p>Infelizmente, o acesso da organização <strong>${organizationName}</strong> foi suspenso devido a pagamentos pendentes.</p>
          <p>Para reativar seu acesso, atualize seu método de pagamento:</p>
          <p>
            <a href="${env.APP_URL}/billing" style="display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Reativar Acesso
            </a>
          </p>
          <p style="color: #999;">Equipe Synnerdata</p>
        </div>
      `,
    };

    return templates[type] ?? "";
  }

  private static async hasEmailBeenSent(
    subscriptionId: string,
    emailType: string
  ): Promise<boolean> {
    const existing = await db.query.dunningEmails.findFirst({
      where: and(
        eq(dunningEmails.subscriptionId, subscriptionId),
        eq(dunningEmails.emailType, emailType)
      ),
    });
    return !!existing;
  }

  private static async recordEmailSent(
    subscriptionId: string,
    emailType: string
  ): Promise<void> {
    await db.insert(dunningEmails).values({
      id: crypto.randomUUID(),
      subscriptionId,
      emailType,
      sentAt: new Date(),
    });
  }

  /**
   * Clear dunning history when subscription becomes active again.
   */
  static async clearDunningHistory(subscriptionId: string): Promise<void> {
    await db
      .delete(dunningEmails)
      .where(eq(dunningEmails.subscriptionId, subscriptionId));
  }
}
```

---

## 8.6.3 Notificação Slack/Discord

> **Prioridade:** Baixa
> **Complexidade:** Baixa

Notificar o time interno sobre novos upgrades e cancelamentos.

### Implementação

**Arquivo:** `src/lib/slack.ts`

```typescript
export async function notifySlack(params: {
  channel: string;
  text: string;
  blocks?: unknown[];
}): Promise<void> {
  const webhookUrl = env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: params.channel,
      text: params.text,
      blocks: params.blocks,
    }),
  });
}
```

### Uso no Webhook

```typescript
// Em handleSubscriptionCreated()
await notifySlack({
  channel: "#sales",
  text: `:tada: Nova assinatura! Org: ${orgName}, Plano: ${planName}, MRR: +R$ ${mrr}`,
});

// Em handleSubscriptionCanceled()
await notifySlack({
  channel: "#sales",
  text: `:warning: Cancelamento! Org: ${orgName}, MRR: -R$ ${mrr}`,
});

// Em handleChargePaymentFailed()
await notifySlack({
  channel: "#support",
  text: `:x: Pagamento falhou! Org: ${orgName}, Valor: R$ ${amount}`,
});
```

### Notificações Sugeridas

| Evento | Canal | Emoji | Mensagem |
|--------|-------|-------|----------|
| Nova assinatura | #sales | :tada: | Nova assinatura! Org: X, Plano: Y |
| Upgrade | #sales | :chart_with_upwards_trend: | Upgrade! Org: X, De: Y → Para: Z |
| Downgrade | #sales | :chart_with_downwards_trend: | Downgrade! Org: X, De: Y → Para: Z |
| Cancelamento | #sales | :warning: | Cancelamento! Org: X, MRR: -R$ Y |
| Pagamento falhou | #support | :x: | Pagamento falhou! Org: X |
| Trial expirando | #sales | :hourglass: | Trial expira em 3 dias! Org: X |
| Acesso suspenso | #support | :no_entry: | Acesso suspenso! Org: X |

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/lib/email.ts` | Modificar | Adicionar templates de pagamento falhou |
| `src/lib/slack.ts` | Criar | Helper para notificações Slack |
| `src/db/schema/payments.ts` | Modificar | Adicionar tabela `dunning_emails` |
| `src/modules/payments/dunning/dunning.service.ts` | Criar | Service de dunning |
| `src/modules/payments/webhook/webhook.service.ts` | Modificar | Integrar notificações |
| `src/env.ts` | Modificar | Adicionar `SLACK_WEBHOOK_URL` |

---

## Checklist de Implementação

### Email de Pagamento Falhou
- [ ] Template de email de falha
- [ ] Integrar no webhook `charge.payment_failed`
- [ ] Testar envio

### Dunning Emails
- [ ] Criar tabela `dunning_emails`
- [ ] Implementar `DunningService`
- [ ] Templates para cada estágio
- [ ] Job diário para processar dunning
- [ ] Limpar histórico quando subscription volta a active
- [ ] Testes unitários

### Slack/Discord
- [ ] Criar helper `notifySlack()`
- [ ] Adicionar variável de ambiente `SLACK_WEBHOOK_URL`
- [ ] Integrar nos eventos de webhook
- [ ] Configurar canais no Slack

---

> **Dependências:** Sistema de email configurado, Webhook handler
> **Impacto:** Recuperação de receita, visibilidade interna
