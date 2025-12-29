# Hierarquia do Módulo de Pagamentos

Este documento descreve a estrutura, hierarquia de dependências e relacionamentos do módulo `@src/modules/payments/`.

## Visao Geral

O módulo de pagamentos gerencia todo o ciclo de vida de assinaturas, desde o trial até cancelamento, integrando com a API do Pagarme.

## Entidades (Schema)

| Tabela | Descricao |
|--------|-----------|
| `subscription_plans` | Planos de assinatura (Trial, Ouro, Diamante, Platina) com features |
| `plan_pricing_tiers` | Tiers de preco por faixa de funcionarios (10 faixas: 0-10 ate 91-180) |
| `org_subscriptions` | Assinaturas das organizacoes (status, periodo, ciclo de cobranca) |
| `subscription_events` | Log de eventos de webhook do Pagarme |
| `pending_checkouts` | Checkouts pendentes aguardando pagamento |

## Submodulos

| Modulo | Responsabilidade |
|--------|------------------|
| **plans/** | CRUD de planos, criacao lazy de planos no Pagarme, validacao de tiers |
| **pricing/** | Busca de tier por quantidade de funcionarios, validacao de limites |
| **subscription/** | Gerenciamento de assinaturas (criar trial, ativar, cancelar, restaurar, verificar acesso) |
| **checkout/** | Criacao de payment links no Pagarme para novas assinaturas |
| **billing/** | Listagem de invoices, atualizacao de cartao e dados de billing, uso do plano |
| **plan-change/** | Mudanca de plano/ciclo (upgrade com proration, downgrade agendado) |
| **limits/** | Verificacao de features e limites de funcionarios por plano |
| **customer/** | Criacao/consulta de customers no Pagarme |
| **webhook/** | Processamento de webhooks do Pagarme (charge.paid, subscription.created, etc.) |
| **jobs/** | Jobs assincronos (expirar trials, notificar, cancelar, suspender grace period) |
| **pagarme/** | Cliente HTTP para API do Pagarme |
| **hooks/** | Event emitter interno para eventos de pagamento |

## Hierarquia de Dependencias

```
                           ┌─────────────────────────────────────┐
                           │          NIVEL 5 - JOBS             │
                           │  (Processamento Assincrono)         │
                           │                                     │
                           │            jobs/                    │
                           │   ├─ expireTrials()                 │
                           │   ├─ notifyExpiringTrials()         │
                           │   ├─ processScheduledCancellations()│
                           │   ├─ suspendExpiredGracePeriods()   │
                           │   └─ processScheduledPlanChanges()  │
                           └──────────────┬──────────────────────┘
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        │                                 │                                 │
        ▼                                 ▼                                 ▼
┌───────────────────┐         ┌───────────────────┐         ┌───────────────────┐
│   NIVEL 4         │         │   NIVEL 4         │         │   NIVEL 4         │
│   webhook/        │         │   plan-change/    │         │   checkout/       │
│  (Integracoes)    │         │  (Orquestracao)   │         │  (Orquestracao)   │
│                   │         │                   │         │                   │
│ • process()       │         │ • changePlan()    │         │ • create()        │
│ • handleCharge*   │         │ • changeBilling() │         │                   │
│ • handleSub*      │         │ • changeSubscr()  │         │                   │
└────────┬──────────┘         └────────┬──────────┘         └────────┬──────────┘
         │                             │                             │
         │                     ┌───────┴───────┐                     │
         │                     │               │                     │
         ▼                     ▼               ▼                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           NIVEL 3 - SERVICOS DE APLICACAO                     │
├───────────────────────────────────────────┬───────────────────────────────────┤
│              limits/                      │              billing/             │
│   (Verificacao de Acesso)                 │   (Faturamento)                   │
│                                           │                                   │
│   • requireFeature()                      │   • listInvoices()                │
│   • checkFeature()                        │   • getInvoiceDownloadUrl()       │
│   • checkEmployeeLimit()                  │   • updateCard()                  │
│   • getCapabilities()                     │   • getUsage()                    │
│   • requireEmployeeLimit()                │   • updateBillingInfo()           │
└───────────────────────────────────────────┴───────────────────────────────────┘
                           │                             │
                           ▼                             ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         NIVEL 2 - SERVICOS DE DOMINIO                         │
├───────────────────────────────────────────┬───────────────────────────────────┤
│           subscription/                   │             pricing/              │
│   (Gerenciamento de Assinaturas)          │   (Calculo de Precos)             │
│                                           │                                   │
│   • createTrial()                         │   • getTierForEmployeeCount()     │
│   • activate()                            │   • validateEmployeeCount()       │
│   • cancel() / restore()                  │   • ensurePagarmePlan()           │
│   • checkAccess()                         │   • getTierForCheckout()          │
│   • markPastDue() / expireTrial()         │                                   │
└───────────────────────────────────────────┴───────────────────────────────────┘
                           │                             │
                           ▼                             ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         NIVEL 1 - CORE (Entidades Base)                       │
├───────────────────────────────────────────┬───────────────────────────────────┤
│               plans/                      │            customer/              │
│   (Gerenciamento de Planos)               │   (Gerenciamento de Clientes)     │
│                                           │                                   │
│   • list() / listAll()                    │   • getOrCreateForCheckout()      │
│   • getById() / getTrialPlan()            │   • create()                      │
│   • create() / update() / delete()        │   • getCustomerId()               │
│   • getTierForEmployeeCount()             │   • list()                        │
│   • ensurePagarmePlan()                   │                                   │
└───────────────────────────────────────────┴───────────────────────────────────┘
                           │                             │
                           ▼                             ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                       NIVEL 0 - INFRAESTRUTURA                                │
├─────────────────────┬─────────────────────┬───────────────────────────────────┤
│     pagarme/        │       hooks/        │           errors.ts               │
│  (Cliente HTTP)     │  (Event Emitter)    │       (Classes de Erro)           │
│                     │                     │                                   │
│  • createCustomer() │  • on() / off()     │   • PaymentError                  │
│  • createPlan()     │  • emit()           │   • CheckoutError                 │
│  • createPayment*() │                     │   • SubscriptionError             │
│  • getInvoices()    │                     │   • PlanError, etc.               │
│  • cancelSub*()     │                     │                                   │
└─────────────────────┴─────────────────────┴───────────────────────────────────┘
```

## Matriz de Dependencias

| Modulo | Depende de |
|--------|------------|
| **pagarme/** | `errors` |
| **hooks/** | (nenhum interno) |
| **errors.ts** | (nenhum interno) |
| **plans/** | `pagarme`, `errors` |
| **customer/** | `pagarme`, `errors`, `organizations` (externo) |
| **pricing/** | `pagarme`, `plans.constants`, `errors` |
| **subscription/** | `hooks`, `errors`, `plans.model` (tipos) |
| **limits/** | `subscription` (import dinamico), `plans.constants`, `errors` |
| **billing/** | `pagarme`, `plans.constants`, `errors` |
| **checkout/** | `pagarme`, `plans`, `subscription`, `customer`, `errors` |
| **plan-change/** | `pagarme`, `plans`, `customer`, `limits`, `hooks`, `errors` |
| **webhook/** | `subscription` (import dinamico), `hooks`, `errors` |
| **jobs/** | `pagarme`, `plan-change`, `hooks` |

## Entidades e Relacionamentos

```
┌─────────────────────────┐
│   subscription_plans    │──────────┐
│   (Planos)              │          │
├─────────────────────────┤          │
│ • id                    │          │
│ • name / displayName    │          │ 1
│ • limits: { features }  │          │
│ • isTrial, isActive     │          ▼
│ • trialDays, sortOrder  │    ┌─────────────────────────┐
└─────────────────────────┘    │   plan_pricing_tiers    │
                               │   (Faixas de Preco)     │
                               ├─────────────────────────┤
                               │ • planId (FK)           │
                               │ • minEmployees          │
                               │ • maxEmployees          │
           N                   │ • priceMonthly/Yearly   │
┌──────────────────────────────│ • pagarmePlanId*        │
│                              └─────────────────────────┘
│                                         │
▼                                         │ 1
┌─────────────────────────┐               │
│    org_subscriptions    │◄──────────────┘
│   (Assinaturas)         │
├─────────────────────────┤
│ • organizationId (FK)   │───────────▶ organizations (externo)
│ • planId (FK)           │
│ • pricingTierId (FK)    │
│ • status (enum)         │
│ • billingCycle          │
│ • trial* / current*     │
│ • pending* (downgrade)  │          1
│ • pagarme*Id            │          │
└─────────────────────────┘          │
           │                         │
           │ 1                       ▼
           │              ┌─────────────────────────┐
           │              │   pending_checkouts     │
           │              │   (Checkouts Pendentes) │
           │              ├─────────────────────────┤
           │              │ • organizationId (FK)   │
           │              │ • planId (FK)           │
           │              │ • pricingTierId (FK)    │
           │              │ • paymentLinkId         │
           │              │ • status, expiresAt     │
           ▼              └─────────────────────────┘
┌─────────────────────────┐
│  subscription_events    │
│  (Log de Webhooks)      │
├─────────────────────────┤
│ • subscriptionId (FK)   │
│ • eventType             │
│ • pagarmeEventId        │
│ • payload (jsonb)       │
│ • processedAt, error    │
└─────────────────────────┘
```

## Fluxos Principais

### 1. Trial
Organizacao criada recebe 14 dias no plano Trial (ate 10 funcionarios)

### 2. Checkout
Usuario escolhe plano/tier/ciclo → Payment Link → Webhook ativa assinatura

### 3. Upgrade
Calculo de proration → Novo Payment Link → Ativacao imediata

### 4. Downgrade
Agendado para fim do periodo atual

### 5. Cancelamento
Soft cancel (mantem acesso ate fim do periodo) ou hard cancel via webhook

### 6. Grace Period
15 dias para regularizar pagamento falho antes de suspensao

## Constantes Importantes

- **10 Tiers de funcionarios**: 0-10, 11-20, 21-30, ..., 91-180
- **Trial**: 14 dias, ate 10 funcionarios
- **Desconto anual**: 20%
- **Grace period**: 15 dias

## Observacoes para Refatoracao

1. **Duplicacao em `plans/` e `pricing/`**: Ambos tem `ensurePagarmePlan()` e `getTierForEmployeeCount()`. O `pricing/` parece redundante.

2. **Import dinamico em `limits/` e `webhook/`**: Usam `await import()` para evitar dependencia circular com `subscription/`.

3. **`plans/` faz muito**: Gerencia planos E tiers E criacao de planos no Pagarme.

4. **`plan-change/` e o mais complexo**: Depende de quase todos os outros modulos.
