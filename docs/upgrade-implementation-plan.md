# Plano: Checkout e Upgrade de Subscription

## Resumo

Implementar o fluxo completo de upgrade de trial para plano pago usando **Payment Links com tipo "subscription"** do Pagar.me, que cria a subscription automaticamente após o pagamento.

---

## Requisitos para Upgrade

### Quem pode fazer upgrade

- **Apenas o owner** da organização pode iniciar o upgrade
- Validação via `authorizeReference` similar ao padrão Better Auth + Stripe

### Pré-requisitos

| Requisito        | Validação                   | Campo/Origem            |
| ---------------- | --------------------------- | ----------------------- |
| Autenticação     | Usuário logado              | Session                 |
| Email verificado | `user.emailVerified = true` | `user.emailVerified`    |
| Role             | Owner da organização        | `member.role = "owner"` |

**Nota:** Não é necessário ter o perfil da organização preenchido. O checkout do Pagar.me coleta os dados do cliente.

### Coleta de Dados do Customer

O **checkout do Pagar.me coleta automaticamente** os dados do cliente durante o pagamento:
- Nome
- Email
- Documento (CPF ou CNPJ)
- Telefone

Após o pagamento, o webhook retorna os dados do customer criado, e a API **atualiza apenas os campos vazios** da tabela `organization_profiles`.

### Fluxo de Dados do Customer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COLETA DE DADOS DO CUSTOMER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRIMEIRO UPGRADE (sem pagarmeCustomerId)                                    │
│  ════════════════════════════════════════                                    │
│                                                                              │
│  [Upgrade] → API cria payment link SEM customer_id                           │
│                    │                                                         │
│                    ▼                                                         │
│           Checkout Pagar.me coleta:                                          │
│           - Nome                                                             │
│           - Email                                                            │
│           - Documento (CPF/CNPJ)                                             │
│           - Telefone                                                         │
│           - Dados do cartão                                                  │
│                    │                                                         │
│                    ▼                                                         │
│           Webhook subscription.created retorna customer                      │
│                    │                                                         │
│                    ▼                                                         │
│           API atualiza organization_profiles (apenas campos vazios):         │
│           - pagarmeCustomerId = customer.id                                  │
│           - legalName = customer.name (se vazio)                             │
│           - taxId = customer.document (se vazio)                             │
│           - mobile = customer.phones.mobile (se vazio)                       │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRÓXIMOS UPGRADES (com pagarmeCustomerId)                                   │
│  ═════════════════════════════════════════                                   │
│                                                                              │
│  [Upgrade] → Verifica pagarmeCustomerId existe?                              │
│                    │                                                         │
│           ┌───────┴───────┐                                                  │
│           │               │                                                  │
│        Sim ▼           Não ▼                                                 │
│                                                                              │
│   Passa customer_id    Checkout coleta                                       │
│   no payment link      dados novamente                                       │
│   (pré-preenche)                                                             │
│           │               │                                                  │
│           └───────┬───────┘                                                  │
│                   ▼                                                          │
│           Checkout Pagar.me                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sincronização de Dados (Webhook)

```typescript
// No handler subscription.created
async handleSubscriptionCreated(data: PagarmeWebhookData) {
  const { organization_id } = data.metadata;
  const customer = data.customer;

  // Buscar perfil atual
  const profile = await OrganizationProfileService.getByOrgId(organization_id);

  // Atualizar APENAS campos vazios (não sobrescreve dados existentes)
  await db.update(organizationProfiles).set({
    pagarmeCustomerId: customer.id,
    ...(profile.legalName ? {} : { legalName: customer.name }),
    ...(profile.taxId ? {} : { taxId: customer.document }),
    ...(profile.mobile ? {} : { mobile: customer.phones?.mobile_phone?.number }),
  }).where(eq(organizationProfiles.organizationId, organization_id));

  // Continua com o fluxo normal...
}
```

### Estados que permitem upgrade

| Status Atual          | Pode Upgrade? | Comportamento                            |
| --------------------- | ------------- | ---------------------------------------- |
| `trialing` (ativo)    | ✅ Sim        | Upgrade antecipado permitido             |
| `trialing` (expirado) | ✅ Sim        | Fluxo normal                             |
| `past_due`            | ✅ Sim        | Tenta retry da invoice pendente primeiro |
| `active`              | ❌ Não        | Já tem subscription ativa                |
| `canceled`            | ✅ Sim        | Pode reativar com novo upgrade           |

