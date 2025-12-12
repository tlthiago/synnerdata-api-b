# Fase 8: Melhorias e Funcionalidades Adicionais

## Objetivo

Funcionalidades opcionais para melhorar a experiência e completude do módulo de pagamentos.

## Pré-requisitos

- **Fase 7 completa:** Jobs agendados funcionando

---

## Funcionalidades Opcionais

| Funcionalidade | Prioridade | Complexidade | Status |
|----------------|------------|--------------|--------|
| Atualização de cartão | Baixa | Baixa | ⏳ |
| Email de pagamento falhou | Média | Baixa | ⏳ |
| Métricas/Analytics | Baixa | Média | ⏳ |
| Notificação Slack/Discord | Baixa | Baixa | ⏳ |
| Proration (mudança de plano) | Baixa | Alta | ⏳ |
| Promotion Codes (cupons) | Média | Média | ⏳ |

---

## 8.1 Atualização de Cartão

Permitir que o cliente atualize o cartão de crédito sem passar pelo checkout completo.

### Endpoint

**Arquivo:** `src/modules/payments/billing/billing.service.ts`

```typescript
/**
 * Generate a link for the customer to update their payment method.
 * Uses Pagarme's card update flow.
 */
static async getUpdateCardUrl(organizationId: string): Promise<{ url: string }> {
  const profile = await db.query.organizationProfiles.findFirst({
    where: eq(organizationProfiles.organizationId, organizationId),
  });

  if (!profile?.pagarmeCustomerId) {
    throw new CustomerNotFoundError(organizationId);
  }

  // Create a payment link for updating card
  // Pagarme doesn't have a native "update card" flow like Stripe
  // Alternative: Create a $0 charge to capture new card
  const subscription = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, organizationId),
  });

  if (!subscription?.pagarmeSubscriptionId) {
    throw new SubscriptionNotFoundError(organizationId);
  }

  // Use Pagarme's subscription card update endpoint
  const result = await PagarmeClient.updateSubscriptionCard(
    subscription.pagarmeSubscriptionId
  );

  return { url: result.url };
}
```

### Consideração

O Pagarme não tem um portal de self-service como o Stripe. Alternativas:
1. Criar tela própria que coleta dados do cartão via Pagarme.js
2. Usar Payment Link com valor $0 para capturar novo cartão
3. Redirecionar para área do cliente Pagarme (se disponível)

---

## 8.2 Email de Pagamento Falhou

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

## 8.3 Métricas/Analytics

Adicionar métricas para monitoramento de MRR, churn, etc.

### Eventos para tracking

```typescript
// Exemplo com analytics genérico
analytics.track("subscription.upgraded", {
  organizationId,
  planId,
  mrr: plan.priceMonthly,
});

analytics.track("subscription.canceled", {
  organizationId,
  reason: "user_requested",
  mrr_lost: plan.priceMonthly,
});

analytics.track("trial.started", {
  organizationId,
  planId,
});

analytics.track("trial.converted", {
  organizationId,
  days_in_trial: daysInTrial,
});
```

### Endpoint de métricas (admin)

```typescript
// GET /v1/admin/payments/metrics
{
  mrr: 15000, // R$ 150,00
  activeSubscriptions: 10,
  trialing: 5,
  churnRate: 2.5,
  conversionRate: 45.0,
}
```

---

## 8.4 Notificação Slack/Discord

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

### Uso no webhook

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
```

---

## 8.5 Proration (Mudança de Plano)

Permitir upgrade/downgrade entre planos com cálculo proporcional.

> **Nota:** Alta complexidade. Recomendado para versão futura.

### Considerações

1. **Upgrade:** Cobrar diferença proporcional imediatamente
2. **Downgrade:** Agendar para próximo ciclo (sem reembolso)
3. **Pagarme:** Verificar se suporta proration nativo ou implementar manualmente

### Fluxo básico

```
Usuário em Plano A (R$ 50/mês) quer ir para Plano B (R$ 100/mês)
Dia 15 do ciclo (metade do mês)

