# Fase 8.3: Ciclo de Vida da Subscription

> **Prioridade:** Alta/Média
> **Complexidade:** Média
> **Status:** ⏳ Pendente

## Objetivo

Implementar controles formais para o ciclo de vida da subscription: Grace Period (período de carência) e Plan Limits Enforcement (verificação de limites).

## Pré-requisitos

- Fases 1-7 completas
- Webhook handler funcionando

---

## 8.3.1 Grace Period (Período de Carência)

Formalizar o período de carência para assinaturas `past_due` antes de suspender o acesso.

> **Status atual:** Implementação implícita em `checkAccess()` que retorna `hasAccess: true` para `past_due`.

### Problema

Atualmente, não há controle explícito sobre:
1. Quantos dias de carência permitir
2. Quando suspender completamente o acesso
3. Quando considerar a assinatura como "churned"

### Alteração no Schema

**Arquivo:** `src/db/schema/payments.ts`

Adicionar campos na tabela `org_subscriptions`:

```typescript
// Na tabela orgSubscriptions, adicionar:
pastDueSince: timestamp("past_due_since"), // Data em que entrou em past_due
gracePeriodEnds: timestamp("grace_period_ends"), // Data limite do grace period
```

---

### Service

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

---

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

## 8.3.2 Plan Limits Enforcement (Limites de Plano)

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

---

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

---

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

---

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

### Erros Específicos

**Arquivo:** `src/modules/payments/errors.ts`

```typescript
export class LimitReachedError extends PaymentError {
  status = 403;

  constructor(resource: string, current: number, limit: number | null) {
    super(
      `Limite de ${resource} atingido (${current}/${limit ?? "∞"}).`,
      "LIMIT_REACHED",
      { resource, current, limit }
    );
  }
}

export class FeatureNotAvailableError extends PaymentError {
  status = 403;

  constructor(featureName: string) {
    super(
      `Seu plano não inclui acesso a: ${featureName}`,
      "FEATURE_NOT_AVAILABLE",
      { feature: featureName }
    );
  }
}

export class GracePeriodExpiredError extends PaymentError {
  status = 402;

  constructor(organizationId: string) {
    super(
      "Período de carência expirado. Atualize seu pagamento para continuar.",
      "GRACE_PERIOD_EXPIRED",
      { organizationId }
    );
  }
}
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/db/schema/payments.ts` | Modificar | Adicionar campos `pastDueSince`, `gracePeriodEnds` |
| `src/modules/payments/subscription/subscription.service.ts` | Modificar | Adicionar `markPastDue()`, atualizar `checkAccess()` |
| `src/modules/payments/limits/limits.service.ts` | Criar | Service para verificação de limites |
| `src/modules/payments/errors.ts` | Modificar | Adicionar erros de limite e grace period |
| `src/lib/authorization.ts` | Modificar | Adicionar middlewares `requireFeature()` e `requireLimit()` |

---

## Checklist de Implementação

### Grace Period
- [ ] Adicionar campos no schema (`pastDueSince`, `gracePeriodEnds`)
- [ ] Atualizar `markPastDue()` para setar grace period
- [ ] Atualizar `checkAccess()` para verificar grace period
- [ ] Criar job `suspendExpiredGracePeriods()`
- [ ] Adicionar status `suspended` se não existir
- [ ] Testes unitários

### Plan Limits
- [ ] Criar `LimitsService` com métodos de verificação
- [ ] Criar middlewares de autorização
- [ ] Integrar com endpoint de convite de membros
- [ ] Integrar com endpoint de criação de projetos
- [ ] Endpoint `GET /billing/limits` para dashboard
- [ ] Testes unitários

---

> **Dependências:** Webhook handler para detectar `past_due`
> **Impacto:** Melhora controle de acesso e monetização

---

## 8.3.3 Cancelamento e Restauração de Assinaturas

### ⚠️ Limitação do Pagar.me

**Uma assinatura cancelada no Pagar.me NÃO pode ser reativada.**

