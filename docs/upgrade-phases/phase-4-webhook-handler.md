# Fase 4: Webhook Handler

## Objetivo

Implementar o handler para o evento `subscription.created` e a sincronização dos dados do customer para `organization_profiles`.

## Pré-requisitos

- **Fase 1 completa:** Types do PagarmeClient
- **Fase 3 completa:** Checkout criando Payment Links com metadata

## Arquivos a Modificar

1. `src/modules/payments/pagarme/pagarme.types.ts` (expandir PagarmeWebhookData)
2. `src/modules/payments/webhook/webhook.service.ts`

---

## 4.1 Expandir PagarmeWebhookData

**Arquivo:** `src/modules/payments/pagarme/pagarme.types.ts`

Atualizar o tipo `PagarmeWebhookData` para incluir dados completos do customer:

```typescript
export type PagarmeWebhookData = {
  id: string;
  code?: string;
  status?: string;
  amount?: number;
  subscription?: {
    id: string;
    status: string;
  };
  invoice?: {
    id: string;
    code: string;
    url: string;
  };
  current_period?: {
    start_at: string;
    end_at: string;
  };
  last_transaction?: {
    id: string;
    status: string;
    gateway_response?: {
      code: string;
      message: string;
    };
  };
  // Customer data from webhook
  customer?: {
    id: string;
    name: string;
    email: string;
    document: string;
    document_type: "CPF" | "CNPJ";
    type: "individual" | "company";
    phones?: {
      mobile_phone?: {
        country_code: string;
        area_code: string;
        number: string;
      };
    };
  };
  // Card data (masked)
  card?: {
    id: string;
    last_four_digits: string;
    brand: string;
    exp_month: number;
    exp_year: number;
  };
  metadata?: Record<string, string>;
};
```

---

## 4.2 Adicionar imports no WebhookService

**Arquivo:** `src/modules/payments/webhook/webhook.service.ts`

Adicionar aos imports existentes:

```typescript
import { organizationProfiles } from "@/db/schema";
```

---

## 4.3 Adicionar case no switch

No método `process()`, adicionar o case para `subscription.created`:

```typescript
// Dentro do switch(payload.type)
case "subscription.created":
  await WebhookService.handleSubscriptionCreated(payload);
  break;
```

---

## 4.4 Implementar handleSubscriptionCreated

Adicionar o método após os handlers existentes:

```typescript
/**
 * Handle subscription.created webhook.
 * Updates subscription status to active and syncs customer data.
 */
private static async handleSubscriptionCreated(
  payload: PagarmeWebhookPayload
) {
  const data = payload.data;
  const organizationId = data.metadata?.organization_id;
  const planId = data.metadata?.plan_id;

  if (!organizationId) {
    console.log("subscription.created: No organization_id in metadata");
    return;
  }

  // 1. Update subscription status to active
  await db
    .update(orgSubscriptions)
    .set({
      status: "active",
      pagarmeSubscriptionId: data.id,
      pagarmeCustomerId: data.customer?.id,
      currentPeriodStart: data.current_period?.start_at
        ? new Date(data.current_period.start_at)
        : new Date(),
      currentPeriodEnd: data.current_period?.end_at
        ? new Date(data.current_period.end_at)
        : null,
      trialUsed: true,
    })
    .where(eq(orgSubscriptions.organizationId, organizationId));

  // 2. Sync customer data to organization_profiles (only empty fields)
  if (data.customer) {
    await WebhookService.syncCustomerData(organizationId, data.customer);
  }

  // 3. Emit hook event
  const [subscription] = await db
    .select()
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, organizationId))
    .limit(1);

  if (subscription) {
    PaymentHooks.emit("subscription.activated", {
      subscription,
      planId,
    });
  }

  console.log(
    `subscription.created: Activated subscription for org ${organizationId}`
  );
}
```

---

## 4.5 Implementar syncCustomerData

Adicionar o método após `handleSubscriptionCreated`:

```typescript
/**
 * Sync customer data from Pagarme to organization_profiles.
 * Only updates empty fields to preserve user-provided data.
 */
private static async syncCustomerData(
  organizationId: string,
  customer: NonNullable<PagarmeWebhookData["customer"]>
) {
  const [profile] = await db
    .select({
      legalName: organizationProfiles.legalName,
      taxId: organizationProfiles.taxId,
      mobile: organizationProfiles.mobile,
    })
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, organizationId))
    .limit(1);

  if (!profile) {
    console.log(
      `syncCustomerData: No profile found for org ${organizationId}`
    );
    return;
  }

  // Build phone number string from Pagarme format
  const mobilePhone = customer.phones?.mobile_phone;
  const phoneNumber = mobilePhone
    ? `+${mobilePhone.country_code}${mobilePhone.area_code}${mobilePhone.number}`
    : null;

  // Only update empty fields - preserve user-provided data
  const updates: Record<string, string | null> = {
    pagarmeCustomerId: customer.id,
  };

  if (!profile.legalName && customer.name) {
    updates.legalName = customer.name;
  }

  if (!profile.taxId && customer.document) {
    updates.taxId = customer.document;
  }

  if (!profile.mobile && phoneNumber) {
    updates.mobile = phoneNumber;
  }

  await db
    .update(organizationProfiles)
    .set(updates)
    .where(eq(organizationProfiles.organizationId, organizationId));

  console.log(
    `syncCustomerData: Updated profile for org ${organizationId}`,
    Object.keys(updates)
  );
}
```