### Estratégia para `past_due` (Retry)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE RETRY (PAST_DUE)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  charge.payment_failed ──────> status: "past_due"                           │
│         │                            │                                      │
│         │                            ├─ Grace period: 7-14 dias             │
│         │                            ├─ Acesso mantido durante grace period │
│         │                            ├─ Email notificando cliente           │
│         │                            │                                      │
│         ▼                            ▼                                      │
│  Pagar.me Smart Retries      Cliente atualiza cartão                        │
│  (automático, até 8x)              │                                        │
│         │                          ▼                                        │
│         │                    Retry automático da invoice                    │
│         │                          │                                        │
│         ▼                          ▼                                        │
│  charge.paid ───────────────> status: "active"                              │
│         │                                                                   │
│         │ (se todas as tentativas falharem após grace period)               │
│         ▼                                                                   │
│  subscription.canceled ──────> status: "canceled"                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Comportamento:**

1. **Grace Period**: Manter acesso por 7-14 dias após falha
2. **Smart Retries**: Pagar.me tenta automaticamente até 8x
3. **Notificação**: Enviar email pedindo atualização do cartão
4. **Retry on Update**: Quando cliente atualiza cartão, Pagar.me cobra invoice pendente
5. **Cancelamento**: Apenas após esgotar tentativas e grace period

---

## Abordagem: Payment Link com type="subscription"

Após pesquisa na documentação do Pagar.me, descobrimos que **Payment Links** suportam `type: "subscription"`. Isso simplifica significativamente o fluxo, pois o Pagar.me cria a subscription automaticamente após o primeiro pagamento.

### Primeiro Upgrade (sem customer_id)

O checkout coleta os dados do cliente automaticamente:

```typescript
// Criar Payment Link SEM customer_id
POST /payment_links
{
  "type": "subscription",
  "name": "Upgrade para Pro",
  // SEM customer_settings - checkout coleta os dados
  "cart_settings": {
    "recurrences": [{
      "start_in": 1,
      "plan_id": "plan_xxx"
    }]
  },
  "success_url": "https://app.synnerdata.com/billing?upgraded=true",
  "metadata": {
    "organization_id": "org_xxx"
  }
}
```

### Próximos Upgrades (com customer_id)

Se já temos `pagarmeCustomerId`, passamos para pré-preencher:

```typescript
// Criar Payment Link COM customer_id
POST /payment_links
{
  "type": "subscription",
  "name": "Upgrade para Pro",
  "customer_settings": {
    "customer_id": "cus_xxx"                 // Pré-preenche dados
  },
  "cart_settings": {
    "recurrences": [{
      "start_in": 1,
      "plan_id": "plan_xxx"
    }]
  },
  "success_url": "https://app.synnerdata.com/billing?upgraded=true",
  "metadata": {
    "organization_id": "org_xxx"
  }
}

// Response
{
  "id": "pl_xxx",
  "url": "https://pagar.me/pl_xxx",
  "status": "active"
}
```

---