Cálculo:
- Crédito restante Plano A: R$ 25 (15 dias restantes)
- Custo proporcional Plano B: R$ 50 (15 dias)
- Diferença a cobrar: R$ 25

Próximo mês: Cobra R$ 100 completo
```

---

## 8.6 Promotion Codes (Cupons de Desconto)

Permitir que usuários apliquem códigos promocionais durante o checkout para obter descontos.

> **Referência:** Better Auth + Stripe suporta `allow_promotion_codes: true` no checkout.

### Modelo de Dados

**Arquivo:** `src/db/schema/payments.ts`

Adicionar tabela para cupons:

```typescript
export const promotionCodes = pgTable("promotion_codes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: varchar("description", { length: 255 }),

  // Tipo de desconto
  discountType: varchar("discount_type", { length: 20 }).notNull(), // "percentage" | "fixed"
  discountValue: integer("discount_value").notNull(), // Em centavos ou percentual (ex: 20 = 20%)

  // Restrições
  maxRedemptions: integer("max_redemptions"), // null = ilimitado
  currentRedemptions: integer("current_redemptions").default(0),
  minAmount: integer("min_amount"), // Valor mínimo do pedido (centavos)

  // Aplicabilidade
  applicablePlans: json("applicable_plans").$type<string[]>(), // null = todos os planos
  firstPurchaseOnly: boolean("first_purchase_only").default(false),

  // Validade
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").default(true),

  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by", { length: 36 }), // Admin que criou
});

export const promotionRedemptions = pgTable("promotion_redemptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  promotionCodeId: varchar("promotion_code_id", { length: 36 })
    .notNull()
    .references(() => promotionCodes.id),
  organizationId: varchar("organization_id", { length: 36 })
    .notNull()
    .references(() => organizations.id),
  subscriptionId: varchar("subscription_id", { length: 36 }),
  discountApplied: integer("discount_applied").notNull(), // Valor do desconto aplicado
  redeemedAt: timestamp("redeemed_at").defaultNow(),
});
```

### Service

**Arquivo:** `src/modules/payments/promotion/promotion.service.ts`

```typescript
export abstract class PromotionService {
  /**
   * Validate and get promotion code details.
   */
  static async validate(
    code: string,
    organizationId: string,
    planId: string,
    amount: number
  ): Promise<{
    valid: boolean;
    promotion?: PromotionCode;
    discountAmount?: number;
    error?: string;
  }> {
    const promotion = await db.query.promotionCodes.findFirst({
      where: eq(promotionCodes.code, code.toUpperCase()),
    });

    if (!promotion) {
      return { valid: false, error: "Código promocional não encontrado" };
    }

    if (!promotion.isActive) {
      return { valid: false, error: "Código promocional inativo" };
    }

    // Verificar validade temporal
    const now = new Date();
    if (promotion.validFrom && now < promotion.validFrom) {
      return { valid: false, error: "Código promocional ainda não é válido" };
    }
    if (promotion.validUntil && now > promotion.validUntil) {
      return { valid: false, error: "Código promocional expirado" };
    }

    // Verificar limite de uso
    if (
      promotion.maxRedemptions &&
      promotion.currentRedemptions >= promotion.maxRedemptions
    ) {
      return { valid: false, error: "Código promocional esgotado" };
    }

    // Verificar se é primeira compra
    if (promotion.firstPurchaseOnly) {
      const existingRedemption = await db.query.promotionRedemptions.findFirst({
        where: eq(promotionRedemptions.organizationId, organizationId),
      });
      if (existingRedemption) {
        return { valid: false, error: "Código válido apenas para primeira compra" };
      }
    }

    // Verificar planos aplicáveis
    if (
      promotion.applicablePlans &&
      !promotion.applicablePlans.includes(planId)
    ) {
      return { valid: false, error: "Código não aplicável a este plano" };
    }

    // Verificar valor mínimo
    if (promotion.minAmount && amount < promotion.minAmount) {
      return {
        valid: false,
        error: `Valor mínimo: R$ ${(promotion.minAmount / 100).toFixed(2)}`,
      };
    }

    // Calcular desconto
    let discountAmount: number;
    if (promotion.discountType === "percentage") {
      discountAmount = Math.floor((amount * promotion.discountValue) / 100);
    } else {
      discountAmount = Math.min(promotion.discountValue, amount);
    }

    return {
      valid: true,
      promotion,
      discountAmount,
    };
  }