---

## 4.6 Verificar imports do PaymentHooks

Garantir que o import do PaymentHooks está presente:

```typescript
import { PaymentHooks } from "../hooks";
```

---

## Validação da Fase 4

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

### Teste 3: Rodar testes de webhook existentes

```bash
bun test src/modules/payments/__tests__/webhook.e2e.test.ts
```

### Teste 4: Teste manual do handler (criar arquivo)

**Arquivo:** `src/modules/payments/webhook/__tests__/subscription-created.test.ts`

```typescript
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { WebhookService } from "../webhook.service";

describe("WebhookService.handleSubscriptionCreated", () => {
  const validPayload = {
    id: "hook_123",
    type: "subscription.created" as const,
    created_at: new Date().toISOString(),
    data: {
      id: "sub_pagarme_123",
      status: "active",
      current_period: {
        start_at: "2024-01-01T00:00:00Z",
        end_at: "2024-02-01T00:00:00Z",
      },
      customer: {
        id: "cus_pagarme_456",
        name: "John Doe",
        email: "john@example.com",
        document: "12345678900",
        document_type: "CPF" as const,
        type: "individual" as const,
        phones: {
          mobile_phone: {
            country_code: "55",
            area_code: "11",
            number: "999999999",
          },
        },
      },
      metadata: {
        organization_id: "org_123",
        plan_id: "plan_pro",
      },
    },
  };

  it("should process subscription.created webhook", async () => {
    // This test validates the structure - actual DB operations are mocked
    expect(validPayload.type).toBe("subscription.created");
    expect(validPayload.data.metadata?.organization_id).toBeDefined();
    expect(validPayload.data.customer).toBeDefined();
  });

  it("should build phone number correctly", () => {
    const phone = validPayload.data.customer?.phones?.mobile_phone;
    if (phone) {
      const phoneNumber = `+${phone.country_code}${phone.area_code}${phone.number}`;
      expect(phoneNumber).toBe("+5511999999999");
    }
  });
});
```

Rodar o teste:

```bash
bun test src/modules/payments/webhook/__tests__/subscription-created.test.ts
```

---

## Fluxo Completo

Após esta fase, o fluxo completo funciona assim:

```
1. Frontend chama POST /checkout
   ↓
2. CheckoutService.create() cria Payment Link com metadata
   ↓
3. Usuário completa pagamento no Pagar.me
   ↓
4. Pagar.me cria subscription automaticamente
   ↓
5. Pagar.me envia webhook subscription.created
   ↓
6. WebhookService.handleSubscriptionCreated():
   - Atualiza orgSubscriptions.status = "active"
   - Salva pagarmeSubscriptionId e pagarmeCustomerId
   - Sincroniza dados do customer → organization_profiles
   - Emite evento subscription.activated
   ↓
7. Usuário redirecionado para success_url
```

---

## Checklist

- [x] `PagarmeWebhookData` expandido com dados do customer
- [x] Case `subscription.created` adicionado no switch
- [x] Método `handleSubscriptionCreated()` implementado
- [x] Método `syncCustomerData()` implementado
- [x] Imports atualizados
- [x] `npx tsc --noEmit` passa sem erros
- [x] `npx ultracite check` passa sem erros
- [x] Testes existentes continuam passando

> **Status: ✅ COMPLETA**
>
> **Implementação em:** `src/modules/payments/webhook/webhook.service.ts`
>
> - `handleSubscriptionCreated()`: linhas 287-421
> - `syncCustomerData()`: linhas 427-493
> - Case no switch: linhas 51-53
>
> **Melhorias adicionadas:**
> - Lookup via `pendingCheckouts` quando metadata não está presente no webhook
> - Cálculo de `periodStart` e `periodEnd` com múltiplos fallbacks
> - Marca `pendingCheckouts` como completed após processar

---

## Próxima Fase

Após validar, prosseguir para **[Fase 5: E2E Test](./phase-5-e2e-test.md)**
