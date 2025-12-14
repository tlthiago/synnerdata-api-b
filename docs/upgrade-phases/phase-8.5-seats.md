# Fase 8.5: Seats para Teams

> **Prioridade:** Média
> **Complexidade:** Média
> **Status:** ⏳ Pendente

## Objetivo

Implementar modelo de precificação por número de usuários (seats) na organização.

> **Impacto:** Modelo de receita escalável para B2B

## Pré-requisitos

- Fases 1-7 completas
- Subscription funcionando

---

## O que são Seats?

**Seats** (assentos) é um modelo de licenciamento onde você cobra por número de usuários que podem acessar o sistema dentro de uma organização.

```text
Plano Team: R$ 50/mês por seat

Organização "Acme Corp" compra 10 seats = R$ 500/mês
  → Pode ter até 10 membros ativos
  → Para adicionar o 11º membro, precisa comprar mais 1 seat
```

---

## Modelos de Cobrança por Seat

| Modelo | Descrição | Cobrança | Uso Típico |
|--------|-----------|----------|------------|
| **Per-seat fixo** | Cobra por cada seat comprado | Fixo mensal | Slack, Jira |
| **Per-seat ativo** | Cobra apenas por usuários ativos no mês | Variável | Intercom |
| **Tiers com seats inclusos** | Plano inclui X seats, cobra extra acima | Base + variável | GitHub Teams |
| **Ilimitado** | Preço fixo independente de usuários | Fixo | Enterprise |

---

## Modelo Recomendado: Tiers com Seats Inclusos

```typescript
// Estrutura de plano com seats
{
  name: "starter",
  priceMonthly: 9900,      // R$ 99,00
  seatsIncluded: 3,        // 3 seats inclusos
  pricePerExtraSeat: 2900, // R$ 29,00 por seat adicional
  maxSeats: 10,            // Máximo de 10 seats
}

{
  name: "pro",
  priceMonthly: 29900,     // R$ 299,00
  seatsIncluded: 10,       // 10 seats inclusos
  pricePerExtraSeat: 1900, // R$ 19,00 por seat adicional
  maxSeats: 50,            // Máximo de 50 seats
}

{
  name: "enterprise",
  priceMonthly: 99900,     // R$ 999,00
  seatsIncluded: null,     // Ilimitado
  pricePerExtraSeat: 0,
  maxSeats: null,
}
```

---

## Alterações no Schema

### Tabela de Planos

**Arquivo:** `src/db/schema/payments.ts`

```typescript
export const subscriptionPlans = pgTable("subscription_plans", {
  // ... campos existentes ...

  // Campos para seats
  seatsIncluded: integer("seats_included").default(1).notNull(),
  pricePerExtraSeat: integer("price_per_extra_seat").default(0),
  maxSeats: integer("max_seats"), // null = ilimitado
});
```

### Tabela de Subscriptions

```typescript
export const orgSubscriptions = pgTable("org_subscriptions", {
  // ... campos existentes ...

  // Seats comprados (pode ser maior que seatsIncluded do plano)
  seats: integer("seats").default(1).notNull(),
  pendingSeats: integer("pending_seats"), // Para redução agendada
  seatsChangeAt: timestamp("seats_change_at"), // Data da mudança
});
```

---

## Service de Seats

**Arquivo:** `src/modules/payments/seats/seats.service.ts`