  /**
   * Apply promotion code to a checkout.
   */
  static async redeem(
    promotionId: string,
    organizationId: string,
    subscriptionId: string,
    discountApplied: number
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Registrar uso
      await tx.insert(promotionRedemptions).values({
        id: crypto.randomUUID(),
        promotionCodeId: promotionId,
        organizationId,
        subscriptionId,
        discountApplied,
      });

      // Incrementar contador
      await tx
        .update(promotionCodes)
        .set({
          currentRedemptions: sql`${promotionCodes.currentRedemptions} + 1`,
        })
        .where(eq(promotionCodes.id, promotionId));
    });
  }
}
```

### Integração no Checkout

**Arquivo:** `src/modules/payments/checkout/checkout.service.ts`

```typescript
type CreateCheckoutInput = {
  organizationId: string;
  planId: string;
  successUrl: string;
  userId: string;
  promotionCode?: string; // Novo campo
};

static async create(input: CreateCheckoutInput) {
  const { promotionCode, ...rest } = input;

  // ... validações existentes ...

  let discountAmount = 0;
  let promotionId: string | undefined;

  // Validar código promocional se fornecido
  if (promotionCode) {
    const validation = await PromotionService.validate(
      promotionCode,
      input.organizationId,
      input.planId,
      plan.priceMonthly
    );

    if (!validation.valid) {
      throw new InvalidPromotionCodeError(validation.error!);
    }

    discountAmount = validation.discountAmount!;
    promotionId = validation.promotion!.id;
  }

  // Criar payment link com desconto
  // Nota: Pagarme pode não suportar desconto no Payment Link
  // Alternativa: Criar plano temporário com preço descontado
  // ou aplicar desconto na primeira invoice

  // ... resto da implementação ...
}
```

### Endpoint para validar código

**Arquivo:** `src/modules/payments/promotion/index.ts`

```typescript
export const promotionController = new Elysia({
  name: "promotion",
  prefix: "/promotions",
  detail: { tags: ["Payments - Promotions"] },
})
  .post(
    "/validate",
    async ({ body }) => {
      const { code, organizationId, planId } = body;

      const plan = await PlanService.getById(planId);
      const result = await PromotionService.validate(
        code,
        organizationId,
        planId,
        plan.priceMonthly
      );

      if (!result.valid) {
        return {
          valid: false,
          error: result.error,
        };
      }

      return {
        valid: true,
        code: result.promotion!.code,
        discountType: result.promotion!.discountType,
        discountValue: result.promotion!.discountValue,
        discountAmount: result.discountAmount,
        finalAmount: plan.priceMonthly - result.discountAmount!,
      };
    },
    {
      body: t.Object({
        code: t.String(),
        organizationId: t.String(),
        planId: t.String(),
      }),
      detail: { summary: "Validate promotion code" },
    }
  );
```

### Considerações com Pagarme

O Pagarme tem suporte limitado a cupons comparado ao Stripe:

| Funcionalidade | Stripe | Pagarme |
|----------------|--------|---------|
| Cupons nativos | ✅ Coupons API | ⚠️ Limitado |
| Desconto no checkout | ✅ `allow_promotion_codes` | ❌ Não nativo |
| Desconto recorrente | ✅ Automático | ❌ Manual |

**Alternativas para Pagarme:**

1. **Criar plano temporário** com preço descontado
2. **Aplicar desconto na primeira invoice** via API
3. **Gerenciar desconto localmente** e cobrar valor já descontado
4. **Usar incrementos/decrementos** na subscription

### Fluxo Recomendado

```
1. Frontend envia código no checkout
       │
       ▼
