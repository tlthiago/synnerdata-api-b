# Dependências para Implementação do Upgrade

Este documento detalha as dependências e pré-requisitos necessários antes de implementar o fluxo de upgrade de subscription conforme definido em `upgrade-implementation-plan.md`.

---

## Resumo das Dependências

| Dependência | Arquivo | Tipo | Prioridade |
|-------------|---------|------|------------|
| Payment Link Types | `pagarme/pagarme.types.ts` | Adicionar | Alta |
| PagarmeClient.createPlan() | `pagarme/client.ts` | Adicionar | Alta |
| PagarmeClient.createPaymentLink() | `pagarme/client.ts` | Adicionar | Alta |
| PlanService.syncToPagarme() | `plan/plan.service.ts` | Adicionar | Alta |
| WebhookService subscription.created | `webhook/webhook.service.ts` | Adicionar | Alta |
| Customer data sync in webhook | `webhook/webhook.service.ts` | Adicionar | Alta |
| CheckoutService refactoring | `checkout/checkout.service.ts` | Modificar | Alta |
| Expand PagarmeWebhookData customer | `pagarme/pagarme.types.ts` | Modificar | Média |

---

## Status Atual do Código

### O que já existe

| Componente | Status | Observações |
|------------|--------|-------------|
| `pagarmePlanId` no schema | ✅ Existe | Campo já está na tabela `subscriptionPlans` |
| Tipos de Plan (CreatePlanRequest, PagarmePlan) | ✅ Existe | Tipos completos |
| Tipos de Customer | ✅ Existe | Tipos completos |
| Tipos de Subscription | ✅ Existe | Tipos completos |
| Tipos de Webhook (básico) | ✅ Existe | Precisa expandir customer data |
| PagarmeClient (base) | ✅ Existe | Métodos: createCustomer, getCustomer, createSubscription, etc |
| WebhookService (base) | ✅ Existe | Handlers: charge.paid, charge.payment_failed, charge.refunded, subscription.created, subscription.canceled, subscription.updated |
| CheckoutService (order-based) | ✅ Existe | Usa `createCheckout()` baseado em orders |
| PlanService (básico) | ✅ Existe | Métodos: list, getById, getByName |
| CustomerService | ✅ Existe | getOrCreateForCheckout, create, getCustomerId |

### O que precisa ser adicionado/modificado

| Componente | Status | Ação Necessária |
|------------|--------|-----------------|
| Tipos Payment Link | ❌ Não existe | Adicionar `CreatePaymentLinkRequest`, `PagarmePaymentLink` |
| PagarmeClient.createPlan() | ❌ Não existe | Implementar método |
| PagarmeClient.createPaymentLink() | ❌ Não existe | Implementar método |
| PlanService.syncToPagarme() | ❌ Não existe | Implementar método |
| WebhookService subscription.created | ❌ Não existe | Adicionar handler |
| Customer data sync | ❌ Não existe | Sincronizar dados do checkout para organization_profiles |
| CheckoutService | ⚠️ Precisa refatorar | Mudar de order-based para Payment Links |

---

## Dependência 1: Payment Link Types

### Arquivo: `src/modules/payments/pagarme/pagarme.types.ts`

Adicionar os tipos para criação e resposta de Payment Links:

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

### Referência da API Pagar.me

- Endpoint: `POST /payment_links`
- Documentação: https://docs.pagar.me/reference/payment-links

---

## Dependência 2: Expandir PagarmeWebhookData

### Arquivo: `src/modules/payments/pagarme/pagarme.types.ts`

O tipo `PagarmeWebhookData` precisa ter dados completos do customer para o fluxo de sincronização:

```typescript
// Atualizar o tipo existente
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
  // Expandir customer com dados completos
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
  // Dados do cartão (mascarados)
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

## Dependência 3: PagarmeClient.createPlan()

### Arquivo: `src/modules/payments/pagarme/client.ts`

Adicionar método para criar planos no Pagar.me:

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

### Referência da API Pagar.me

- Endpoint: `POST /plans`
- Documentação: https://docs.pagar.me/reference/plans

### Exemplo de Request

```json
{
  "name": "Pro",
  "currency": "BRL",
  "interval": "month",
  "interval_count": 1,
  "billing_type": "prepaid",
  "payment_methods": ["credit_card"],
  "items": [{
    "name": "Synnerdata Pro",
    "quantity": 1,
    "pricing_scheme": {
      "price": 9900,
      "scheme_type": "unit"
    }
  }],
  "metadata": {
    "local_plan_id": "plan_pro"
  }
}
```

---

## Dependência 4: PagarmeClient.createPaymentLink()

### Arquivo: `src/modules/payments/pagarme/client.ts`

Adicionar método para criar Payment Links:

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

static async getPaymentLink(paymentLinkId: string): Promise<PagarmePaymentLink> {
  return PagarmeClient.request("GET", `/payment_links/${paymentLinkId}`);
}
```

### Referência da API Pagar.me

- Endpoint: `POST /payment_links`
- Documentação: https://docs.pagar.me/reference/payment-links

