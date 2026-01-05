# Modulo de Pagamentos

> **Proposito**: Contextualizar agentes de IA e desenvolvedores sobre a arquitetura do modulo `@src/modules/payments/`.
> - **ONDE** encontrar codigo (estrutura de arquivos)
> - **COMO** seguir os padroes estabelecidos (arquitetura)
> - **O QUE** cada submodulo faz (responsabilidades)
> - **POR QUE** decisoes de design foram tomadas (observacoes)

## Visao Geral

O modulo gerencia o ciclo de vida de assinaturas (trial → checkout → upgrade/downgrade → cancelamento), integrando com a API do Pagarme.

## Entidades (Schema)

| Tabela | Descricao |
|--------|-----------|
| `subscription_plans` | Planos (Trial, Ouro, Diamante, Platina) com features e limites |
| `plan_pricing_tiers` | 10 faixas de preco por quantidade de funcionarios (0-10 ate 91-180) |
| `billing_profiles` | Dados de cobranca (legalName, taxId, email, endereco, pagarmeCustomerId) |
| `org_subscriptions` | Assinaturas das organizacoes (status, periodo, ciclo) |
| `subscription_events` | Log de webhooks do Pagarme (idempotencia) |
| `pending_checkouts` | Checkouts aguardando pagamento |

## Submodulos