2. API valida código (PromotionService.validate)
       │
       ├─ Inválido → Retorna erro
       │
       └─ Válido → Calcula desconto
              │
              ▼
3. Cria Payment Link com valor descontado
   OU cria subscription e aplica desconto na invoice
       │
       ▼
4. Webhook subscription.created
       │
       ▼
5. PromotionService.redeem() registra uso
       │
       ▼
6. Email de confirmação inclui desconto aplicado
```

### Admin API (CRUD de cupons)

```typescript
// POST /v1/admin/promotions - Criar cupom
// GET /v1/admin/promotions - Listar cupons
// GET /v1/admin/promotions/:id - Detalhes do cupom
// PUT /v1/admin/promotions/:id - Atualizar cupom
// DELETE /v1/admin/promotions/:id - Desativar cupom
// GET /v1/admin/promotions/:id/redemptions - Histórico de uso
```

---

## Checklist Geral

### Prioridade Alta (para produção)
- [x] Fase 6: Email de confirmação
- [ ] Fase 7: Jobs de expiração

### Prioridade Média
- [ ] Email de pagamento falhou
- [ ] Notificação Slack
- [ ] Promotion Codes (cupons)

### Prioridade Baixa (nice to have)
- [ ] Atualização de cartão
- [ ] Métricas/Analytics
- [ ] Proration

---

## Arquivos a Criar (Promotion Codes)

| Arquivo | Descrição |
|---------|-----------|
| `src/db/schema/promotions.ts` | Schema das tabelas `promotion_codes` e `promotion_redemptions` |
| `src/modules/payments/promotion/promotion.service.ts` | Service com `validate()` e `redeem()` |
| `src/modules/payments/promotion/promotion.model.ts` | Schemas Zod para validação |
| `src/modules/payments/promotion/index.ts` | Controller com endpoints |
| `src/modules/payments/errors.ts` | Adicionar `InvalidPromotionCodeError` |

---

## 8.7 Grace Period (Período de Carência)

Formalizar o período de carência para assinaturas `past_due` antes de suspender o acesso.

> **Status atual:** Implementação implícita em `checkAccess()` que retorna `hasAccess: true` para `past_due`.

### Problema

Atualmente, não há controle explícito sobre:
1. Quantos dias de carência permitir
2. Quando suspender completamente o acesso
3. Quando considerar a assinatura como "churned"

### Implementação Proposta

**Arquivo:** `src/db/schema/payments.ts`

Adicionar campos na tabela `org_subscriptions`:

```typescript
// Na tabela orgSubscriptions, adicionar:
pastDueSince: timestamp("past_due_since"), // Data em que entrou em past_due
gracePeriodEnds: timestamp("grace_period_ends"), // Data limite do grace period
```

**Arquivo:** `src/modules/payments/subscription/subscription.service.ts`

```typescript
// Constantes de configuração
const GRACE_PERIOD_DAYS = 7; // 7 dias de carência

/**
 * Mark subscription as past_due and set grace period.
 */
static async markPastDue(organizationId: string): Promise<void> {
  const now = new Date();
  const gracePeriodEnds = new Date(now);
  gracePeriodEnds.setDate(gracePeriodEnds.getDate() + GRACE_PERIOD_DAYS);

  await db
    .update(orgSubscriptions)
    .set({
      status: "past_due",
      pastDueSince: now,
      gracePeriodEnds,
    })
    .where(eq(orgSubscriptions.organizationId, organizationId));
}

/**
 * Check access considering grace period.
 */