```typescript
export abstract class SeatsService {
  /**
   * Get current seats usage for organization.
   */
  static async getUsage(organizationId: string): Promise<{
    seatsUsed: number;
    seatsTotal: number;
    seatsIncluded: number;
    extraSeats: number;
    canAddMember: boolean;
    pricePerExtraSeat: number;
  }> {
    const [subscription] = await db
      .select({
        seats: schema.orgSubscriptions.seats,
        seatsIncluded: schema.subscriptionPlans.seatsIncluded,
        pricePerExtraSeat: schema.subscriptionPlans.pricePerExtraSeat,
        maxSeats: schema.subscriptionPlans.maxSeats,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    // Contar membros atuais
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.members)
      .where(eq(schema.members.organizationId, organizationId));

    const seatsUsed = Number(count);
    const seatsTotal = subscription.seats;
    const extraSeats = Math.max(0, seatsTotal - subscription.seatsIncluded);

    return {
      seatsUsed,
      seatsTotal,
      seatsIncluded: subscription.seatsIncluded,
      extraSeats,
      canAddMember: seatsUsed < seatsTotal,
      pricePerExtraSeat: subscription.pricePerExtraSeat ?? 0,
    };
  }

  /**
   * Check if organization can add a new member.
   */
  static async canAddMember(organizationId: string): Promise<{
    allowed: boolean;
    seatsUsed: number;
    seatsTotal: number;
    needsMoreSeats: boolean;
    priceToAddSeat: number | null;
  }> {
    const usage = await SeatsService.getUsage(organizationId);

    if (usage.canAddMember) {
      return {
        allowed: true,
        seatsUsed: usage.seatsUsed,
        seatsTotal: usage.seatsTotal,
        needsMoreSeats: false,
        priceToAddSeat: null,
      };
    }

    // Verificar se pode comprar mais seats
    const [subscription] = await db
      .select({
        maxSeats: schema.subscriptionPlans.maxSeats,
        pricePerExtraSeat: schema.subscriptionPlans.pricePerExtraSeat,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    const canBuyMore = !subscription?.maxSeats || usage.seatsTotal < subscription.maxSeats;

    return {
      allowed: false,
      seatsUsed: usage.seatsUsed,
      seatsTotal: usage.seatsTotal,
      needsMoreSeats: true,
      priceToAddSeat: canBuyMore ? (subscription?.pricePerExtraSeat ?? null) : null,
    };
  }

  /**
   * Add extra seats to subscription.
   */
  static async addSeats(
    organizationId: string,
    quantity: number
  ): Promise<{
    newTotal: number;
    addedSeats: number;
    prorationAmount: number;
  }> {
    const [current] = await db
      .select({
        subscription: schema.orgSubscriptions,
        plan: schema.subscriptionPlans,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!current) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const { subscription, plan } = current;
    const newTotal = subscription.seats + quantity;

    // Verificar limite máximo
    if (plan.maxSeats && newTotal > plan.maxSeats) {
      throw new SeatLimitExceededError(plan.maxSeats);
    }

    // Calcular proration para seats adicionais
    const now = new Date();
    const periodEnd = subscription.currentPeriodEnd ?? now;
    const periodStart = subscription.currentPeriodStart ?? now;

    const totalDays = Math.ceil(
      (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const remainingDays = Math.ceil(
      (periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    const pricePerSeat = plan.pricePerExtraSeat ?? 0;
    const dailyRate = pricePerSeat / totalDays;
    const prorationAmount = Math.round(dailyRate * remainingDays * quantity);

    // Cobrar proration se necessário
    if (prorationAmount > 0 && subscription.pagarmeSubscriptionId) {
      // Criar cobrança avulsa no Pagarme
      // await PagarmeClient.createCharge(...)
    }

    // Atualizar seats
    await db
      .update(schema.orgSubscriptions)
      .set({ seats: newTotal })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    // Atualizar quantity na subscription do Pagarme
    if (subscription.pagarmeSubscriptionId) {
      // Pagarme usa quantity para multiplicar o valor do plano
      // await PagarmeClient.updateSubscription(subscription.pagarmeSubscriptionId, { quantity: newTotal })
    }

    PaymentHooks.emit("seats.added", {
      organizationId,
      previousSeats: subscription.seats,
      newSeats: newTotal,
      quantity,
    });

    return {
      newTotal,
      addedSeats: quantity,
      prorationAmount,
    };
  }

  /**
   * Remove seats from subscription (effective next billing cycle).
   */
  static async removeSeats(
    organizationId: string,
    quantity: number
  ): Promise<{
    newTotal: number;
    removedSeats: number;
    effectiveAt: string | null;
  }> {
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    // Verificar uso atual
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.members)
      .where(eq(schema.members.organizationId, organizationId));

    const currentMembers = Number(count);
    const newTotal = subscription.seats - quantity;

    // Não pode reduzir abaixo do uso atual
    if (newTotal < currentMembers) {
      throw new SeatsInUseError(currentMembers, newTotal);
    }

    // Não pode reduzir abaixo do mínimo do plano
    const [plan] = await db
      .select({ seatsIncluded: schema.subscriptionPlans.seatsIncluded })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, subscription.planId))
      .limit(1);

    if (plan && newTotal < plan.seatsIncluded) {
      throw new SeatsBelowMinimumError(plan.seatsIncluded);
    }

    // Agendar redução para próximo ciclo (sem reembolso)
    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingSeats: newTotal,
        seatsChangeAt: subscription.currentPeriodEnd,
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    return {
      newTotal,
      removedSeats: quantity,
      effectiveAt: subscription.currentPeriodEnd?.toISOString() ?? null,
    };
  }
}
```

