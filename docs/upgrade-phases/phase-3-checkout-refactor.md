# Fase 3: Checkout Refactor

## Objetivo

Refatorar o `CheckoutService.create()` para usar Payment Links com tipo "subscription" em vez do fluxo order-based atual.

## Pré-requisitos

- **Fase 1 completa:** Types e métodos do PagarmeClient
- **Fase 2 completa:** PlanService.ensureSynced() implementado

## Arquivos a Modificar

1. `src/modules/payments/checkout/checkout.service.ts`

---

## 3.1 Entender o código atual

O `CheckoutService.create()` atual:

1. Valida email verificado
2. Verifica se não tem subscription ativa
3. Busca plano com `PlanService.getByIdForCheckout()`
4. Cria/busca customer via `CustomerService.getOrCreateForCheckout()`
5. Cria order via `PagarmeClient.createCheckout()`
6. Retorna URL do checkout

**Problemas do fluxo atual:**

- Usa orders em vez de subscriptions
- Requer dados de billing preenchidos
- Não cria subscription automática

---

## 3.2 Adicionar imports necessários

**Arquivo:** `src/modules/payments/checkout/checkout.service.ts`

Adicionar/atualizar imports:

```typescript
import { PlanService } from "../plan/plan.service";
import { PagarmeClient } from "../pagarme/client";
import type { CreatePaymentLinkRequest } from "../pagarme/pagarme.types";
import { organizationProfiles } from "@/db/schema";
```

---

## 3.3 Refatorar método create()

Substituir o método `create()` atual por:

```typescript
/**
 * Create a checkout session for upgrading from trial to paid.
 * Uses Payment Links with type="subscription".
 */
static async create(input: CreateCheckoutInput): Promise<CheckoutResponse> {
  const { organizationId, planId, successUrl, userId } = input;

  // 1. Verify user email is verified
  const [user] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.emailVerified) {
    throw new EmailNotVerifiedError();
  }

  // 2. Check if organization already has an active subscription
  const [existingSubscription] = await db
    .select({ status: orgSubscriptions.status })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, organizationId))
    .limit(1);

  if (existingSubscription?.status === "active") {
    throw new SubscriptionAlreadyActiveError();
  }

  // 3. Ensure plan is synced to Pagarme (creates if not exists)
  const plan = await PlanService.ensureSynced(planId);

  // 4. Check if we have a customer_id to pre-fill checkout
  const [profile] = await db
    .select({ pagarmeCustomerId: organizationProfiles.pagarmeCustomerId })
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, organizationId))
    .limit(1);

  // 5. Build payment link request
  const paymentLinkData: CreatePaymentLinkRequest = {
    type: "subscription",
    name: `Upgrade para ${plan.displayName}`,
    cart_settings: {
      recurrences: [
        {
          start_in: 1,
          plan_id: plan.pagarmePlanId,
        },
      ],
    },
    success_url: successUrl,
    metadata: {
      organization_id: organizationId,
      plan_id: planId,
    },
  };

  // 6. Add customer_id if exists (pre-fills checkout form)
  if (profile?.pagarmeCustomerId) {
    paymentLinkData.customer_settings = {
      customer_id: profile.pagarmeCustomerId,
    };
  }

  // 7. Create payment link
  const paymentLink = await PagarmeClient.createPaymentLink(
    paymentLinkData,
    `checkout-${organizationId}-${planId}-${Date.now()}`
  );

  return {
    checkoutUrl: paymentLink.url,
    paymentLinkId: paymentLink.id,
  };
}
```

---

## 3.4 Atualizar tipos de input/output

Verificar se os tipos `CreateCheckoutInput` e `CheckoutResponse` estão corretos:

**Arquivo:** `src/modules/payments/checkout/checkout.model.ts`

```typescript
// Verificar/atualizar se necessário
export type CreateCheckoutInput = {
  organizationId: string;
  planId: string;
  successUrl: string;
  userId: string;
  // Remover billingData se existir - não é mais necessário
};

export type CheckoutResponse = {
  checkoutUrl: string;
  paymentLinkId: string;
};
```

---

## 3.5 Atualizar imports do schema

Garantir que os imports do schema estão corretos:

```typescript
import { db } from "@/db";
import { users, orgSubscriptions, organizationProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
```

---

## Validação da Fase 3

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

### Teste 3: Rodar testes existentes

```bash
bun test src/modules/payments/__tests__/checkout.e2e.test.ts
```

**Nota:** Os testes existentes podem falhar se mockarem o fluxo antigo.
Nesse caso, atualize os mocks para refletir o novo fluxo.

---

## Mudanças Principais

| Antes | Depois |
|-------|--------|
| Usa `PagarmeClient.createCheckout()` | Usa `PagarmeClient.createPaymentLink()` |
| Requer `billingData` preenchido | Checkout coleta dados automaticamente |
| Cria order | Cria subscription |
| `CustomerService.getOrCreateForCheckout()` | `profile.pagarmeCustomerId` opcional |
| Retorna `url` do checkout | Retorna `url` do payment link |

---

## Backward Compatibility

O método `handleCallback()` pode precisar de ajustes dependendo de como o frontend usa:

- **Se usa query params:** Payment Links redirecionam para `success_url` diretamente
- **Se usa polling:** O webhook `subscription.created` (Fase 4) ativará a subscription

Por enquanto, manter o `handleCallback()` como está - será ajustado na Fase 4 se necessário.

---

## Checklist

- [x] Imports atualizados
- [x] Método `create()` refatorado para usar Payment Links
- [x] Tipos `CreateCheckoutInput` e `CheckoutResponse` atualizados
- [x] `billingData` removido como requisito
- [x] `npx tsc --noEmit` passa sem erros
- [x] `npx ultracite check` passa sem erros

> **Status: ✅ COMPLETA** - `CheckoutService.create()` usa `PagarmeClient.createPaymentLink()` com `type: "subscription"`.
>
> **Implementação em:** `src/modules/payments/checkout/checkout.service.ts`
>
> **Melhorias adicionadas:**
> - `payment_settings` com configurações de cartão de crédito
> - `max_paid_sessions: 1` para evitar pagamentos duplicados
> - `pendingCheckouts` para rastrear checkouts e resolver lookup de organization_id no webhook

---

## Próxima Fase

Após validar, prosseguir para **[Fase 4: Webhook Handler](./phase-4-webhook-handler.md)**