> "Uma assinatura cancelada não pode ser alterada nem cobrada novamente, então se o assinante quiser voltar a usar o seu serviço, ele precisa criar uma nova assinatura."
>
> — [Documentação Pagar.me: Conceitos de Recorrência](https://docs.pagar.me/v3/docs/conceitos-de-recorr%C3%AAncia)

### Status de Assinatura no Pagar.me

| Status | Descrição | Reversível? |
|--------|-----------|-------------|
| `paid` | Assinatura em dia | ✅ |
| `trialing` | Período de teste | ✅ |
| `pending_payment` | Aguardando pagamento (dentro do prazo) | ✅ |
| `unpaid` | Inadimplente (prazo expirou) | ✅ |
| `ended` | Todas as cobranças concluídas | ❌ |
| `canceled` | Cancelada | ❌ **Irreversível** |

### Problema na Implementação Atual

O método `cancel()` chama `PagarmeClient.cancelSubscription()` **imediatamente**:

```typescript
// subscription.service.ts - PROBLEMA
static async cancel(input: CancelSubscriptionInput) {
  // ...
  if (subscription.pagarmeSubscriptionId) {
    await PagarmeClient.cancelSubscription(  // ⚠️ Cancelamento imediato!
      subscription.pagarmeSubscriptionId,
      false
    );
  }
  // ...
}
```

**Consequência:** Quando o usuário cancela, o Pagar.me recebe o comando, cancela a assinatura de forma irreversível, e envia o webhook `subscription.canceled`. Após isso, a restauração é impossível.

### Fluxo Atual (Problemático)

```
Usuário cancela via API
    ↓
PagarmeClient.cancelSubscription() é chamado
    ↓
Pagar.me cancela IMEDIATAMENTE
    ↓
Webhook subscription.canceled chega
    ↓
Status local muda para "canceled"
    ↓
Usuário tenta restaurar → ❌ ERRO: Não é possível restaurar
```

---

### Solução Recomendada: Cancelamento Agendado

Implementar "soft cancel" onde o cancelamento no Pagar.me só ocorre quando o período pago termina.

#### Alteração no `cancel()`

```typescript
static async cancel(input: CancelSubscriptionInput): Promise<CancelSubscriptionResponse> {
  const { organizationId } = input;

  const subscription = await SubscriptionService.findByOrganizationId(organizationId);

  if (!subscription) {
    throw new SubscriptionNotFoundError(organizationId);
  }

  if (!["active", "trial"].includes(subscription.status)) {
    throw new SubscriptionNotCancelableError(subscription.status);
  }

  // ✅ NÃO cancela no Pagar.me imediatamente
  // Apenas marca localmente para cancelamento no fim do período
  await db
    .update(schema.orgSubscriptions)
    .set({
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
    })
    .where(eq(schema.orgSubscriptions.id, subscription.id));

  // Emite evento para notificações
  PaymentHooks.emit("subscription.cancelScheduled", { subscription });

  return {
    success: true as const,
    data: {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    },
  };
}
```

#### Novo Job: Processar Cancelamentos Agendados

**Arquivo:** `src/modules/payments/jobs/jobs.service.ts`

```typescript
/**
 * Process subscriptions scheduled for cancellation.
 * Should run daily.
 */
static async processScheduledCancellations(): Promise<{
  processed: number;
  canceled: string[];
}> {
  const now = new Date();

  // Buscar assinaturas agendadas para cancelamento cujo período já terminou
  const scheduledCancellations = await db
    .select()
    .from(schema.orgSubscriptions)
    .where(
      and(
        eq(schema.orgSubscriptions.cancelAtPeriodEnd, true),
        lt(schema.orgSubscriptions.currentPeriodEnd, now),
        inArray(schema.orgSubscriptions.status, ["active", "trial"])
      )
    );

  const canceledIds: string[] = [];

  for (const subscription of scheduledCancellations) {
    // Agora sim, cancela no Pagar.me
    if (subscription.pagarmeSubscriptionId) {
      try {
        await PagarmeClient.cancelSubscription(
          subscription.pagarmeSubscriptionId,
          true // cancel_pending_invoices
        );
      } catch (error) {
        console.error(
          `[Jobs] Failed to cancel subscription ${subscription.id} on Pagarme:`,
          error
        );
        continue;
      }
    }

    // Atualiza status local
    await db
      .update(schema.orgSubscriptions)
      .set({ status: "canceled" })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    canceledIds.push(subscription.id);

    PaymentHooks.emit("subscription.canceled", { subscription });
  }

  console.log(`[Jobs] Canceled ${canceledIds.length} scheduled subscriptions`);

  return {
    processed: scheduledCancellations.length,
    canceled: canceledIds,
  };
}
```

#### Endpoint para o Job

```typescript
// Em jobs/index.ts
.post("/process-scheduled-cancellations", () => JobsService.processScheduledCancellations(), {
  response: {
    200: processScheduledCancellationsResponseSchema,
    401: unauthorizedErrorSchema,
  },
  detail: {
    summary: "Process scheduled cancellations",
    description: "Cancels subscriptions that reached end of their billing period.",
  },
})
```

---

### Novo Fluxo (Correto)

```
Usuário cancela via API
    ↓
Marca cancelAtPeriodEnd = true (SOMENTE local)
    ↓
Assinatura continua ATIVA até currentPeriodEnd
    ↓
Usuário pode RESTAURAR a qualquer momento
    ↓
[Se restaurar] → Limpa cancelAtPeriodEnd → Continua ativo
    ↓
[Se não restaurar] → Job diário verifica → currentPeriodEnd passou?
    ↓
Job cancela no Pagar.me → Status muda para "canceled"
```

### Alteração no `restore()` (Opcional)

O `restore()` atual já funciona corretamente com esse novo fluxo:

```typescript
static async restore(input: RestoreSubscriptionInput): Promise<RestoreSubscriptionResponse> {
  const { organizationId } = input;
  const subscription = await SubscriptionService.findByOrganizationId(organizationId);

  if (!subscription) {
    throw new SubscriptionNotFoundError(organizationId);
  }

  // Validações - com o novo fluxo, essas condições fazem sentido:
  // - isNotScheduledForCancellation: Não faz sentido restaurar se não foi cancelado
  // - isAlreadyCanceled: Impossível restaurar após job processar (status = "canceled")
  // - isExpired: Impossível restaurar trial expirado
  const isNotScheduledForCancellation = !subscription.cancelAtPeriodEnd;
  const isAlreadyCanceled = subscription.status === "canceled";
  const isExpired = subscription.status === "expired";

  if (isNotScheduledForCancellation || isAlreadyCanceled || isExpired) {
    throw new SubscriptionNotRestorableError();
  }

  // Limpa os campos de cancelamento - assinatura volta ao normal
  await db
    .update(schema.orgSubscriptions)
    .set({
      cancelAtPeriodEnd: false,
      canceledAt: null,
    })
    .where(eq(schema.orgSubscriptions.id, subscription.id));

  PaymentHooks.emit("subscription.restored", { subscription });

  return {
    success: true as const,
    data: { restored: true },
  };
}
```

---

### Novo Hook Event

Adicionar em `hooks/hooks.types.ts`:

```typescript
export type PaymentEvents = {
  // ... eventos existentes ...
  "subscription.cancelScheduled": { subscription: OrgSubscription };
  "subscription.restored": { subscription: OrgSubscription };
};
```

---

### Checklist de Implementação

- [ ] Remover chamada a `PagarmeClient.cancelSubscription()` do método `cancel()`
- [ ] Adicionar job `processScheduledCancellations()` no `JobsService`
- [ ] Adicionar endpoint `/jobs/process-scheduled-cancellations`
- [ ] Adicionar hooks `subscription.cancelScheduled` e `subscription.restored`
- [ ] Configurar cron job para rodar diariamente
- [ ] Atualizar emails de cancelamento para informar que acesso continua até fim do período
- [ ] Testes unitários para novo fluxo
- [ ] Teste E2E: cancel → restore → verify still active

---

### Referências

- [Pagar.me: Conceitos de Recorrência](https://docs.pagar.me/v3/docs/conceitos-de-recorr%C3%AAncia)
- [Pagar.me: Assinaturas API Reference](https://docs.pagar.me/reference/assinaturas-1)
