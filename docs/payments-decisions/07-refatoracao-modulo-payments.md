# Decisoes e Padroes do Modulo de Pagamentos

> **Proposito**: Documentar decisoes de design, padroes de codigo e licoes aprendidas do modulo `@src/modules/payments/`.
>
> Para estrutura e arquitetura, veja [payments-module-hierarchy.md](../payments-module-hierarchy.md).

## Invariantes do Dominio

- Organizacao SEMPRE possui uma assinatura (minimo: plano trial)
- **Trial e um PLANO, nao um status** - assinatura no plano trial tem status `active` como qualquer outra
- `billing-profile` representa QUEM PAGA (pode ser diferente de quem usa)
- Customer no Pagarme e criado apenas no primeiro checkout (evita orfaos)
- Assinatura ativa requer `billing-profile` completo e validado

## Restricoes Criticas

- Nunca cobrar sem `billing-profile` completo
- Nunca remover acesso sem notificacao previa
- Nunca permitir downgrade que viole limite atual de funcionarios
- Webhooks devem ser idempotentes (mesmo evento processado N vezes = mesmo resultado)

## Padroes de Codigo

### 1. Classes Abstratas com Metodos Estaticos

Services que nao dependem do contexto de request usam este padrao:

```typescript
export abstract class SubscriptionService {
  static async getByOrganizationId(orgId: string) { ... }
  static async cancel(orgId: string) { ... }
}
```

**Beneficios**: Nao requer instanciacao, melhor tree-shaking, testavel com mocks simples.

**Excecao**: Services que precisam do contexto de request devem ser injetados via `decorate()` do Elysia.

### 2. Retry Config Centralizado

Chamadas ao Pagarme usam configuracao em `pagarme/client.ts`:

```typescript
export const PAGARME_RETRY_CONFIG = {
  READ: { maxAttempts: 3, delayMs: 500 },
  WRITE: { maxAttempts: 3, delayMs: 1000 },
} as const;

// Uso
await Retry.withRetry(() => PagarmeClient.getSubscription(id), PAGARME_RETRY_CONFIG.READ);
```

**Regra**: Toda chamada ao Pagarme DEVE usar `Retry.withRetry()` com a config apropriada (`READ` ou `WRITE`).

### 3. Transacoes para Operacoes Criticas

Operacoes que envolvem multiplas escritas ou leitura-escrita devem usar transacoes:

```typescript
// ✅ Correto - transacao para atomicidade
const result = await db.transaction(async (tx) => {
  // 1. Ler estado atual dentro da transacao
  const [current] = await tx.select().from(table).where(...);

  // 2. Validar estado (pode ter mudado entre leitura inicial e agora)
  if (current.status !== "active") {
    throw new InvalidStateError();
  }

  // 3. Atualizar dentro da transacao
  const [updated] = await tx.update(table).set({...}).where(...).returning();

  return updated;
});

// 4. Emitir eventos FORA da transacao
PaymentHooks.emit("event", { data });
```

**Regras**:
- Chamadas externas (Pagarme, email) ficam FORA da transacao
- Re-validar estado dentro da transacao antes de escrever
- Emitir eventos somente apos commit bem-sucedido

### 4. COALESCE para Updates Atomicos

Quando multiplos processos podem atualizar o mesmo campo, usar COALESCE para preservar o primeiro valor:

```typescript
// ✅ Atomico - primeiro write vence, subsequentes preservam
await db
  .update(schema.orgSubscriptions)
  .set({
    status: "past_due",
    pastDueSince: sql`COALESCE(${schema.orgSubscriptions.pastDueSince}, ${now})`,
    gracePeriodEnds: sql`COALESCE(${schema.orgSubscriptions.gracePeriodEnds}, ${gracePeriodEnds})`,
  })
  .where(eq(schema.orgSubscriptions.organizationId, organizationId));
```

**Caso de uso**: `markPastDue()` - webhooks concorrentes nao resetam o periodo de graca.

