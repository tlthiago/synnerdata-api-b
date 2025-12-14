# Fase 8.1: Portal de Billing Próprio

> **Prioridade:** Alta
> **Complexidade:** Alta
> **Status:** 🟡 Em Progresso

## Objetivo

Como o Pagarme não oferece um portal de self-service nativo (diferente do Stripe Billing Portal), precisamos implementar nosso próprio portal de billing para que clientes gerenciem sua assinatura de forma autônoma.

## Pré-requisitos

- Fases 1-7 completas
- Subscription e Billing services funcionando

---

## Visão Geral

O portal permitirá que clientes gerenciem sua assinatura de forma autônoma, sem precisar contatar suporte.

## Arquitetura de Rotas (Frontend)

```text
/billing
├── /overview              # Resumo: plano, próxima cobrança, uso de limites
├── /invoices              # Histórico de faturas
├── /invoices/:id          # Detalhes + download da fatura
├── /payment-method        # Cartão atual + atualizar
├── /plan                  # Plano atual + comparação + trocar
├── /plan/change           # Fluxo de mudança de plano
└── /cancel                # Fluxo de cancelamento com retenção
```

---

## Funcionalidades do Portal

### MVP (Fase 1) - Prioridade Alta

| Funcionalidade | Endpoint Backend | Status |
|----------------|------------------|--------|
| Resumo da assinatura | `GET /subscription` | ✅ Existe |
| Dados do plano atual | `GET /subscription` | ✅ Existe |
| Próxima cobrança | `GET /subscription` | ✅ Existe |
| Histórico de faturas | `GET /billing/invoices` | ✅ Implementado |
| Download de fatura | `GET /billing/invoices/:id/download` | ✅ Implementado |
| Cancelar assinatura | `POST /subscription/cancel` | ✅ Existe |
| Restaurar assinatura | `POST /subscription/restore` | ✅ Existe |
| Atualizar cartão | `POST /billing/update-card` | ✅ Implementado |

### Completo (Fase 2) - Prioridade Média

| Funcionalidade | Endpoint Backend | Status |
|----------------|------------------|--------|
| Trocar de plano | `POST /subscription/change-plan` | ⏳ Implementar |
| Alternar mensal/anual | `POST /subscription/change-cycle` | ⏳ Implementar |
| Uso de limites | `GET /billing/usage` | ⏳ Implementar |
| Dados de faturamento | `PUT /billing/info` | ⏳ Implementar |
| Aplicar cupom | `POST /billing/apply-coupon` | ⏳ Implementar |

---

## Progresso da Implementação

### Backend - MVP Completo ✅

**Módulo refatorado:** `src/modules/payments/billing/`

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `billing.model.ts` | ✅ | Schemas com `successResponseSchema` e `.describe()` |
| `billing.service.ts` | ✅ | Select API, tipos explícitos, métodos privados |
| `index.ts` | ✅ | Controller com `requireOrganization` e permissões |

**Endpoints implementados:**

```typescript
GET  /v1/payments/billing/invoices              // Lista faturas (paginado)
GET  /v1/payments/billing/invoices/:id/download // URL de download da fatura
POST /v1/payments/billing/update-card           // Atualiza cartão de crédito
```

**Permissões:** Somente `owner` da organização tem acesso (`billing: ["read", "update"]`)

### Testes - E2E Completos ✅

**Arquivos de teste:** `src/modules/payments/billing/__tests__/`

| Arquivo | Testes | Status |
|---------|--------|--------|
| `list-invoices.test.ts` | 10 | ✅ |
| `download-invoice.test.ts` | 7 | ✅ |
| `update-card.test.ts` | 10 | ✅ |

**Total:** 27 testes passando

**Cobertura:**
- Autenticação (401)
- Autorização - sem organização (403 `NO_ACTIVE_ORGANIZATION`)
- Autorização - roles não permitidos (403 `FORBIDDEN`)
- Subscription não encontrada (404)
- Validação de input (422)
- Happy paths (200)
- Erros de API externa (500)

---

## Implementação Realizada: Atualizar Cartão

### Fluxo

```text
1. Frontend coleta dados do cartão via Pagarme.js
       │
       ▼
2. Pagarme.js retorna card_id (tokenizado)
       │
       ▼
3. Frontend envia card_id para POST /billing/update-card
       │
       ▼
4. Backend chama PagarmeClient.updateSubscriptionCard(subscriptionId, cardId)
       │
       ▼
5. Pagarme atualiza cartão na subscription
       │
       ▼
6. Retorna { success: true, data: { updated: true } }
```