static async checkAccess(organizationId: string): Promise<{
  hasAccess: boolean;
  status: SubscriptionStatus;
  daysRemaining?: number;
  reason?: string;
}> {
  const subscription = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, organizationId),
  });

  if (!subscription) {
    return { hasAccess: false, status: "none", reason: "no_subscription" };
  }

  const now = new Date();

  switch (subscription.status) {
    case "active":
      return { hasAccess: true, status: "active" };

    case "trial":
      if (subscription.trialEnd && now > subscription.trialEnd) {
        return { hasAccess: false, status: "trial", reason: "trial_expired" };
      }
      const trialDays = Math.ceil(
        (subscription.trialEnd!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return { hasAccess: true, status: "trial", daysRemaining: trialDays };

    case "past_due":
      // Check grace period
      if (subscription.gracePeriodEnds && now > subscription.gracePeriodEnds) {
        return { hasAccess: false, status: "past_due", reason: "grace_period_expired" };
      }
      const graceDays = subscription.gracePeriodEnds
        ? Math.ceil(
            (subscription.gracePeriodEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )
        : GRACE_PERIOD_DAYS;
      return { hasAccess: true, status: "past_due", daysRemaining: graceDays };

    case "canceled":
      // Allow access until end of billing period
      if (subscription.currentPeriodEnd && now < subscription.currentPeriodEnd) {
        const days = Math.ceil(
          (subscription.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        return { hasAccess: true, status: "canceled", daysRemaining: days };
      }
      return { hasAccess: false, status: "canceled", reason: "period_ended" };

    default:
      return { hasAccess: false, status: subscription.status, reason: "inactive" };
  }
}
```

### Job para Suspender após Grace Period

Adicionar ao `JobsService`:

```typescript
/**
 * Suspend subscriptions that exceeded grace period.
 * Should run daily.
 */
static async suspendExpiredGracePeriods(): Promise<{
  processed: number;
  suspended: string[];
}> {
  const now = new Date();

  const expiredGracePeriods = await db.query.orgSubscriptions.findMany({
    where: and(
      eq(orgSubscriptions.status, "past_due"),
      lt(orgSubscriptions.gracePeriodEnds, now)
    ),
  });

  const suspendedIds: string[] = [];

  for (const subscription of expiredGracePeriods) {
    await db
      .update(orgSubscriptions)
      .set({ status: "suspended" })
      .where(eq(orgSubscriptions.id, subscription.id));

    suspendedIds.push(subscription.id);

    PaymentHooks.emit("subscription.suspended", { subscription });
  }

  console.log(`[Jobs] Suspended ${suspendedIds.length} subscriptions`);

  return {
    processed: expiredGracePeriods.length,
    suspended: suspendedIds,
  };
}
```

---

## 8.8 Plan Limits Enforcement (Limites de Plano)

Implementar verificação de limites definidos em cada plano.

> **Status atual:** Interface `PlanLimits` existe em `src/db/schema/payments.ts:22-27` mas não há service de enforcement.

### Modelo de Limites

```typescript
// Em src/db/schema/payments.ts (já existe)
export type PlanLimits = {
  maxUsers?: number;
  maxProjects?: number;
  maxStorage?: number; // em MB
  features?: string[];
};
```

### Service de Limites

**Arquivo:** `src/modules/payments/limits/limits.service.ts`

```typescript
export abstract class LimitsService {
  /**
   * Check if organization can add more users.
   */
  static async canAddUser(organizationId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number | null;
    reason?: string;
  }> {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
      with: { plan: true },
    });

    if (!subscription?.plan) {
      return { allowed: false, current: 0, limit: 0, reason: "no_subscription" };
    }

    const limits = subscription.plan.limits as PlanLimits | null;
    if (!limits?.maxUsers) {
      return { allowed: true, current: 0, limit: null }; // Ilimitado
    }

    // Contar membros atuais
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(members)
      .where(eq(members.organizationId, organizationId));

    const current = Number(count);

    if (current >= limits.maxUsers) {
      return {
        allowed: false,
        current,
        limit: limits.maxUsers,
        reason: "user_limit_reached",
      };
    }

    return { allowed: true, current, limit: limits.maxUsers };
  }

  /**
   * Check if organization can create more projects.
   */
  static async canCreateProject(organizationId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number | null;
    reason?: string;
  }> {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
      with: { plan: true },
    });

    if (!subscription?.plan) {
      return { allowed: false, current: 0, limit: 0, reason: "no_subscription" };
    }

    const limits = subscription.plan.limits as PlanLimits | null;
    if (!limits?.maxProjects) {
      return { allowed: true, current: 0, limit: null }; // Ilimitado
    }

    // Contar projetos atuais (adaptar para sua tabela)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(projects) // Sua tabela de projetos
      .where(eq(projects.organizationId, organizationId));

    const current = Number(count);

    if (current >= limits.maxProjects) {
      return {
        allowed: false,
        current,
        limit: limits.maxProjects,
        reason: "project_limit_reached",
      };
    }

    return { allowed: true, current, limit: limits.maxProjects };
  }

  /**
   * Check if organization has access to a feature.
   */
  static async hasFeature(
    organizationId: string,
    featureName: string
  ): Promise<boolean> {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
      with: { plan: true },
    });

    if (!subscription?.plan) {
      return false;
    }

    const limits = subscription.plan.limits as PlanLimits | null;
    if (!limits?.features) {
      return true; // Se não há restrições, permite tudo
    }

    return limits.features.includes(featureName);
  }

  /**
   * Get all limits for an organization.
   */
  static async getLimits(organizationId: string): Promise<{
    plan: string;
    limits: PlanLimits | null;
    usage: {
      users: { current: number; limit: number | null };
      projects: { current: number; limit: number | null };
      storage: { current: number; limit: number | null };
    };
  }> {
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
      with: { plan: true },
    });

    if (!subscription?.plan) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const limits = subscription.plan.limits as PlanLimits | null;

    // Buscar uso atual em paralelo
    const [usersCount, projectsCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(members)
        .where(eq(members.organizationId, organizationId)),
      db.select({ count: sql<number>`count(*)` })
        .from(projects)
        .where(eq(projects.organizationId, organizationId)),
    ]);

    return {
      plan: subscription.plan.displayName,
      limits,
      usage: {
        users: {
          current: Number(usersCount[0].count),
          limit: limits?.maxUsers ?? null,
        },
        projects: {
          current: Number(projectsCount[0].count),
          limit: limits?.maxProjects ?? null,
        },
        storage: {
          current: 0, // Implementar se necessário
          limit: limits?.maxStorage ?? null,
        },
      },
    };
  }
}
```

### Middleware de Autorização

```typescript
// Em src/lib/authorization.ts ou similar