### Exemplo de Request (Subscription)

```json
{
  "type": "subscription",
  "name": "Upgrade para Pro",
  "cart_settings": {
    "recurrences": [{
      "start_in": 1,
      "plan_id": "plan_xxx"
    }]
  },
  "success_url": "https://app.synnerdata.com/billing?upgraded=true",
  "metadata": {
    "organization_id": "org_xxx",
    "plan_id": "plan_pro"
  }
}
```

### Exemplo de Request (Com Customer ID - pré-preenche dados)

```json
{
  "type": "subscription",
  "name": "Upgrade para Pro",
  "customer_settings": {
    "customer_id": "cus_xxx"
  },
  "cart_settings": {
    "recurrences": [{
      "start_in": 1,
      "plan_id": "plan_xxx"
    }]
  },
  "success_url": "https://app.synnerdata.com/billing?upgraded=true",
  "metadata": {
    "organization_id": "org_xxx",
    "plan_id": "plan_pro"
  }
}
```

---

## Dependência 5: PlanService.syncToPagarme()

### Arquivo: `src/modules/payments/plan/plan.service.ts`

Adicionar método para sincronizar planos locais com Pagar.me:

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

/**
 * Ensure plan is synced to Pagarme before creating payment links.
 */
static async ensureSynced(planId: string): Promise<PlanResponse & { pagarmePlanId: string }> {
  const plan = await PlanService.getById(planId);

  if (!plan.pagarmePlanId) {
    const pagarmePlanId = await PlanService.syncToPagarme(planId);
    return { ...plan, pagarmePlanId };
  }

  return plan as PlanResponse & { pagarmePlanId: string };
}
```

### Imports Necessários

```typescript
import { PagarmeClient } from "../pagarme/client";
```

### Considerações

- Usar idempotency key para evitar duplicação
- O pagarmePlanId deve ser salvo no banco após criação
- Método pode ser chamado on-demand (lazy sync) ou via seed/migration

---

## Dependência 6: WebhookService subscription.created

### Arquivo: `src/modules/payments/webhook/webhook.service.ts`

Adicionar handler para o evento `subscription.created`:

```typescript
// Adicionar no switch case
case "subscription.created":
  await WebhookService.handleSubscriptionCreated(payload);
  break;

// Implementar o handler
private static async handleSubscriptionCreated(payload: WebhookPayload) {
  const data = payload.data as {
    id: string;
    current_period?: { start_at: string; end_at: string };
    customer?: {
      id: string;
      name: string;
      email: string;
      document: string;
      phones?: {
        mobile_phone?: {
          country_code: string;
          area_code: string;
          number: string;
        };
      };
    };
    card?: {
      last_four_digits: string;
      brand: string;
    };
    metadata?: Record<string, string>;
  };

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

  // 3. Send confirmation email
  // await EmailService.sendSubscriptionConfirmed(organizationId, planId);

  // 4. Emit hook event
  const subscription = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, organizationId),
  });

  if (subscription) {
    PaymentHooks.emit("subscription.activated", { subscription });
  }
}

/**
 * Sync customer data from Pagarme to organization_profiles.
 * Only updates empty fields to preserve user-provided data.
 */