## Fluxo de Upgrade (Simplificado)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FLUXO DE UPGRADE (PAYMENT LINK)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. FRONTEND                    2. API                   3. PAGAR.ME        │
│  ───────────────────────────────────────────────────────────────────────    │
│                                                                              │
│  [Upgrade] ──────────────────> POST /checkout ─────────> Create Plan (1x)   │
│                                    │                          │             │
│                                    ├─ Validate user           │             │
│                                    ├─ Get/Create customer ────┼────────>    │
│                                    ├─ Create payment_link ────┼────────>    │
│                                    │   type: "subscription"   │             │
│                                    │                          │             │
│  <────────────────── { url } ─────┘                          │             │
│                                                               │             │
│  Redirect to ──────────────────────────────────────────────> │             │
│  payment_link_url                                             │             │
│                                                               │             │
│                                    Pagar.me Checkout Page     │             │
│                                    (cartão de crédito)        │             │
│                                           │                   │             │
│                                           │ Payment           │             │
│                                           ▼                   │             │
│                                    ┌──────────────────────────┤             │
│                                    │ Pagar.me AUTOMATICAMENTE:│             │
│                                    │ 1. Processa pagamento    │             │
│                                    │ 2. Cria Subscription     │             │
│                                    │ 3. Envia webhooks        │             │
│                                    └──────────────────────────┤             │
│                                           │                   │             │
│                                    POST /webhooks/pagarme <───┘             │
│                                           │                                 │
│                                           ├─ subscription.created           │
│                                           ├─ charge.paid                    │
│                                           ├─ Update orgSubscription         │
│                                           │   status = "active"             │
│                                           │                                 │
│  <─────────── Redirect to successUrl ─────┘                                 │
│                                                                              │
│  Dashboard (subscription ativa)                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Cobrança Recorrente

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COBRANÇA RECORRENTE MENSAL                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Pagar.me gerencia TUDO automaticamente:                                     │
│                                                                              │
│  1. Subscription criada com:                                                 │
│     - plan_id (define preço, intervalo, etc)                                 │
│     - customer_id (com cartão tokenizado)                                    │
│     - billing_day (dia do primeiro pagamento)                                │
│                                                                              │
│  2. Cobranças automáticas:                                                   │
│     - Mensal no dia definido                                                 │
│     - Retry automático em falhas                                             │
│     - Notificações ao cliente                                                │
│                                                                              │
│  3. Nossa API apenas REAGE via webhooks:                                     │
│     - subscription.created → status "active"                                 │
│     - charge.paid → Renova período                                           │
│     - charge.payment_failed → status "past_due"                              │
│     - subscription.canceled → status "canceled"                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Billing Portal / Self-Service

O cliente precisa de autonomia para gerenciar sua subscription sem precisar contatar suporte.

### Funcionalidades do Billing Portal

| Funcionalidade                   | Descrição                                    | Prioridade |
| -------------------------------- | -------------------------------------------- | ---------- |
| **Atualizar método de pagamento** | Trocar cartão de crédito                    | Alta       |
| **Ver histórico de cobranças**   | Lista de invoices/faturas                    | Alta       |
| **Download de invoices**         | PDF para contabilidade                       | Alta       |
| **Ver detalhes da subscription** | Plano atual, próxima cobrança, status        | Alta       |
| **Cancelar subscription**        | Self-service com confirmação                 | Média      |

### Fluxo do Billing Portal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BILLING PORTAL / SELF-SERVICE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Frontend (Página de Billing)                                                │
│  ────────────────────────────────────────────────────────────────────────    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Plano Atual: Pro                           Status: ✅ Ativo        │    │
│  │  Próxima cobrança: 15/01/2025               Valor: R$ 99,00/mês     │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                     │    │
│  │  💳 Método de Pagamento                                             │    │
│  │  ────────────────────────────────────────────────────────────────   │    │
│  │  Visa •••• 4242                              [Atualizar Cartão]     │    │
│  │                                                                     │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                     │    │
│  │  📄 Histórico de Cobranças                                          │    │
│  │  ────────────────────────────────────────────────────────────────   │    │
│  │  15/12/2024  R$ 99,00  ✅ Pago   [Download PDF]                     │    │
│  │  15/11/2024  R$ 99,00  ✅ Pago   [Download PDF]                     │    │
│  │  15/10/2024  R$ 99,00  ✅ Pago   [Download PDF]                     │    │
│  │                                                                     │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                     │    │
│  │  [Cancelar Assinatura]                                              │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Endpoints do Billing Portal

```typescript
// GET /v1/billing/subscription
// Retorna detalhes da subscription atual
{
  plan: { id: "pro", name: "Pro", price: 9900 },
  status: "active",
  currentPeriodEnd: "2025-01-15T00:00:00Z",
  paymentMethod: {
    brand: "visa",
    last4: "4242",
    expiryMonth: 12,
    expiryYear: 2026
  }
}

// GET /v1/billing/invoices
// Lista histórico de cobranças
{
  invoices: [
    {
      id: "inv_xxx",
      amount: 9900,
      status: "paid",
      paidAt: "2024-12-15T10:30:00Z",
      invoiceUrl: "https://pagar.me/invoices/xxx.pdf"
    }
  ]
}

// POST /v1/billing/payment-method
// Gera link para atualizar cartão no Pagar.me
{
  url: "https://pagar.me/update-card/xxx"
}

// POST /v1/billing/cancel
// Inicia cancelamento da subscription
{
  canceledAt: "2025-01-15T00:00:00Z", // cancela no fim do período
  message: "Subscription will be canceled at the end of the current period"
}
```