---

## Endpoints de Seats

**Arquivo:** `src/modules/payments/seats/index.ts`

```typescript
export const seatsController = new Elysia({
  name: "seats",
  prefix: "/seats",
  detail: { tags: ["Payments - Seats"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    ({ session }) =>
      SeatsService.getUsage(session.activeOrganizationId as string),
    {
      auth: {
        permissions: { subscription: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: seatsUsageResponseSchema,
        // ...
      },
      detail: {
        summary: "Get seats usage",
        description: "Returns current seats usage and limits for the organization.",
      },
    }
  )
  .post(
    "/add",
    ({ session, body }) =>
      SeatsService.addSeats(
        session.activeOrganizationId as string,
        body.quantity
      ),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      body: addSeatsSchema,
      response: {
        200: addSeatsResponseSchema,
        // ...
      },
      detail: {
        summary: "Add seats",
        description: "Purchase additional seats for the organization.",
      },
    }
  )
  .post(
    "/remove",
    ({ session, body }) =>
      SeatsService.removeSeats(
        session.activeOrganizationId as string,
        body.quantity
      ),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      body: removeSeatsSchema,
      response: {
        200: removeSeatsResponseSchema,
        // ...
      },
      detail: {
        summary: "Remove seats",
        description: "Schedule seat reduction for next billing cycle.",
      },
    }
  );
```

---

## Integração com Convite de Membros

**Arquivo:** `src/modules/organization/members/members.service.ts`

```typescript
static async invite(input: InviteMemberInput): Promise<InviteMemberResponse> {
  const { organizationId, email, role } = input;

  // Verificar se pode adicionar membro
  const canAdd = await SeatsService.canAddMember(organizationId);

  if (!canAdd.allowed) {
    if (canAdd.priceToAddSeat) {
      throw new SeatLimitReachedError(
        canAdd.seatsUsed,
        canAdd.seatsTotal,
        canAdd.priceToAddSeat
      );
    }
    throw new MaxSeatsReachedError(canAdd.seatsTotal);
  }

  // ... continuar com convite ...
}
```

---

## Erros Específicos

**Arquivo:** `src/modules/payments/errors.ts`

```typescript
export class SeatLimitReachedError extends PaymentError {
  status = 403;

  constructor(seatsUsed: number, seatsTotal: number, priceToAdd: number) {
    super(
      `Seat limit reached (${seatsUsed}/${seatsTotal}). Purchase more seats to add members.`,
      "SEAT_LIMIT_REACHED",
      { seatsUsed, seatsTotal, priceToAdd }
    );
  }
}

export class MaxSeatsReachedError extends PaymentError {
  status = 403;

  constructor(maxSeats: number) {
    super(
      `Maximum seats limit reached (${maxSeats}). Upgrade your plan for more seats.`,
      "MAX_SEATS_REACHED",
      { maxSeats }
    );
  }
}

export class SeatsInUseError extends PaymentError {
  status = 400;

  constructor(currentMembers: number, requestedSeats: number) {
    super(
      `Cannot reduce to ${requestedSeats} seats. You have ${currentMembers} active members.`,
      "SEATS_IN_USE",
      { currentMembers, requestedSeats }
    );
  }
}

export class SeatsBelowMinimumError extends PaymentError {
  status = 400;

  constructor(minimumSeats: number) {
    super(
      `Cannot reduce below plan minimum of ${minimumSeats} seats.`,
      "SEATS_BELOW_MINIMUM",
      { minimumSeats }
    );
  }
}

export class SeatLimitExceededError extends PaymentError {
  status = 400;

  constructor(maxSeats: number) {
    super(
      `Cannot exceed plan maximum of ${maxSeats} seats. Upgrade your plan.`,
      "SEAT_LIMIT_EXCEEDED",
      { maxSeats }
    );
  }
}
```