### Endpoint

**Arquivo:** `src/modules/payments/billing/index.ts`

```typescript
.post(
  "/update-card",
  ({ session, body }) =>
    BillingService.updateCard({
      ...body,
      organizationId: session.activeOrganizationId as string,
    }),
  {
    auth: {
      permissions: { billing: ["update"] },
      requireOrganization: true,
    },
    body: updateCardSchema,
    response: {
      200: updateCardResponseSchema,
      400: validationErrorSchema,
      401: unauthorizedErrorSchema,
      403: forbiddenErrorSchema,
      404: notFoundErrorSchema,
    },
    detail: {
      summary: "Update payment card",
      description: "Updates the credit card for the organization's subscription.",
    },
  }
)
```

### Service

**Arquivo:** `src/modules/payments/billing/billing.service.ts`

```typescript
static async updateCard(input: UpdateCardInput): Promise<UpdateCardResponse> {
  const { organizationId, cardId } = input;

  const subscription =
    await BillingService.findSubscriptionByOrganizationId(organizationId);

  if (!subscription?.pagarmeSubscriptionId) {
    throw new SubscriptionNotFoundError(organizationId);
  }

  await PagarmeClient.updateSubscriptionCard(
    subscription.pagarmeSubscriptionId,
    cardId
  );

  return {
    success: true as const,
    data: { updated: true as const },
  };
}
```

---

## Implementação: Uso de Limites (Pendente)

**Arquivo:** `src/modules/payments/billing/billing.model.ts`

```typescript
export const getUsageResponseSchema = successResponseSchema(
  z.object({
    plan: z.object({
      name: z.string().describe("Plan internal name"),
      displayName: z.string().describe("Plan display name"),
    }),
    usage: z.object({
      members: z.object({
        current: z.number().int().describe("Current member count"),
        limit: z.number().int().nullable().describe("Member limit"),
        percentage: z.number().int().nullable().describe("Usage percentage"),
      }),
      projects: z.object({
        current: z.number().int().describe("Current project count"),
        limit: z.number().int().nullable().describe("Project limit"),
        percentage: z.number().int().nullable().describe("Usage percentage"),
      }),
      storage: z.object({
        current: z.number().int().describe("Current storage in MB"),
        limit: z.number().int().nullable().describe("Storage limit in MB"),
        percentage: z.number().int().nullable().describe("Usage percentage"),
      }),
    }),
    features: z.array(z.string()).describe("Available features"),
  })
);

export type GetUsageInput = { organizationId: string };
export type GetUsageResponse = z.infer<typeof getUsageResponseSchema>;
```

**Arquivo:** `src/modules/payments/billing/billing.service.ts`

```typescript
static async getUsage(input: GetUsageInput): Promise<GetUsageResponse> {
  const { organizationId } = input;

  const [result] = await db
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

  if (!result) {
    throw new SubscriptionNotFoundError(organizationId);
  }

  const limits = result.plan.limits as PlanLimits | null;

  const [membersCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.members)
    .where(eq(schema.members.organizationId, organizationId));

  return {
    success: true as const,
    data: {
      plan: {
        name: result.plan.name,
        displayName: result.plan.displayName,
      },
      usage: {
        members: {
          current: Number(membersCount.count),
          limit: limits?.maxMembers ?? null,
          percentage: limits?.maxMembers
            ? Math.round((Number(membersCount.count) / limits.maxMembers) * 100)
            : null,
        },
        projects: {
          current: 0,
          limit: limits?.maxProjects ?? null,
          percentage: null,
        },
        storage: {
          current: 0,
          limit: limits?.maxStorage ?? null,
          percentage: null,
        },
      },
      features: limits?.features ?? [],
    },
  };
}
```

---

## Implementação: Dados de Faturamento (Pendente)

### Model

**Arquivo:** `src/modules/payments/billing/billing.model.ts`