### Implementação

**Opção 1: Portal Próprio (Recomendado)**
- Construir páginas de billing no frontend
- API retorna dados da subscription e invoices do Pagar.me
- Para atualizar cartão, redireciona para checkout do Pagar.me

**Opção 2: Portal do Pagar.me (se disponível)**
- Verificar se Pagar.me oferece Customer Portal similar ao Stripe
- Redirecionar cliente para portal hospedado

---

## Email de Confirmação pós-Upgrade

Após o webhook `subscription.created`, enviar email de boas-vindas ao plano pago.

### Template do Email

```
Assunto: 🎉 Bem-vindo ao Plano Pro - Synnerdata

Olá [Nome da Organização],

Seu upgrade foi concluído com sucesso!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Detalhes da Assinatura
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plano: Pro
Valor: R$ 99,00/mês
Próxima cobrança: [Data]
Método de pagamento: Cartão •••• [Last4]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Você agora tem acesso a:
✅ [Feature 1]
✅ [Feature 2]
✅ [Feature 3]

Gerencie sua assinatura em:
[Link para Billing Portal]

Precisa de ajuda? Responda este email.

Equipe Synnerdata
```

### Implementação no Webhook

```typescript
// No handler subscription.created
async handleSubscriptionCreated(data: PagarmeWebhookData) {
  const { organization_id, plan_id } = data.metadata;
  const customer = data.customer;

  // 1. Atualizar subscription no banco
  await db.update(orgSubscriptions).set({
    status: "active",
    pagarmeSubscriptionId: data.id,
    currentPeriodStart: new Date(data.current_period.start_at),
    currentPeriodEnd: new Date(data.current_period.end_at),
  }).where(eq(orgSubscriptions.organizationId, organization_id));

  // 2. Sincronizar dados do Customer → organization_profiles (apenas campos vazios)
  const profile = await OrganizationProfileService.getByOrgId(organization_id);
  await db.update(organizationProfiles).set({
    pagarmeCustomerId: customer.id,
    ...(profile.legalName ? {} : { legalName: customer.name }),
    ...(profile.taxId ? {} : { taxId: customer.document }),
    ...(profile.mobile ? {} : { mobile: customer.phones?.mobile_phone?.number }),
  }).where(eq(organizationProfiles.organizationId, organization_id));

  // 3. Buscar dados para o email
  const org = await OrganizationService.getById(organization_id);
  const plan = await PlanService.getById(plan_id);
  const owner = await MemberService.getOwner(organization_id);

  // 4. Enviar email de confirmação
  await EmailService.send({
    to: owner.email,
    template: "subscription-confirmed",
    data: {
      organizationName: org.name,
      planName: plan.displayName,
      planPrice: formatCurrency(plan.price),
      nextBillingDate: formatDate(data.current_period.end_at),
      cardLast4: data.card?.last_four_digits,
      billingPortalUrl: `${APP_URL}/billing`
    }
  });

  // 5. Emitir evento
  PaymentHooks.emit("subscription.activated", { organizationId: organization_id, planId: plan_id });
}
```

---

## Checkout em Nova Aba - Considerações

O checkout do Pagar.me abre em **nova aba do navegador**. Isso tem implicações:

### Comportamento Esperado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHECKOUT EM NOVA ABA                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Aba Original (App)              Nova Aba (Pagar.me)                         │
│  ─────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  [Upgrade] ─────────────────────> Abre checkout                              │
│       │                                │                                     │
│       │ (usuário permanece aqui        │ (usuário preenche cartão)           │
│       │  ou fecha a aba)               │                                     │
│       │                                │                                     │
│       │                          ┌─────┴─────┐                               │
│       │                          │  Pagou?   │                               │
│       │                          └─────┬─────┘                               │
│       │                                │                                     │
│       │                     ┌──── Sim ─┴─ Não ────┐                          │
│       │                     │                     │                          │
│       │                     ▼                     ▼                          │
│       │            Redirect success_url    Usuário fecha aba                 │
│       │            (nova aba)              (volta para aba original)         │
│       │                     │                     │                          │
│       │                     ▼                     │                          │
│       │            Dashboard com                  │                          │
│       │            ?upgraded=true                 │                          │
│       │                     │                     │                          │
│       └─────────────────────┴─────────────────────┘                          │
│                             │                                                │
│                    Webhook subscription.created                              │
│                    atualiza status no banco                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cancel URL - Não Necessário