---

## Integração com Pagarme

O Pagarme suporta `quantity` na subscription, que multiplica o valor do item:

```typescript
// Ao criar subscription
await PagarmeClient.createSubscription({
  customer_id: customerId,
  plan_id: planId,
  payment_method: "credit_card",
  quantity: seats, // Multiplica o valor do plano
});

// Ao atualizar seats
await PagarmeClient.updateSubscription(subscriptionId, {
  quantity: newSeats,
});
```

---

## Fluxo de UI para Compra de Seats

```text
1. Usuário tenta convidar membro
       │
       ├─► Tem seats disponíveis → Convite criado ✅
       │
       └─► Sem seats disponíveis
              │
              ▼
2. Modal: "Você atingiu o limite de X membros"
   - "Adicionar Y seats por R$ Z/mês"
   - "Upgrade para plano com mais seats"
       │
       ▼
3. Usuário escolhe adicionar seats
       │
       ▼
4. Checkout de proration (valor proporcional)
       │
       ▼
5. Seats adicionados → Convite criado ✅
```

---

## Model Schemas

**Arquivo:** `src/modules/payments/seats/seats.model.ts`

```typescript
export const addSeatsSchema = z.object({
  quantity: z.number().int().positive().max(100).describe("Number of seats to add"),
});

export const removeSeatsSchema = z.object({
  quantity: z.number().int().positive().max(100).describe("Number of seats to remove"),
});

export const seatsUsageResponseSchema = z.object({
  seatsUsed: z.number(),
  seatsTotal: z.number(),
  seatsIncluded: z.number(),
  extraSeats: z.number(),
  canAddMember: z.boolean(),
  pricePerExtraSeat: z.number(),
});

export const addSeatsResponseSchema = z.object({
  newTotal: z.number(),
  addedSeats: z.number(),
  prorationAmount: z.number(),
});

export const removeSeatsResponseSchema = z.object({
  newTotal: z.number(),
  removedSeats: z.number(),
  effectiveAt: z.string().nullable(),
});
```

---

## Hooks de Eventos

```typescript
// Em hooks.types.ts
export type PaymentEvents = {
  // ... eventos existentes ...
  "seats.added": {
    organizationId: string;
    previousSeats: number;
    newSeats: number;
    quantity: number;
  };
  "seats.removed": {
    organizationId: string;
    previousSeats: number;
    newSeats: number;
    quantity: number;
  };
};
```

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/modules/payments/seats/seats.service.ts` | Service com getUsage, canAddMember, addSeats, removeSeats |
| `src/modules/payments/seats/seats.model.ts` | Schemas Zod para requests e responses |
| `src/modules/payments/seats/index.ts` | Controller com endpoints |
| `src/modules/payments/errors.ts` | Adicionar erros de seats |
| `src/db/schema/payments.ts` | Adicionar campos seatsIncluded, pricePerExtraSeat, maxSeats, pendingSeats |

---

## Checklist de Implementação

- [ ] Adicionar campos no schema de planos (`seatsIncluded`, `pricePerExtraSeat`, `maxSeats`)
- [ ] Adicionar campos no schema de subscriptions (`seats`, `pendingSeats`, `seatsChangeAt`)
- [ ] Criar migration
- [ ] Implementar `SeatsService`
- [ ] Endpoint `GET /seats`
- [ ] Endpoint `POST /seats/add`
- [ ] Endpoint `POST /seats/remove`
- [ ] Integrar com convite de membros
- [ ] Job para processar reduções agendadas
- [ ] Testes unitários
- [ ] Testes E2E

---

> **Dependências:** Subscription funcionando
> **Impacto:** Monetização escalável para B2B, controle de membros