export function requireFeature(featureName: string) {
  return async ({ organizationId, set }: Context) => {
    const hasAccess = await LimitsService.hasFeature(organizationId, featureName);

    if (!hasAccess) {
      set.status = 403;
      return {
        error: "FEATURE_NOT_AVAILABLE",
        message: `Seu plano não inclui acesso a: ${featureName}`,
      };
    }
  };
}

export function requireLimit(limitType: "user" | "project") {
  return async ({ organizationId, set }: Context) => {
    const check = limitType === "user"
      ? await LimitsService.canAddUser(organizationId)
      : await LimitsService.canCreateProject(organizationId);

    if (!check.allowed) {
      set.status = 403;
      return {
        error: "LIMIT_REACHED",
        message: `Limite de ${limitType}s atingido (${check.current}/${check.limit})`,
        current: check.current,
        limit: check.limit,
      };
    }
  };
}
```

### Uso nos Controllers

```typescript
// Exemplo: ao convidar membro
.post("/invite", async ({ body, organizationId }) => {
  // Verificar limite ANTES de criar
  const canAdd = await LimitsService.canAddUser(organizationId);
  if (!canAdd.allowed) {
    throw new LimitReachedError("users", canAdd.current, canAdd.limit);
  }

  // ... criar convite ...
});
```

---

## 8.9 Dunning Emails (Emails de Cobrança)

Sequência de emails para recuperar pagamentos falhos.

> **Referência:** Better Auth + Stripe usa `invoice.past_due` e `invoice.payment_failed` com retry automático.

### Estratégia de Dunning

```
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