Como o checkout abre em **nova aba**, não precisamos de `cancel_url`:
- Se o usuário abandona o checkout, ele simplesmente **fecha a aba**
- A aba original do app continua aberta
- Não há redirect de "cancelamento"

### Success URL - Comportamento

A `success_url` redireciona na **mesma aba** do checkout (a nova aba):
- Usuário completa pagamento → Redirect para `success_url`
- Frontend pode mostrar mensagem de sucesso ou redirecionar para dashboard

**Recomendação:** Usar `success_url` com query param para feedback visual:
```
https://app.synnerdata.com/billing?upgraded=true
```

---

## Trial Gratuito - Sem Proration

O trial é **100% gratuito**, portanto:
- Não há valor proporcional a calcular
- Upgrade durante trial = primeira cobrança imediata do valor cheio
- Dias restantes do trial são simplesmente "perdidos" (não há crédito)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UPGRADE DURANTE TRIAL                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Trial (14 dias, gratuito)                                                   │
│  ════════════════════════                                                    │
│  Dia 1 ─────────────────────────────────────────────────────> Dia 14         │
│            │                                                                 │
│            │ Upgrade no dia 5                                                │
│            ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Primeira cobrança: R$ 99,00 (valor cheio)                           │    │
│  │ Próxima cobrança: Dia 5 do próximo mês                              │    │
│  │ Dias restantes do trial: Ignorados (era gratuito mesmo)             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Downgrade de Plano (Escopo Futuro)

> ⚠️ **ESCOPO FUTURO** - Não será implementado na v1

### Comportamento Planejado

Quando implementarmos múltiplos planos (ex: Basic, Pro, Enterprise), o downgrade seguirá:

1. **Downgrade agendado para fim do período**
   - Cliente continua com acesso ao plano atual até o fim do ciclo
   - No próximo ciclo, muda automaticamente para o plano menor
   - Similar ao comportamento do GitHub e Zoom

2. **Sem reembolso proporcional**
   - Cliente já pagou pelo período atual
   - Mudança só afeta a próxima cobrança

3. **Fluxo esperado:**
```
Cliente solicita downgrade Pro → Basic
           │
           ▼
Agenda downgrade para fim do período (ex: 15/01)
           │
           ▼
Cliente mantém acesso Pro até 15/01
           │
           ▼
Em 15/01: Cobra R$ 49,00 (Basic) e aplica limites do Basic
```

### Considerações para Implementação Futura

- Verificar se Pagar.me suporta agendamento de mudança de plano
- Se não suportar, implementar via scheduler próprio
- Notificar cliente sobre a data efetiva do downgrade
- Alertar sobre features que serão perdidas

---

## Arquivos a Modificar/Criar

### 1. PagarmeClient - Adicionar métodos

**Arquivo:** `src/modules/payments/pagarme/client.ts`

```typescript
// Novos métodos necessários:
static async createPlan(data: CreatePlanRequest): Promise<PagarmePlan>
static async createPaymentLink(data: CreatePaymentLinkRequest): Promise<PagarmePaymentLink>
```

### 2. PlanService - Sincronização com Pagar.me

**Arquivo:** `src/modules/payments/plan/plan.service.ts`

```typescript
// Novo método:
static async syncToPagarme(planId: string): Promise<string> // retorna pagarmePlanId
```

### 3. CheckoutService - Criar Payment Link

**Arquivo:** `src/modules/payments/checkout/checkout.service.ts`

```typescript
// Modificar create() para usar payment_link type="subscription"
static async create(params: {
  organizationId: string;
  planId: string;
  successUrl: string;
}): Promise<{ url: string; paymentLinkId: string }>
```

### 4. WebhookService - Handlers de subscription

**Arquivo:** `src/modules/payments/webhook/webhook.service.ts`

```typescript
// Novos handlers:
-handleSubscriptionCreated() -
  handleChargePaid() -
  handleChargePaymentFailed() -
  handleSubscriptionCanceled();
```

### 5. Schema - Adicionar pagarmePlanId

**Arquivo:** `src/db/schema/payments.ts`

```typescript
// Adicionar campo na tabela subscriptionPlans:
pagarmePlanId: varchar("pagarme_plan_id", { length: 50 });
```