private static async syncCustomerData(
  organizationId: string,
  customer: {
    id: string;
    name: string;
    email: string;
    document: string;
    phones?: {
      mobile_phone?: {
        country_code: string;
        area_code: string;
        number: string;
      };
    };
  }
) {
  const profile = await db.query.organizationProfiles.findFirst({
    where: eq(organizationProfiles.organizationId, organizationId),
  });

  if (!profile) {
    return;
  }

  // Build phone number string from Pagarme format
  const mobilePhone = customer.phones?.mobile_phone;
  const phoneNumber = mobilePhone
    ? `+${mobilePhone.country_code}${mobilePhone.area_code}${mobilePhone.number}`
    : null;

  // Only update empty fields
  const updates: Partial<typeof organizationProfiles.$inferInsert> = {
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
}
```

### Imports Necessários

```typescript
import { organizationProfiles } from "@/db/schema";
```

---

## Dependência 7: CheckoutService Refactoring

### Arquivo: `src/modules/payments/checkout/checkout.service.ts`

Refatorar o método `create()` para usar Payment Links em vez de checkout baseado em orders:

```typescript
/**
 * Create a checkout session for upgrading from trial to paid.
 * Uses Payment Links with type="subscription".
 */
static async create(input: CreateCheckoutInput) {
  const { organizationId, planId, successUrl, userId } = input;

  // 1. Verify user email is verified
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user?.emailVerified) {
    throw new EmailNotVerifiedError();
  }

  // 2. Verify user is owner of organization
  // TODO: Add owner validation
  // const member = await MemberService.getByUserAndOrg(userId, organizationId);
  // if (member.role !== "owner") {
  //   throw new ForbiddenError("Only organization owner can upgrade");
  // }

  // 3. Check if organization already has an active subscription
  const existingSubscription = await db.query.orgSubscriptions.findFirst({
    where: eq(orgSubscriptions.organizationId, organizationId),
  });

  if (existingSubscription?.status === "active") {
    throw new SubscriptionAlreadyActiveError();
  }

  // 4. Ensure plan is synced to Pagarme
  const plan = await PlanService.ensureSynced(planId);

  // 5. Check if we have a customer_id to pre-fill checkout
  const profile = await db.query.organizationProfiles.findFirst({
    where: eq(organizationProfiles.organizationId, organizationId),
  });

  // 6. Build payment link request
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

  // Add customer_id if exists (pre-fills checkout)
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

### Mudanças Principais

1. Remove coleta obrigatória de billing data
2. Remove `CustomerService.getOrCreateForCheckout()` - checkout coleta dados
3. Usa `PlanService.ensureSynced()` para garantir plano no Pagar.me
4. Cria Payment Link tipo "subscription" em vez de order-based checkout
5. Passa `customer_id` apenas se já existir (pré-preenche dados)

### Imports Necessários

```typescript
import { organizationProfiles } from "@/db/schema";
import type { CreatePaymentLinkRequest } from "../pagarme/pagarme.types";
```

---

## Ordem de Implementação

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ORDEM DE IMPLEMENTAÇÃO                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Types (base para tudo)                                                   │
│     └── pagarme.types.ts                                                     │
│         ├── CreatePaymentLinkRequest                                         │
│         ├── PagarmePaymentLink                                               │
│         └── Expandir PagarmeWebhookData (customer)                           │
│                                                                              │
│  2. PagarmeClient (métodos)                                                  │
│     └── client.ts                                                            │
│         ├── createPlan()                                                     │
│         ├── getPlan()                                                        │
│         ├── createPaymentLink()                                              │
│         └── getPaymentLink()                                                 │
│                                                                              │
│  3. PlanService (sincronização)                                              │
│     └── plan.service.ts                                                      │
│         ├── syncToPagarme()                                                  │
│         └── ensureSynced()                                                   │
│                                                                              │
│  4. WebhookService (handler)                                                 │
│     └── webhook.service.ts                                                   │
│         ├── handleSubscriptionCreated()                                      │
│         └── syncCustomerData()                                               │
│                                                                              │
│  5. CheckoutService (refactoring)                                            │
│     └── checkout.service.ts                                                  │
│         └── create() - usar Payment Links                                    │
│                                                                              │
│  6. Testes                                                                   │
│     └── Validar fluxo completo                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Checklist de Implementação

### Fase 1: Types
- [ ] Adicionar `CreatePaymentLinkRequest` em `pagarme.types.ts`
- [ ] Adicionar `PagarmePaymentLink` em `pagarme.types.ts`
- [ ] Expandir `PagarmeWebhookData` com dados completos do customer
- [ ] Exportar novos tipos

### Fase 2: PagarmeClient
- [ ] Implementar `createPlan()`
- [ ] Implementar `getPlan()`
- [ ] Implementar `createPaymentLink()`
- [ ] Implementar `getPaymentLink()`

### Fase 3: PlanService
- [ ] Implementar `syncToPagarme()`
- [ ] Implementar `ensureSynced()`
- [ ] Adicionar imports necessários

### Fase 4: WebhookService
- [ ] Adicionar case `subscription.created` no switch
- [ ] Implementar `handleSubscriptionCreated()`
- [ ] Implementar `syncCustomerData()`
- [ ] Adicionar imports necessários

### Fase 5: CheckoutService
- [ ] Refatorar `create()` para usar Payment Links
- [ ] Remover dependência de `billing` data obrigatório
- [ ] Usar `PlanService.ensureSynced()`
- [ ] Adicionar imports necessários

### Fase 6: Validação
- [ ] Rodar `npx tsc` para verificar tipos
- [ ] Rodar `npx ultracite check` para verificar linting
- [ ] Testar fluxo manualmente

---

## Arquivos Afetados

| Arquivo | Ação | Linhas Estimadas |
|---------|------|------------------|
| `src/modules/payments/pagarme/pagarme.types.ts` | Modificar | +50 linhas |
| `src/modules/payments/pagarme/client.ts` | Modificar | +40 linhas |
| `src/modules/payments/plan/plan.service.ts` | Modificar | +60 linhas |
| `src/modules/payments/webhook/webhook.service.ts` | Modificar | +80 linhas |
| `src/modules/payments/checkout/checkout.service.ts` | Modificar | Refatorar ~60 linhas |

---

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| API Pagar.me Payment Links diferente do documentado | Alto | Testar com sandbox antes |
| Webhook subscription.created não ter todos os dados | Médio | Buscar subscription via API se necessário |
| Conflito com fluxo existente de order-based checkout | Médio | Manter backward compatibility temporária |

---

## Próximos Passos

1. **Revisar este plano** com o time
2. **Implementar as dependências** na ordem definida
3. **Testar no sandbox** do Pagar.me
4. **Implementar o fluxo de upgrade** conforme `upgrade-implementation-plan.md`
