# Payments Module - Lacunas de Testes

> **Data:** 2025-12-14
> **Status:** Documento de referência para melhorias de cobertura de testes

## Contexto

Este documento identifica lacunas na cobertura de testes do módulo `src/modules/payments/`, considerando as **limitações da API do Pagar.me** descobertas durante a análise.

### Limitação Crítica do Pagar.me

> **Uma assinatura cancelada no Pagar.me NÃO pode ser reativada.**
>
> "Uma assinatura cancelada não pode ser alterada nem cobrada novamente, então se o assinante quiser voltar a usar o seu serviço, ele precisa criar uma nova assinatura."
>
> — [Documentação Pagar.me](https://docs.pagar.me/v3/docs/conceitos-de-recorr%C3%AAncia)

Isso impacta diretamente o fluxo de cancelamento/restauração e requer uma implementação de "soft cancel" (cancelamento agendado).

---

## Cobertura Atual

| Categoria | Arquivos | Status |
|-----------|----------|--------|
| Use Cases (`__tests__/`) | 3 | Upgrade flow, Cancel flow E2E |
| Plan | 7 | CRUD completo, sync, service |
| Subscription | 4 | Service, get, cancel, restore |
| Checkout | 3 | Create, flow E2E, webhook flow E2E |
| Webhook | 2 | Service (completo), process |
| Billing | 5 | Invoices, card, usage, billing info |
| Customer | 2 | Service, list |
| Jobs | 2 | Service, endpoints |

---

## Lacunas Identificadas

### 1. Fluxo de Cancelamento Agendado + Restauração

**Prioridade:** Crítica
**Arquivo sugerido:** `src/modules/payments/subscription/__tests__/scheduled-cancellation.test.ts`

A implementação atual chama `PagarmeClient.cancelSubscription()` imediatamente no `cancel()`, tornando restauração impossível. Com a solução de "soft cancel", os seguintes cenários precisam ser testados:

| Cenário | Esperado |
|---------|----------|
| Cancel (soft) | `cancelAtPeriodEnd = true`, status permanece `active`, **não** chama Pagar.me |
| Cancel (soft) → Restore antes do período acabar | `cancelAtPeriodEnd = false`, assinatura continua normalmente |
| Cancel (soft) → Período expira → Job processa | Cancela no Pagar.me, status muda para `canceled` |
| Restore após job processar (status = `canceled`) | `SubscriptionNotRestorableError` |
| Restore sem cancelamento agendado | `SubscriptionNotRestorableError` |

```typescript
describe("Scheduled Cancellation Flow", () => {
  test("cancel should set cancelAtPeriodEnd without calling Pagarme", async () => {
    // Arrange: criar assinatura ativa com pagarmeSubscriptionId
    // Act: chamar cancel()
    // Assert: cancelAtPeriodEnd = true, status = "active", Pagarme NÃO foi chamado
  });

  test("restore should clear cancellation flags", async () => {
    // Arrange: criar assinatura com cancelAtPeriodEnd = true
    // Act: chamar restore()
    // Assert: cancelAtPeriodEnd = false, canceledAt = null
  });

  test("restore should fail for already canceled subscription", async () => {
    // Arrange: criar assinatura com status = "canceled"
    // Act & Assert: restore() throws SubscriptionNotRestorableError
  });
});
```

---

### 2. Job `processScheduledCancellations`

**Prioridade:** Crítica
**Arquivo sugerido:** `src/modules/payments/jobs/__tests__/process-scheduled-cancellations.test.ts`

Este job ainda não existe e precisa ser implementado junto com seus testes.

| Cenário | Esperado |
|---------|----------|
| Assinatura com `cancelAtPeriodEnd = true` e `currentPeriodEnd < now` | Cancela no Pagar.me, status → `canceled` |
| Assinatura com `cancelAtPeriodEnd = true` mas período ainda válido | Não processa (ignora) |
| Assinatura com `cancelAtPeriodEnd = false` | Não processa (ignora) |
| Falha ao cancelar no Pagar.me | Log de erro, não atualiza status, continua com próximas |
| Assinatura trial sem `pagarmeSubscriptionId` | Atualiza status local sem chamar Pagar.me |

```typescript
describe("JobsService.processScheduledCancellations", () => {
  test("should cancel subscriptions past their period end", async () => {
    // Arrange: criar assinatura com cancelAtPeriodEnd = true, currentPeriodEnd = ontem
    // Act: chamar processScheduledCancellations()
    // Assert: status = "canceled", Pagarme.cancelSubscription foi chamado
  });

  test("should skip subscriptions still within period", async () => {
    // Arrange: criar assinatura com cancelAtPeriodEnd = true, currentPeriodEnd = amanhã
    // Act: chamar processScheduledCancellations()
    // Assert: status permanece "active", Pagarme NÃO foi chamado
  });

  test("should continue processing after Pagarme API error", async () => {
    // Arrange: criar 2 assinaturas, mock Pagarme para falhar na primeira
    // Act: chamar processScheduledCancellations()
    // Assert: primeira permanece active, segunda é cancelada
  });
});
```

---

### 3. Fluxo de Trial Lifecycle

**Prioridade:** Alta
**Arquivo sugerido:** `src/modules/payments/jobs/__tests__/trial-lifecycle.test.ts`

| Cenário | Esperado |
|---------|----------|
| Trial criado → Job `notifyExpiringTrials` (3 dias antes) | Email enviado, hook `trial.expiring` emitido |
| Trial expirado → Job `expireTrials` | Status → `expired`, hook `trial.expired` emitido |
| Trial expirado → Tentativa de restore | `SubscriptionNotRestorableError` |
| Trial com `trialEnd` muito no futuro | Não é notificado nem expirado |

```typescript
describe("Trial Lifecycle", () => {
  test("notifyExpiringTrials should notify trials expiring in 3 days", async () => {
    // Arrange: criar trial com trialEnd = daqui a 3 dias
    // Act: chamar notifyExpiringTrials()
    // Assert: email enviado, hook emitido, notifiedIds inclui o trial
  });

  test("expireTrials should expire overdue trials", async () => {
    // Arrange: criar trial com trialEnd = ontem
    // Act: chamar expireTrials()
    // Assert: status = "expired", email enviado, hook emitido
  });

  test("expired trial cannot be restored", async () => {
    // Arrange: criar assinatura com status = "expired"
    // Act & Assert: restore() throws SubscriptionNotRestorableError
  });
});
```

---

### 4. Cenários de Erro de Restauração

**Prioridade:** Média
**Arquivo sugerido:** `src/modules/payments/subscription/__tests__/restore-error-scenarios.test.ts`

| Cenário | Erro Esperado |
|---------|---------------|
| Restaurar assinatura com status `canceled` | `SubscriptionNotRestorableError` |
| Restaurar assinatura com status `expired` | `SubscriptionNotRestorableError` |
| Restaurar sem `cancelAtPeriodEnd = true` | `SubscriptionNotRestorableError` |
| Restaurar assinatura inexistente | `SubscriptionNotFoundError` |

---

### 5. Renovação de Assinatura

**Prioridade:** Média
**Arquivo sugerido:** `src/modules/payments/webhook/__tests__/subscription-renewal.test.ts`

| Cenário | Esperado |
|---------|----------|
| `charge.paid` com novo período | `currentPeriodStart/End` atualizados |
| `charge.paid` em assinatura com `cancelAtPeriodEnd = true` | Período atualizado, mas `cancelAtPeriodEnd` permanece `true` |

---

### 6. Billing Service - Edge Cases

**Prioridade:** Média
**Arquivo sugerido:** `src/modules/payments/billing/__tests__/billing.service.test.ts`

| Cenário | Esperado |
|---------|----------|
| `listInvoices` quando `pagarmeSubscriptionId` é `null` | Retorna array vazio |
| `updateCard` quando subscription não existe | `SubscriptionNotFoundError` |
| `getUsage` com limites `null` | Retorna como `unlimited` |
| `getInvoiceDownloadUrl` com invoice inexistente | Erro apropriado |

---

### 7. Checkout com Customer Existente

**Prioridade:** Média
**Arquivo sugerido:** `src/modules/payments/checkout/__tests__/checkout-existing-customer.test.ts`

| Cenário | Esperado |
|---------|----------|
| Org já tem `pagarmeCustomerId` | Checkout usa customer existente |
| Verifica `customer_settings` no payment link | Dados do customer são passados |

---

### 8. Concorrência/Race Conditions

**Prioridade:** Baixa
**Arquivo sugerido:** `src/modules/payments/webhook/__tests__/webhook-concurrency.test.ts`

| Cenário | Esperado |
|---------|----------|
| Dois webhooks com mesmo `id` chegam simultaneamente | Apenas um é processado (idempotência) |
| Segundo webhook retorna sucesso sem reprocessar | `subscriptionEvents` tem apenas um registro |

---

### 9. Resiliência de Email

**Prioridade:** Baixa
**Arquivo sugerido:** `src/modules/payments/webhook/__tests__/webhook-email-resilience.test.ts`

| Cenário | Esperado |
|---------|----------|
| Webhook `subscription.canceled` com falha de email | Subscription é cancelada mesmo assim |
| Job `expireTrials` com falha de email | Trials são expirados, job continua |

---

## Resumo de Cobertura

| Aspecto | Status | Prioridade |
|---------|--------|------------|
| Use cases principais | ✅ Coberto | - |
| Webhooks | ✅ Excelente | - |
| Services | ✅ Bom | - |
| **Cancelamento agendado (soft cancel)** | ❌ Não testado | Crítica |
| **Job `processScheduledCancellations`** | ❌ Não existe | Crítica |
| **Cenários de restore com limitação Pagar.me** | ❌ Não testado | Crítica |
| Trial lifecycle completo | ⚠️ Parcial | Alta |
| Edge cases de billing | ⚠️ Parcial | Média |
| Checkout com customer existente | ❌ Não testado | Média |
| Concorrência | ❌ Não testado | Baixa |
| Resiliência de email | ❌ Não testado | Baixa |

---

## Ordem de Implementação Sugerida

1. **`scheduled-cancellation.test.ts`** - Testar novo fluxo de soft cancel
2. **`process-scheduled-cancellations.test.ts`** - Testar o job que efetiva cancelamentos
3. **`restore-error-scenarios.test.ts`** - Garantir erros apropriados
4. **`trial-lifecycle.test.ts`** - Cobrir ciclo de vida do trial
5. **`subscription-renewal.test.ts`** - Testar renovações
6. **`billing.service.test.ts`** - Edge cases de billing
7. **`checkout-existing-customer.test.ts`** - Checkout com customer
8. **`webhook-concurrency.test.ts`** - Idempotência
9. **`webhook-email-resilience.test.ts`** - Resiliência

---

## Referências

- [Pagar.me: Conceitos de Recorrência](https://docs.pagar.me/v3/docs/conceitos-de-recorr%C3%AAncia)
- [Pagar.me: Assinaturas API Reference](https://docs.pagar.me/reference/assinaturas-1)
- [Documentação interna: Phase 8.3 - Subscription Lifecycle](./upgrade-phases/phase-8.3-subscription-lifecycle.md)