### 6. Teste E2E

**Arquivo:** `src/test/payments/upgrade-use-case.test.ts`

---

## Implementação Detalhada

### Fase 1: Sincronização de Planos

Antes de criar payment links, os planos precisam existir no Pagar.me.

```typescript
// POST /plans no Pagar.me
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
      "price": 9900  // R$ 99,00 em centavos
    }
  }]
}
```

**Implementação:**

1. `PagarmeClient.createPlan()` - Cria plano no Pagar.me
2. `PlanService.syncToPagarme()` - Sincroniza plano local → Pagar.me
3. Salva `pagarmePlanId` na tabela `subscriptionPlans`

### Fase 2: Endpoint de Checkout

```typescript
// POST /v1/payments/checkout
// Request:
{
  planId: "plan_pro",
  successUrl: "https://app.synnerdata.com/dashboard?upgraded=true"
}

// Response:
{
  paymentLinkId: "pl_xxx",
  url: "https://pagar.me/pl_xxx"
}
```

**Validações:**

1. Usuário autenticado
2. Email verificado (`user.emailVerified = true`)
3. Usuário é **owner** da organização
4. Plano válido e com `pagarmePlanId`
5. Status atual permite upgrade (`trialing`, `past_due`, `canceled` - não `active`)

**Nota:** Não é necessário validar perfil completo. O checkout do Pagar.me coleta os dados.

**Implementação:**

```typescript
// Tipo de resposta simplificado
type CheckoutResponse = {
  url: string;
  paymentLinkId: string;
};

static async create(params: {
  userId: string;
  organizationId: string;
  planId: string;
  successUrl: string;
}): Promise<CheckoutResponse> {
  // 1. Validar usuário
  const user = await UserService.getById(params.userId);
  if (!user.emailVerified) {
    throw new APIError("EMAIL_NOT_VERIFIED", "Email must be verified to upgrade");
  }

  // 2. Validar se é owner da organização
  const member = await MemberService.getByUserAndOrg(params.userId, params.organizationId);
  if (member.role !== "owner") {
    throw new APIError("FORBIDDEN", "Only organization owner can upgrade");
  }

  // 3. Validar status atual da subscription
  const subscription = await SubscriptionService.getByOrgId(params.organizationId);
  if (subscription?.status === "active") {
    throw new APIError("ALREADY_ACTIVE", "Organization already has an active subscription");
  }

  // 4. Validar plano e sincronizar se necessário
  const plan = await PlanService.getById(params.planId);
  if (!plan.pagarmePlanId) {
    await PlanService.syncToPagarme(plan.id);
  }

  // 5. Verificar se já temos customer_id para pré-preencher
  const profile = await OrganizationProfileService.getByOrgId(params.organizationId);

  // 6. Criar payment link
  // - Se tem pagarmeCustomerId: passa para pré-preencher dados
  // - Se não tem: checkout coleta os dados automaticamente
  const paymentLinkData: CreatePaymentLinkRequest = {
    type: "subscription",
    name: `Upgrade para ${plan.displayName}`,
    cart_settings: {
      recurrences: [{
        start_in: 1,
        plan_id: plan.pagarmePlanId
      }]
    },
    success_url: params.successUrl,
    metadata: {
      organization_id: params.organizationId,
      plan_id: plan.id
    }
  };

  // Adiciona customer_id apenas se já existir
  if (profile.pagarmeCustomerId) {
    paymentLinkData.customer_settings = {
      customer_id: profile.pagarmeCustomerId
    };
  }

  const paymentLink = await PagarmeClient.createPaymentLink(paymentLinkData);

  return {
    url: paymentLink.url,
    paymentLinkId: paymentLink.id
  };
}
```

### Fase 3: Webhook Handling

O Pagar.me envia webhooks quando eventos ocorrem:

```typescript
// subscription.created - Subscription criada após pagamento
async handleSubscriptionCreated(data: PagarmeWebhookData) {
  const { organization_id, plan_id } = data.metadata;

  await db.update(orgSubscriptions).set({
    status: "active",
    pagarmeSubscriptionId: data.id,
    currentPeriodStart: new Date(data.current_period.start_at),
    currentPeriodEnd: new Date(data.current_period.end_at),
  }).where(eq(orgSubscriptions.organizationId, organization_id));

  PaymentHooks.emit("subscription.activated", { ... });
}

// charge.paid - Cobrança recorrente bem-sucedida
async handleChargePaid(data: PagarmeWebhookData) {
  // Atualiza período se for renovação
  if (data.subscription_id) {
    await db.update(orgSubscriptions).set({
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: addMonths(new Date(), 1),
    }).where(eq(orgSubscriptions.pagarmeSubscriptionId, data.subscription_id));
  }
}

// charge.payment_failed - Falha no pagamento
async handleChargePaymentFailed(data: PagarmeWebhookData) {
  await db.update(orgSubscriptions).set({
    status: "past_due",
  }).where(eq(orgSubscriptions.pagarmeSubscriptionId, data.subscription_id));
}
```

---

## Decisões Tomadas

| Decisão                  | Escolha                          | Justificativa                                           |
| ------------------------ | -------------------------------- | ------------------------------------------------------- |
| **Quem pode upgrade**    | Apenas owner                     | Controle de acesso similar ao Better Auth + Stripe      |
| **Trial ativo**          | Permite upgrade                  | Usuário pode fazer upgrade antecipado                   |
| **Trial gratuito**       | Sem proration                    | Trial é gratuito, não há valor proporcional             |
| **past_due**             | Retry automático + grace period  | Manter cliente, Pagar.me gerencia retries               |
| **Coleta de dados**      | Checkout do Pagar.me             | Checkout coleta nome, email, documento, telefone        |
| **Documento**            | CPF ou CNPJ                      | Aceita ambos por enquanto, pode restringir depois       |
| **Sync de dados**        | Apenas campos vazios             | Não sobrescreve dados já preenchidos pelo usuário       |
| **Fluxo de pagamento**   | Payment Link type="subscription" | Pagar.me cria subscription automaticamente              |
| **Checkout**             | Abre em nova aba                 | Sem necessidade de cancel_url                           |
| **Billing Portal**       | Portal próprio + API Pagar.me    | Self-service para gerenciar subscription e invoices     |
| **Email pós-upgrade**    | Enviar no webhook                | Confirmação com detalhes da subscription                |
| **Downgrade**            | Escopo futuro                    | Será implementado quando houver múltiplos planos        |
| **Planos no Pagar.me**   | Criar via API + sync             | Necessário para payment links de subscription           |
| **Métodos de pagamento** | Apenas Cartão de Crédito         | Único que suporta recorrência automática                |
| **Billing day**          | Definido pelo Pagar.me           | Baseado no dia do primeiro pagamento                    |
| **Card storage**         | Gerenciado pelo Pagar.me         | Não armazenamos dados sensíveis                         |

---

## Ordem de Implementação Final

### Passo 1: Atualizar Schema

1. Adicionar `pagarmePlanId` na tabela `subscriptionPlans`
2. Rodar migration

### Passo 2: Atualizar PagarmeClient

1. Adicionar tipos para Plan, PaymentLink, Invoice, Subscription
2. Implementar `createPlan()`
3. Implementar `createPaymentLink()`
4. Implementar `getSubscription()`
5. Implementar `listInvoices()`
6. Implementar `cancelSubscription()`

### Passo 3: Implementar PlanService.syncToPagarme()

1. Cria plano no Pagar.me se não existe
2. Salva `pagarmePlanId` no banco

### Passo 4: Atualizar CheckoutService

1. Modificar `create()` para usar payment link tipo subscription
2. Garantir que plano está sincronizado antes de criar link

### Passo 5: Atualizar WebhookService

1. Adicionar handler `subscription.created` (+ envio de email)
2. Adicionar handler `charge.paid`
3. Adicionar handler `charge.payment_failed`
4. Adicionar handler `subscription.canceled`

### Passo 6: Implementar Billing Portal (API)

1. `GET /v1/billing/subscription` - Detalhes da subscription
2. `GET /v1/billing/invoices` - Histórico de cobranças
3. `POST /v1/billing/payment-method` - Link para atualizar cartão
4. `POST /v1/billing/cancel` - Cancelar subscription

### Passo 7: Implementar Email de Confirmação

1. Criar template `subscription-confirmed`
2. Integrar envio no handler `subscription.created`

### Passo 8: Criar Testes E2E

1. Criar `src/test/payments/upgrade-use-case.test.ts`
2. Mockar chamadas ao Pagar.me
3. Testar fluxo completo

