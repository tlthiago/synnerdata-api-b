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

## Melhorias Futuras

### Payload Enriquecido nos Eventos

Atualmente cada listener faz queries independentes. Payload deve ser enriquecido no momento do emit:

```typescript
// Atual - 3 queries por evento
PaymentHooks.on("subscription.activated", async ({ subscription }) => {
  const ownerEmail = await getOrganizationOwnerEmail(...);
  const orgName = await getOrganizationName(...);
  // ...
});

// Planejado - dados ja disponiveis no contexto
PaymentHooks.emit("subscription.activated", {
  subscription,
  ownerEmail,
  organizationName,
  planDisplayName,
});
```

### Consolidar Helpers Duplicados

Helpers de query estao duplicados entre `subscription.helpers.ts` e `plan-change.helpers.ts`. Reutilizar via re-export:

```typescript
// plan-change.helpers.ts
export {
  findByOrganizationId,
  findById,
  findByIdWithPlan
} from "../subscription/subscription.helpers";
```