### 5. Idempotencia em Webhooks

Webhooks podem ser reenviados. Sempre verificar estado antes de processar:

```typescript
// ✅ Idempotente - verifica se ja foi processado
static async activate(input: { pagarmeSubscriptionId: string; ... }) {
  const subscription = await findByOrganizationId(organizationId);

  // Skip se ja ativo com mesmo ID
  if (
    subscription.status === "active" &&
    subscription.pagarmeSubscriptionId === pagarmeSubscriptionId
  ) {
    return subscription; // Retorna sem emitir eventos duplicados
  }

  // Processar normalmente...
}
```

### 6. Imports Dinamicos para Logger

O linter (Ultracite/Biome) remove imports nao utilizados no fluxo principal. Para logging em catch blocks ou edge cases, usar import dinamico:

```typescript
// ✅ Correto - import dinamico no ponto de uso
static async expireTrial(subscriptionId: string): Promise<void> {
  const result = await findByIdWithPlan(subscriptionId);

  if (!result) {
    const { logger } = await import("@/lib/logger");
    logger.warn({
      type: "expire-trial:subscription-not-found",
      subscriptionId,
    });
    return;
  }
  // ...
}
```

**Por que**: Import estatico de `logger` seria removido pelo linter se usado apenas em branches de erro.

### 7. Guard de Double-Registration para Listeners

EventEmitter adiciona novo listener a cada chamada de `.on()`. Usar guard para evitar duplicacao em testes:

```typescript
// hooks/listeners.ts
let listenersRegistered = false;

export function registerPaymentListeners() {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  PaymentHooks.on("trial.expiring", async (payload) => { ... });
  // ...
}
```

### 8. Proibido: Re-exports

Importar diretamente do modulo de origem:

```typescript
// ❌ Errado
import { SomeService } from "@/modules/payments/some-module";

// ✅ Correto
import { SomeService } from "@/modules/payments/some-module/some.service";
```

**Excecao**: O `payments/index.ts` pode re-exportar para API publica do modulo.

### 9. Erros Centralizados em `errors.ts`

Todos os erros do modulo ficam em `payments/errors.ts`, organizados por secao:

```typescript
// ============================================================
// SUBSCRIPTION
// ============================================================
export class SubscriptionNotFoundError extends PaymentError { ... }
export class SubscriptionNotActiveError extends PaymentError { ... }

// ============================================================
// PLAN CHANGE
// ============================================================
export class PlanChangeInProgressError extends PaymentError { ... }
```

## Decisoes de Design

### Trial como Plano

- Status no DB: `active`, `past_due`, `canceled`, `expired`
- Trial e determinado por `plan.isTrial`, nao pelo status
- `checkAccess()` retorna estados computados (`trial`, `trial_expired`) derivados de `plan.isTrial` + datas

### Lazy Creation no Pagarme

- Planos sao criados no Pagarme quando um tier e usado pela primeira vez
- Cada tier tem `pagarmePlanIdMonthly` e `pagarmePlanIdYearly` (criados lazy)
- Customer criado apenas no primeiro checkout

### Sistema de Eventos

- Usa `EventEmitter` nativo do Node/Bun com tipagem TypeScript
- Listeners registrados em `registerPaymentListeners()` chamado no `.listen()` de `src/index.ts`
- `listeners.ts` contem logica de aplicacao (queries + emails)

#### Fire-and-forget (decisao consciente)

O `emit()` retorna imediatamente sem aguardar handlers:
- Response HTTP vai pro cliente antes do email ser enviado
- Se o processo morrer, evento se perde

**Por que e aceitavel**:
- Emails nao sao criticos para o fluxo principal
- Falhas sao logadas para debugging

**Quando reconsiderar**: Se emails se tornarem obrigatorios (compliance, recibos fiscais).

### Facade Pattern (subscription/)