| Modulo | Responsabilidade |
|--------|------------------|
| **plans/** | CRUD de planos, criacao lazy no Pagarme, validacao de tiers |
| **billing/** | CRUD de perfil de cobranca, invoices, cartao, uso |
| **subscription/** | Gerenciamento de assinaturas (Facade com 3 servicos internos) |
| **checkout/** | Criacao de payment links no Pagarme |
| **plan-change/** | Mudanca de plano/ciclo (upgrade imediato, downgrade agendado) |
| **limits/** | Verificacao de features e limites (com cache interno) |
| **customer/** | Criacao/consulta de customers no Pagarme |
| **webhook/** | Processamento de webhooks (charge.paid, subscription.created, etc.) |
| **jobs/** | Jobs assincronos (expirar trials, processar cancelamentos) |
| **pagarme/** | Cliente HTTP para API do Pagarme |
| **hooks/** | Event emitter para eventos de pagamento |

### Estrutura de Arquivos

```text
plans/
├─ index.ts              # Controller
├─ plans.service.ts      # Servico
├─ plans.model.ts        # Schemas Zod
└─ plans.constants.ts    # EMPLOYEE_TIERS, PLAN_FEATURES

billing/
├─ index.ts
├─ billing.service.ts
└─ billing.model.ts

subscription/            # Padrao Facade
├─ index.ts
├─ subscription.service.ts        # Facade principal
├─ subscription-query.service.ts  # Leitura
├─ subscription-access.service.ts # Verificacao de acesso
├─ subscription-mutation.service.ts # Escrita
├─ subscription.helpers.ts
└─ subscription.model.ts

checkout/
├─ index.ts
├─ checkout.service.ts
└─ checkout.model.ts

plan-change/
├─ index.ts
├─ plan-change.service.ts    # Orquestracao
├─ plan-change.helpers.ts    # Queries reutilizaveis
├─ proration.service.ts      # Calculos de proration
└─ plan-change.model.ts

limits/
├─ limits.service.ts    # Com planDisplayNamesCache
└─ limits.model.ts

customer/
├─ index.ts
├─ customer.service.ts
└─ customer.model.ts

webhook/
├─ index.ts             # Sem auth (validacao por Basic Auth)
├─ webhook.service.ts
└─ webhook.model.ts

jobs/
├─ index.ts             # Requer X-Api-Key
├─ jobs.service.ts
└─ jobs.model.ts

pagarme/
├─ client.ts            # PagarmeClient (static)
├─ pagarme-plan.service.ts
└─ pagarme.types.ts

hooks/
├─ index.ts             # PaymentHooks singleton
├─ hooks.types.ts       # Tipos de eventos
└─ listeners.ts         # Handlers (emails)
```

## Dependencias entre Modulos

| Modulo | Depende de |
|--------|------------|
| **pagarme/** | `errors` |
| **hooks/** | (nenhum interno) |
| **plans/** | `errors` |
| **billing/** | `pagarme`, `subscription`, `errors` |
| **customer/** | `pagarme`, `billing`, `errors` |
| **subscription/** | `hooks`, `limits`, `errors` |
| **limits/** | `subscription`, `plans.constants`, `errors` |
| **checkout/** | `pagarme`, `plans`, `subscription`, `customer`, `errors` |
| **plan-change/** | `pagarme`, `plans`, `customer`, `limits`, `subscription`, `hooks`, `errors` |
| **webhook/** | `subscription`, `hooks`, `errors` |
| **jobs/** | `subscription`, `plan-change`, `hooks` |

**Ordem de dependencia principal**: `checkout/` → `customer/` → `billing/`

## Eventos (hooks/)

| Categoria | Eventos |
|-----------|---------|
| **trial** | `started`, `expiring`, `expired` |
| **subscription** | `activated`, `cancelScheduled`, `restored`, `canceled`, `renewed`, `updated` |
| **charge** | `paid`, `failed`, `refunded` |
| **planChange** | `scheduled`, `executed`, `canceled` |

Uso: `PaymentHooks.emit("subscription.activated", { subscription })` - listeners enviam emails automaticamente.

## Constantes Importantes

```typescript
// Timing
DEFAULT_TRIAL_DAYS = 14
DEFAULT_TRIAL_EMPLOYEE_LIMIT = 10
GRACE_PERIOD_DAYS = 15
CHECKOUT_EXPIRATION_HOURS = 24

// Pricing
YEARLY_DISCOUNT = 0.2  // 20%
MAX_EMPLOYEES = 180
MIN_PRORATION_AMOUNT = 100  // R$ 1.00

// Tiers (10 faixas fixas para planos pagos, 1 para trial)
EMPLOYEE_TIERS = [
  { min: 0, max: 10 },   // Trial usa apenas este
  { min: 11, max: 20 },
  { min: 21, max: 30 },
  // ... ate
  { min: 91, max: 180 },
]

// Pagarme
REQUEST_TIMEOUT_MS = 30_000
PAGARME_RETRY_READ = { maxAttempts: 3, delayMs: 500 }
PAGARME_RETRY_WRITE = { maxAttempts: 3, delayMs: 1000 }
```

## Classes de Erro (errors.ts)

| Categoria | Classes principais |
|-----------|-------------------|
| **Base** | `PaymentError` |
| **Checkout** | `CheckoutError`, `EmailNotVerifiedError`, `MissingBillingDataError` |
| **Subscription** | `SubscriptionNotFoundError`, `SubscriptionNotActiveError`, `SubscriptionNotCancelableError` |
| **Trial** | `TrialAlreadyUsedError`, `TrialExpiredError`, `TrialPlanNotFoundError` |
| **Plan** | `PlanNotFoundError`, `PlanNotAvailableError`, `PlanHasActiveSubscriptionsError` |
| **Billing** | `BillingProfileNotFoundError`, `BillingProfileAlreadyExistsError` |
| **Limits** | `FeatureNotAvailableError`, `EmployeeLimitReachedError` |
| **Plan Change** | `SamePlanError`, `NoChangeRequestedError`, `EmployeeCountExceedsNewPlanLimitError` |
| **Pagarme** | `PagarmeApiError`, `PagarmeTimeoutError`, `WebhookValidationError` |

## Padroes Arquiteturais

### 1. Servicos Estaticos
Todos os services sao `abstract class` com metodos `static` - sem estado, sem instanciacao:
```typescript
export abstract class BillingService {
  static async getProfile(organizationId: string) { ... }
}
```

### 2. Padrao Facade (subscription/)
`SubscriptionService` delega para 3 servicos especializados:
- `SubscriptionQueryService` - leitura
- `SubscriptionAccessService` - verificacao de acesso
- `SubscriptionMutationService` - escrita

### 3. Helpers de Query
Arquivos `*.helpers.ts` centralizam queries complexas reutilizaveis com tipagem explicita.

### 4. Sistema de Eventos Tipado
`PaymentHooks` usa EventEmitter com tipos TypeScript para type-safety completo.

### 5. Idempotencia
- Webhooks: verifica `pagarmeEventId` duplicado
- Pagarme: usa `idempotencyKey` em operacoes de escrita

### 6. Validacao com Zod
Schemas definem request/response com type inference automatica.

## Observacoes Importantes

1. **billing_profiles vs organization_profiles**: `billing_profiles` = quem PAGA, `organization_profiles` = quem USA. Podem ser diferentes.

2. **Customer criado no checkout**: O customer no Pagarme e criado apenas quando o usuario inicia o checkout, evitando customers orfaos.

3. **Sync com Pagarme**: `updateProfile()` sincroniza automaticamente quando `pagarmeCustomerId` existe.

4. **Upgrade vs Downgrade**:
   - Upgrade: proration calculado → payment link → ativacao imediata
   - Downgrade: agendado para fim do periodo atual

5. **Grace Period**: 15 dias de `past_due` antes de suspensao (`canceled`).

6. **Cache em LimitsService**: `planDisplayNamesCache` evita N+1 queries. Use `clearPlanDisplayNamesCache()` em testes.

7. **ProrationService separado**: Calculos de proration isolados em `plan-change/proration.service.ts`.

## Consumidores Externos

Dominios fora de `payments/` que consomem este modulo:

| Arquivo | Servico | Metodo | Proposito |
|---------|---------|--------|-----------|
| `src/lib/auth.ts` | `SubscriptionService` | `createTrial()` | Criar trial no signup |
| `src/lib/auth-plugin.ts` | `SubscriptionService` | `checkAccess()` | Verificar acesso em rotas protegidas |
| `src/lib/auth-plugin.ts` | `LimitsService` | `checkFeature()`, `requireFeature()` | Verificar features/limites |
| `src/lib/cron-plugin.ts` | `JobsService` | `expireTrials()`, etc. | Executar jobs agendados |
| `src/db/seeds/plans.ts` | `plans.constants` | `EMPLOYEE_TIERS`, `PLAN_FEATURES` | Seed de planos |

**Impacto de mudancas**: Alteracoes em `SubscriptionService`, `LimitsService` ou `JobsService` podem afetar autenticacao e jobs do sistema.
