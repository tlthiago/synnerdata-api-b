# Fase 2: Plan Sync

## Objetivo

Implementar a sincronização de planos locais com o Pagar.me, permitindo que planos sejam criados automaticamente na primeira vez que forem usados.

## Pré-requisitos

- **Fase 1 completa:** Types e métodos do PagarmeClient implementados

## Arquivos a Modificar

1. `src/modules/payments/plan/plan.service.ts`

---

## 2.1 Adicionar imports necessários

**Arquivo:** `src/modules/payments/plan/plan.service.ts`

Adicionar ao topo do arquivo:

```typescript
import { PagarmeClient } from "../pagarme/client";
```

---

## 2.2 Adicionar método syncToPagarme

Adicionar ao final da classe `PlanService`:

```typescript
/**
 * Sync a local plan to Pagarme.
 * Creates the plan in Pagarme if it doesn't exist and stores the pagarmePlanId.
 */
static async syncToPagarme(planId: string): Promise<string> {
  const plan = await PlanService.getById(planId);

  // Already synced
  if (plan.pagarmePlanId) {
    return plan.pagarmePlanId;
  }

  // Create plan in Pagarme
  const pagarmePlan = await PagarmeClient.createPlan(
    {
      name: plan.name,
      description: plan.displayName,
      currency: "BRL",
      interval: "month",
      interval_count: 1,
      billing_type: "prepaid",
      payment_methods: ["credit_card"],
      items: [
        {
          name: plan.displayName,
          quantity: 1,
          pricing_scheme: {
            price: plan.priceMonthly,
            scheme_type: "unit",
          },
        },
      ],
      metadata: {
        local_plan_id: plan.id,
      },
    },
    `create-plan-${plan.id}`
  );

  // Save pagarmePlanId
  await db
    .update(subscriptionPlans)
    .set({ pagarmePlanId: pagarmePlan.id })
    .where(eq(subscriptionPlans.id, planId));

  return pagarmePlan.id;
}
```

---

## 2.3 Adicionar método ensureSynced

Adicionar após o método `syncToPagarme`:

```typescript
/**
 * Ensure plan is synced to Pagarme before creating payment links.
 * Returns the plan with guaranteed pagarmePlanId.
 */
static async ensureSynced(
  planId: string
): Promise<PlanResponse & { pagarmePlanId: string }> {
  const plan = await PlanService.getById(planId);

  if (!plan.pagarmePlanId) {
    const pagarmePlanId = await PlanService.syncToPagarme(planId);
    return { ...plan, pagarmePlanId };
  }

  return plan as PlanResponse & { pagarmePlanId: string };
}
```

---

## 2.4 Verificar imports do db

Certifique-se de que os imports do drizzle estão presentes:

```typescript
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { eq } from "drizzle-orm";
```

---

## Validação da Fase 2

### Teste 1: Verificar tipos compilam

```bash
npx tsc --noEmit
```

**Resultado esperado:** Sem erros de compilação

### Teste 2: Verificar linting

```bash
npx ultracite check
```

**Resultado esperado:** Sem erros de linting

### Teste 3: Teste unitário (criar arquivo)

**Arquivo:** `src/modules/payments/plan/__tests__/plan-sync.test.ts`

```typescript
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { PlanService } from "../plan.service";

// Mock do PagarmeClient
mock.module("../../pagarme/client", () => ({
  PagarmeClient: {
    createPlan: mock(() =>
      Promise.resolve({
        id: "plan_pagarme_123",
        name: "Pro",
        status: "active",
      })
    ),
  },
}));

// Mock do db
mock.module("@/db", () => ({
  db: {
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    })),
    query: {
      subscriptionPlans: {
        findFirst: mock(() =>
          Promise.resolve({
            id: "plan_pro",
            name: "pro",
            displayName: "Pro",
            priceMonthly: 9900,
            pagarmePlanId: null,
          })
        ),
      },
    },
  },
}));

describe("PlanService.syncToPagarme", () => {
  it("should create plan in Pagarme when pagarmePlanId is null", async () => {
    const pagarmePlanId = await PlanService.syncToPagarme("plan_pro");

    expect(pagarmePlanId).toBe("plan_pagarme_123");
  });

  it("should return existing pagarmePlanId if already synced", async () => {
    // Mock plan that is already synced
    mock.module("@/db", () => ({
      db: {
        query: {
          subscriptionPlans: {
            findFirst: mock(() =>
              Promise.resolve({
                id: "plan_pro",
                name: "pro",
                displayName: "Pro",
                priceMonthly: 9900,
                pagarmePlanId: "plan_existing_456",
              })
            ),
          },
        },
      },
    }));

    const pagarmePlanId = await PlanService.syncToPagarme("plan_pro");

    expect(pagarmePlanId).toBe("plan_existing_456");
  });
});

describe("PlanService.ensureSynced", () => {
  it("should return plan with pagarmePlanId", async () => {
    const plan = await PlanService.ensureSynced("plan_pro");

    expect(plan.pagarmePlanId).toBeDefined();
    expect(typeof plan.pagarmePlanId).toBe("string");
  });
});
```

Rodar o teste:

```bash
bun test src/modules/payments/plan/__tests__/plan-sync.test.ts
```

---

## Checklist

- [x] Import do `PagarmeClient` adicionado
- [x] Método `PlanService.syncToPagarme()` implementado
- [x] Método `PlanService.ensureSynced()` implementado
- [x] `npx tsc --noEmit` passa sem erros
- [x] `npx ultracite check` passa sem erros
- [x] Teste unitário passa (opcional nesta fase)

> **Status: ✅ COMPLETA** - Métodos `syncToPagarme` e `ensureSynced` implementados em `plan.service.ts` (linhas 244-323)

---

## Notas de Implementação

### Idempotency Key

O uso de `create-plan-${plan.id}` como idempotency key garante que:
- Se a chamada falhar e for retentada, não criará plano duplicado
- O mesmo plano local sempre gera a mesma key

### Lazy Sync

A sincronização é "lazy" (sob demanda):
- Planos são criados no Pagar.me apenas quando usados pela primeira vez
- Não precisa de migration ou seed para sincronizar todos os planos

### Error Handling

Se a criação do plano falhar:
- O erro será propagado para o chamador
- O `pagarmePlanId` não será salvo
- A próxima tentativa tentará criar novamente

---

## Próxima Fase

Após validar, prosseguir para **[Fase 3: Checkout Refactor](./phase-3-checkout-refactor.md)**