```typescript
export const updateBillingInfoSchema = z.object({
  taxId: z.string().min(14).max(18).optional().describe("CNPJ da empresa"),
  legalName: z.string().min(1).max(255).optional().describe("Razão social"),
  billingEmail: z.string().email().optional().describe("Email para faturas"),
  phone: z.string().min(10).max(15).optional().describe("Telefone"),
  address: z
    .object({
      street: z.string().min(1).describe("Logradouro"),
      number: z.string().min(1).describe("Número"),
      complement: z.string().optional().describe("Complemento"),
      neighborhood: z.string().min(1).describe("Bairro"),
      city: z.string().min(1).describe("Cidade"),
      state: z.string().length(2).describe("UF"),
      zipCode: z.string().length(8).describe("CEP"),
    })
    .optional()
    .describe("Endereço de faturamento"),
});

const updateBillingInfoDataSchema = z.object({
  updated: z.literal(true).describe("Update confirmation"),
});

export const updateBillingInfoResponseSchema = successResponseSchema(
  updateBillingInfoDataSchema
);

export type UpdateBillingInfo = z.infer<typeof updateBillingInfoSchema>;
export type UpdateBillingInfoInput = UpdateBillingInfo & {
  organizationId: string;
};
export type UpdateBillingInfoResponse = z.infer<
  typeof updateBillingInfoResponseSchema
>;
```

### Service

**Arquivo:** `src/modules/payments/billing/billing.service.ts`

```typescript
static async updateBillingInfo(
  input: UpdateBillingInfoInput
): Promise<UpdateBillingInfoResponse> {
  const { organizationId, ...data } = input;

  const [profile] = await db
    .select()
    .from(schema.organizationProfiles)
    .where(eq(schema.organizationProfiles.organizationId, organizationId))
    .limit(1);

  if (!profile) {
    throw new CustomerNotFoundError(organizationId);
  }

  await db
    .update(schema.organizationProfiles)
    .set({
      taxId: data.taxId ?? profile.taxId,
      legalName: data.legalName ?? profile.legalName,
      email: data.billingEmail ?? profile.email,
      phone: data.phone ?? profile.phone,
    })
    .where(eq(schema.organizationProfiles.organizationId, organizationId));

  if (profile.pagarmeCustomerId) {
    await PagarmeClient.updateCustomer(profile.pagarmeCustomerId, {
      name: data.legalName ?? profile.legalName ?? profile.tradeName,
      document: data.taxId?.replace(/\D/g, "") ?? profile.taxId ?? undefined,
    });
  }

  return { success: true as const, data: { updated: true as const } };
}
```

---

## Componentes Frontend Sugeridos

```text
components/billing/
├── BillingOverview.tsx        # Card com resumo da assinatura
├── PlanCard.tsx               # Exibe plano atual com botão de upgrade
├── UsageProgress.tsx          # Barras de progresso dos limites
├── InvoiceList.tsx            # Tabela de faturas
├── InvoiceRow.tsx             # Linha de fatura com download
├── PaymentMethodCard.tsx      # Exibe cartão atual (últimos 4 dígitos)
├── UpdateCardForm.tsx         # Formulário com Pagarme.js
├── CancelSubscriptionModal.tsx # Modal de cancelamento com retenção
├── PlanComparison.tsx         # Comparação de planos para upgrade
└── BillingInfoForm.tsx        # Formulário de dados de faturamento
```

---

## Checklist de Implementação

### MVP ✅
- [x] Endpoint `POST /billing/update-card`
- [x] Endpoint `GET /billing/invoices`
- [x] Endpoint `GET /billing/invoices/:id/download`
- [x] Permissão `billing` criada (owner only)
- [x] Testes E2E do módulo billing
- [ ] Página frontend de atualização de cartão
- [ ] Integração com Pagarme.js para tokenização

### Completo
- [ ] Endpoint `GET /billing/usage`
- [ ] Endpoint `PUT /billing/info`
- [ ] Componentes frontend do portal
- [ ] Testes E2E do fluxo completo

---

## Notas de Implementação

### Faturas (Invoices)

As faturas são geradas automaticamente pelo Pagarme ao final de cada ciclo de cobrança. Para subscriptions com status `future` (ainda não iniciadas), não existem faturas.

**Endpoint Pagarme para adiantar fatura:**
```
POST /subscriptions/{subscription_id}/cycles/{cycle_id}/pay
```

### Permissões

Foi criada uma nova permissão `billing` em `src/lib/permissions.ts`:

```typescript
export const orgStatements = {
  // ...
  billing: ["read", "update"],
} as const;

export const orgRoles = {
  owner: orgAc.newRole({
    // ...
    billing: ["read", "update"],
  }),
  // manager, supervisor, viewer NÃO têm acesso
};
```

---

> **Dependências:** Nenhuma específica além das fases anteriores
> **Impacto:** Reduz tickets de suporte, melhora experiência do cliente
