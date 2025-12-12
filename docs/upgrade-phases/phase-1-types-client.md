# Fase 1: Types & Client

## Objetivo

Adicionar os tipos e métodos necessários no `PagarmeClient` para criar planos e payment links.

## Pré-requisitos

- Nenhum (esta é a primeira fase)

## Arquivos a Modificar

1. `src/modules/payments/pagarme/pagarme.types.ts`
2. `src/modules/payments/pagarme/client.ts`

---

## 1.1 Adicionar Payment Link Types

**Arquivo:** `src/modules/payments/pagarme/pagarme.types.ts`

Adicionar ao final do arquivo:

```typescript
// ============================================================
// PAYMENT LINK TYPES
// ============================================================

export type CreatePaymentLinkRequest = {
  type: "order" | "subscription";
  name: string;
  customer_settings?: {
    customer_id: string;
  };
  cart_settings?: {
    recurrences?: Array<{
      start_in: number;
      plan_id: string;
    }>;
    items?: Array<{
      amount: number;
      description: string;
      quantity: number;
    }>;
  };
  success_url: string;
  metadata?: Record<string, string>;
};

export type PagarmePaymentLink = {
  id: string;
  url: string;
  short_url: string;
  status: "active" | "inactive" | "expired";
  type: "order" | "subscription";
  name: string;
  success_url: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
};
```

---

## 1.2 Adicionar métodos ao PagarmeClient

**Arquivo:** `src/modules/payments/pagarme/client.ts`

### 1.2.1 Adicionar imports

No topo do arquivo, adicionar os novos tipos ao import existente:

```typescript
import type {
  // ... tipos existentes ...
  CreatePaymentLinkRequest,
  PagarmePaymentLink,
} from "./pagarme.types";
```

### 1.2.2 Adicionar métodos de Plan

Adicionar após os métodos de subscription:

```typescript
// ============================================================
// PLANS
// ============================================================

static async createPlan(
  data: CreatePlanRequest,
  idempotencyKey?: string
): Promise<PagarmePlan> {
  return PagarmeClient.request("POST", "/plans", data, idempotencyKey);
}

static async getPlan(planId: string): Promise<PagarmePlan> {
  return PagarmeClient.request("GET", `/plans/${planId}`);
}

static async updatePlan(
  planId: string,
  data: Partial<CreatePlanRequest>
): Promise<PagarmePlan> {
  return PagarmeClient.request("PUT", `/plans/${planId}`, data);
}
```

### 1.2.3 Adicionar métodos de Payment Link

Adicionar após os métodos de plan:

```typescript
// ============================================================
// PAYMENT LINKS
// ============================================================

static async createPaymentLink(
  data: CreatePaymentLinkRequest,
  idempotencyKey?: string
): Promise<PagarmePaymentLink> {
  return PagarmeClient.request(
    "POST",
    "/payment_links",
    data,
    idempotencyKey
  );
}

static async getPaymentLink(
  paymentLinkId: string
): Promise<PagarmePaymentLink> {
  return PagarmeClient.request("GET", `/payment_links/${paymentLinkId}`);
}
```

---

## Validação da Fase 1

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

### Teste 3: Verificar exports (opcional)

Criar um arquivo temporário para testar os imports:

```typescript
// test-imports.ts (deletar depois)
import {
  CreatePaymentLinkRequest,
  PagarmePaymentLink
} from "./src/modules/payments/pagarme/pagarme.types";

import { PagarmeClient } from "./src/modules/payments/pagarme/client";

// Verificar que os métodos existem
const _createPlan = PagarmeClient.createPlan;
const _getPlan = PagarmeClient.getPlan;
const _createPaymentLink = PagarmeClient.createPaymentLink;
const _getPaymentLink = PagarmeClient.getPaymentLink;

console.log("Types and methods OK!");
```

---

## Checklist

- [x] Tipos `CreatePaymentLinkRequest` e `PagarmePaymentLink` adicionados
- [x] Método `PagarmeClient.createPlan()` adicionado
- [x] Método `PagarmeClient.getPlan()` adicionado
- [x] Método `PagarmeClient.updatePlan()` adicionado
- [x] Método `PagarmeClient.createPaymentLink()` adicionado
- [x] Método `PagarmeClient.getPaymentLink()` adicionado
- [x] `npx tsc --noEmit` passa sem erros
- [x] `npx ultracite check` passa sem erros

> **Status: ✅ COMPLETA** - Todos os tipos e métodos foram implementados em `pagarme.types.ts` e `client.ts`

---

## Próxima Fase

Após validar, prosseguir para **[Fase 2: Plan Sync](./phase-2-plan-sync.md)**