- `SubscriptionService` re-exporta metodos de 3 services internos:
  - `SubscriptionQueryService` - leitura
  - `SubscriptionAccessService` - verificacao de acesso
  - `SubscriptionMutationService` - escrita
- Consumidores usam apenas `SubscriptionService` (API estavel)

### Webhook Handlers

Todos delegam para `SubscriptionService`:

| Handler | Metodo |
|---------|--------|
| `handleChargePaid` | `markActive()` |
| `handleChargeFailed` | `markPastDue()` |
| `handleChargeRefunded` | `cancelByRefund()` |
| `handleSubscriptionCanceled` | `cancelByWebhook()` |
| `handleSubscriptionCreated` | `activate()` |

## Comportamentos Intencionais

### `activate()` Silencioso

Faz UPDATE em 0 linhas e retorna `null` sem erro quando subscription nao existe.

**Por que**: Webhook pode chegar antes da subscription existir em edge cases.

### `expireTrial()` com Logging

Retorna sem expirar se subscription nao existe ou plano nao e trial, mas loga o motivo:
- `expire-trial:subscription-not-found` - subscription foi deletada
- `expire-trial:not-trial-plan` - usuario fez upgrade entre agendamento e execucao do job

---

## Revisao de Modulos (em andamento)

### Proposito

Revisar sistematicamente cada submodulo de `@src/modules/payments/` para garantir:

1. **Conformidade com padroes** - Codigo segue `module-code-standards.md`
2. **Cobertura de testes** - Cada metodo/endpoint tem testes que validam seu comportamento
3. **Qualidade do codigo** - Auto-explicativo, sem duplicacao ou complexidade desnecessaria

**Foco principal**: Garantir que a implementacao existente esta coberta por testes. Para cada service/controller:
- Listar todos os metodos/endpoints
- Verificar se existem testes para cada um
- Criar testes faltantes seguindo `testing-standards.md`

### Criterios de Revisao

**Padroes de codigo**: Ver [module-code-standards.md](../code-standards/module-code-standards.md)

**Padroes de teste**: Ver [testing-standards.md](../code-standards/testing-standards.md)

**Checklist por modulo**:
- [ ] Codigo segue padroes de `module-code-standards.md`
- [ ] Testes seguem padroes de `testing-standards.md`
- [ ] Cobertura: auth (401), permissoes (403), validacao (400/422), happy path (200), erros (500)

### Progresso