---

## Arquivos Críticos

| Arquivo                                             | Ação      | Descrição                                          |
| --------------------------------------------------- | --------- | -------------------------------------------------- |
| `src/db/schema/payments.ts`                         | Modificar | Adicionar `pagarmePlanId`                          |
| `src/modules/payments/pagarme/client.ts`            | Modificar | Métodos para Plan, PaymentLink, Invoice, Subscription |
| `src/modules/payments/pagarme/pagarme.types.ts`     | Modificar | Tipos para Plan, PaymentLink, Invoice              |
| `src/modules/payments/plan/plan.service.ts`         | Modificar | `syncToPagarme()`                                  |
| `src/modules/payments/checkout/checkout.service.ts` | Modificar | Usar payment link subscription                     |
| `src/modules/payments/webhook/webhook.service.ts`   | Modificar | Handlers de subscription + email                   |
| `src/modules/payments/billing/billing.service.ts`   | Criar     | Billing Portal (subscription, invoices, cancel)    |
| `src/modules/payments/billing/billing.routes.ts`    | Criar     | Rotas do Billing Portal                            |
| `src/lib/email-templates/subscription-confirmed.ts` | Criar     | Template de email pós-upgrade                      |
| `src/test/payments/upgrade-use-case.test.ts`        | Criar     | Testes E2E                                         |

---

## API Pagar.me - Endpoints Necessários

```typescript
// 1. Criar Plano
POST /plans
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
    "pricing_scheme": { "price": 9900 }
  }]
}

// 2. Criar Payment Link (subscription)
POST /payment_links
{
  "type": "subscription",
  "name": "Upgrade para Pro",
  "customer_settings": { "customer_id": "cus_xxx" },
  "cart_settings": {
    "recurrences": [{ "start_in": 1, "plan_id": "plan_xxx" }]
  },
  "success_url": "https://...",
  "metadata": { "organization_id": "org_xxx" }
}
```

---

## Estrutura do Teste E2E

```typescript
// src/test/payments/upgrade-use-case.test.ts

describe("Upgrade Use Case: Trial → Paid", () => {
  describe("Setup: Criar usuário owner com trial", () => {
    test("should create user via OTP sign-in");
    test("should create organization with trial");
  });

  describe("Fase 1: Validações de Acesso", () => {
    test("should deny checkout without verified email");
    test("should deny checkout if user is not owner");
    test("should deny checkout if already has active subscription");
    test("should allow checkout with trialing status (even if not expired)");
    test("should allow checkout without organization profile filled");
  });

  describe("Fase 2: Sincronização de Plano", () => {
    test("should sync plan to Pagarme");
    test("should save pagarmePlanId");
  });

  describe("Fase 3: Criar Checkout", () => {
    test("should create payment link WITHOUT customer_id (first time)");
    test("should create payment link WITH customer_id (if exists)");
    test("should return payment URL");
  });

  describe("Fase 4: Simular Webhook subscription.created", () => {
    test("should validate webhook signature");
    test("should update subscription status to active");
    test("should set pagarmeSubscriptionId");
    test("should set current period dates");
    test("should save pagarmeCustomerId from webhook");
    test("should update empty profile fields from customer data");
    test("should NOT overwrite existing profile fields");
    test("should send confirmation email to owner");
  });

  describe("Fase 5: Verificar Acesso", () => {
    test("should allow access after upgrade");
    test("checkAccess should return status active");
  });

  describe("Fase 6: Billing Portal", () => {
    test("should return subscription details");
    test("should return payment method info");
    test("should list invoices");
    test("should allow only owner to access billing");
  });

  describe("Fase 7: Simular Renovação (charge.paid)", () => {
    test("should update period on charge.paid webhook");
    test("should maintain active status");
    test("should add new invoice to history");
  });

  describe("Fase 8: Simular Falha e Retry (charge.payment_failed)", () => {
    test("should set status to past_due on payment failure");
    test("should maintain access during grace period");
    test("should return to active on successful retry (charge.paid)");
  });

  describe("Fase 9: Cancelamento via Billing Portal", () => {
    test("should schedule cancellation for end of period");
    test("should maintain access until period end");
    test("should set status to canceled after subscription.canceled webhook");
    test("should deny access after cancellation");
  });
});
```