### Implementação

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
    // Templates HTML para cada tipo de email
    // ... implementar templates ...
    return "";
  }

  private static async hasEmailBeenSent(
    subscriptionId: string,
    emailType: string
  ): Promise<boolean> {
    // Verificar na tabela de dunning_emails
    const { dunningEmails } = await import("@/db/schema");
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
    const { dunningEmails } = await import("@/db/schema");
    await db.insert(dunningEmails).values({
      id: crypto.randomUUID(),
      subscriptionId,
      emailType,
      sentAt: new Date(),
    });
  }
}
```

### Schema para Tracking

```typescript
// Em src/db/schema/payments.ts
export const dunningEmails = pgTable("dunning_emails", {
  id: varchar("id", { length: 36 }).primaryKey(),
  subscriptionId: varchar("subscription_id", { length: 36 })
    .notNull()
    .references(() => orgSubscriptions.id),
  emailType: varchar("email_type", { length: 50 }).notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
});
```

---

## Status de Implementações Essenciais

### ✅ Implementado

| Funcionalidade | Localização | Observações |
|----------------|-------------|-------------|
| Idempotência Webhook | `webhook.service.ts:18-32` | Via `subscription_events` table |
| Retry com error tracking | `webhook.service.ts:60-71` | Registra erro e permite retry |

### ⏳ Pendente

| Funcionalidade | Seção | Prioridade |
|----------------|-------|------------|
| Grace Period formal | 8.7 | Alta |
| Plan Limits Enforcement | 8.8 | Média |
| Dunning Emails | 8.9 | Média |

---

## Checklist Geral

### Prioridade Alta (para produção)
- [x] Fase 6: Email de confirmação
- [ ] Fase 7: Jobs de expiração
- [ ] Grace Period formal (8.7)

### Prioridade Média
- [ ] Email de pagamento falhou
- [ ] Notificação Slack
- [ ] Promotion Codes (cupons)
- [ ] Plan Limits Enforcement (8.8)
- [ ] Dunning Emails (8.9)

### Prioridade Baixa (nice to have)
- [ ] Atualização de cartão
- [ ] Métricas/Analytics
- [ ] Proration

---

## Arquivos a Criar (Promotion Codes)

| Arquivo | Descrição |
|---------|-----------|
| `src/db/schema/promotions.ts` | Schema das tabelas `promotion_codes` e `promotion_redemptions` |
| `src/modules/payments/promotion/promotion.service.ts` | Service com `validate()` e `redeem()` |
| `src/modules/payments/promotion/promotion.model.ts` | Schemas Zod para validação |
| `src/modules/payments/promotion/index.ts` | Controller com endpoints |
| `src/modules/payments/errors.ts` | Adicionar `InvalidPromotionCodeError` |

## Arquivos a Criar (Grace Period, Limits, Dunning)

| Arquivo | Descrição |
|---------|-----------|
| `src/modules/payments/limits/limits.service.ts` | Service para verificação de limites |
| `src/modules/payments/dunning/dunning.service.ts` | Service para emails de cobrança |
| `src/db/schema/payments.ts` | Adicionar campos `pastDueSince`, `gracePeriodEnds`, tabela `dunning_emails` |

---

> **Status: ⏳ BACKLOG**
>
> Estas funcionalidades são opcionais e podem ser implementadas conforme necessidade.
> O módulo de pagamentos está funcional sem elas.