| Modulo | Status | Observacoes |
|--------|--------|-------------|
| **plans/** | ✅ Revisado | 54 testes, adicionado list-all-plans.test.ts |
| **billing/** | ✅ Revisado | 77 testes, 8 arquivos migrados para factories |
| **subscription/** | ✅ Revisado | 91 testes, 5 arquivos migrados para factories |
| **checkout/** | ✅ Revisado | 23 testes (15 unit + 8 integration), migrado para factories |
| **plan-change/** | ✅ Revisado | 36 testes, 2 arquivos migrados para factories |
| **limits/** | ✅ Revisado | 31 testes, 1 arquivo migrado para factories |
| **customer/** | ✅ Revisado | 12 testes (11 skip integration), 2 arquivos migrados para factories |
| **webhook/** | ✅ Revisado | 47 testes, 2 arquivos migrados para factories + WebhookPayloadBuilder |
| **jobs/** | ✅ Revisado | 37 testes, 2 arquivos migrados para factories |
| **pagarme/** | ✅ Revisado | 10 testes (6 unit + 4 integration skip), 1 arquivo migrado para factories |
| **hooks/** | ✅ Revisado | 23 testes (14 hooks.test + 9 listeners.test), 1 arquivo migrado para factories |

**Legenda**: ⬜ Pendente | 🔄 Em revisao | ✅ Revisado | ⚠️ Requer atencao

### Infraestrutura de Testes

| Item | Status | Observacoes |
|------|--------|-------------|
| Factories payments (plan, subscription, checkout, billing-profile) | ✅ Concluido | `abstract class` pattern |
| Factories core (user, organization) | ✅ Concluido | Migrado para suportar payments |
| Builders (webhook-payload, request) | ✅ Concluido | Fluent API implementada |
| Support utils (faker, auth, wait, skip-integration) | ✅ Concluido | `src/test/support/` |
| Helpers de dominio (employee, etc.) | ⬜ Pendente | Migracao futura |
| Compatibilidade backward | ✅ Concluido | Re-exports com @deprecated |
| Remocao de re-exports | 🔄 Em andamento | billing/, subscription/, checkout/, customer/, limits/ migrados |

### Migracao: Eliminar Re-exports e Usar Factories

**Objetivo**: Eliminar TODOS os re-exports deprecados de payments. Ao final da revisao, testes devem importar apenas de:
- `@/test/factories/` - Factories (criam dados no banco)
- `@/test/builders/` - Builders (criam objetos em memoria)
- `@/test/support/` - Utilitarios puros

**Estrutura final esperada:**
```text
src/test/
├── factories/                    # ✅ Usar este
│   ├── payments/
│   │   ├── plan.factory.ts
│   │   ├── subscription.factory.ts
│   │   ├── checkout.factory.ts
│   │   └── billing-profile.factory.ts
│   ├── user.factory.ts
│   └── organization.factory.ts
│
├── builders/                     # ✅ Usar este
│   ├── webhook-payload.builder.ts
│   └── request.builder.ts
│
├── support/                      # ✅ Usar este
│   ├── app.ts
│   ├── mailhog.ts
│   └── faker.ts
│
└── helpers/                      # ⚠️ Apenas domínios NAO-payments
    ├── employee.ts               # Fora do escopo (outro domínio)
    ├── sector.ts                 # Fora do escopo (outro domínio)
    └── ...                       # Migracao futura em outra revisao
```

**Ao revisar cada modulo de payments:**

1. Identificar imports de `@/test/helpers/` relacionados a payments
2. Substituir por imports corretos:

```typescript
// ❌ ANTES (re-exports deprecados)
import { createTestUser } from "@/test/helpers/user";
import { createPaidPlan } from "@/test/helpers/plan";
import { createTestApp } from "@/test/helpers/app";
import { createTestSubscription } from "@/test/helpers/subscription";

// ✅ DEPOIS (imports diretos)
import { UserFactory } from "@/test/factories/user.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { createTestApp } from "@/test/support/app";
```

**Arquivos a REMOVER ao final da revisao:**

| Arquivo | Tipo |
|---------|------|
| `src/test/helpers/app.ts` | Re-export → support/app.ts |
| `src/test/helpers/faker.ts` | Re-export → support/faker.ts |
| `src/test/helpers/user.ts` | Re-export → factories/user.factory.ts |
| `src/test/helpers/organization.ts` | Re-export → factories/organization.factory.ts |
| `src/test/helpers/checkout.ts` | Re-export → factories/payments/checkout.factory.ts |
| `src/test/helpers/subscription.ts` | Re-export → factories/payments/subscription.factory.ts |
| `src/test/helpers/webhook.ts` | Re-export → builders/webhook-payload.builder.ts |
| `src/test/factories/plan.ts` | Re-export → factories/payments/plan.factory.ts |
| `src/test/factories/billing-profile.ts` | Re-export → factories/payments/billing-profile.factory.ts |
| `src/test/helpers/skip-integration.ts` | Re-export → support/skip-integration.ts |

**Nota**: Helpers de outros dominios (employee, sector, branch, etc.) ficam FORA do escopo desta revisao

### Proximos Passos

1. ~~Iniciar revisao pelo modulo `plans/` (base para os demais)~~ ✅
2. Para cada modulo:
   - Ler codigo existente
   - Identificar gaps vs padroes
   - Corrigir implementacao se necessario
   - Verificar/criar testes faltantes
   - Atualizar status na tabela acima
3. Ao final, rodar suite completa de testes
