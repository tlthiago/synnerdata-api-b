# Grace Period - Análise de Webhooks do Pagar.me

> **Data:** 2025-12-14
> **Contexto:** Validação de eventos de falha de pagamento em assinaturas

## Questão Crítica

**"O evento `charge.payment_failed` será acionado em assinaturas, ou existe um evento específico para falhas de pagamento recorrente?"**

---

## Descobertas da Documentação Pagar.me

### 1. Eventos Disponíveis para Falhas de Pagamento

| Evento | Descrição | Contexto |
|--------|-----------|----------|
| `charge.payment_failed` | Disparado quando uma cobrança (charge) falha | Genérico - qualquer charge |
| `invoice.payment_failed` | Disparado quando o pagamento de uma fatura (invoice) falha | **Específico para assinaturas** |
| `subscription.updated` | Disparado quando assinatura é atualizada | Pode incluir mudança de status para "unpaid" |

**Fonte:** [Pagar.me Webhook Events Reference](https://docs.pagar.me/reference/eventos-de-webhook-1)

---

### 2. Anatomia de Assinaturas no Pagar.me

```
SUBSCRIPTION (Assinatura)
    ↓ (a cada ciclo de cobrança)
INVOICE (Fatura)
    ↓ (tentativa de pagamento)
CHARGE (Cobrança)
    ↓
PAYMENT SUCCESS/FAILURE
```

**Como funciona:**
1. **Subscription** define o plano e recorrência
2. **Invoice** é criada automaticamente ao final de cada ciclo
3. **Charge** é a tentativa de pagamento da invoice
4. Se charge falha → podem ser disparados 2 eventos:
   - `charge.payment_failed`
   - `invoice.payment_failed`

**Fonte:** [Pagar.me Subscription Concepts](https://docs.pagar.me/v3/docs/conceitos-de-recorr%C3%AAncia)

---

### 3. Sistema de Retries Automáticos do Pagar.me

#### Configuração Padrão

| Parâmetro | Valor Padrão | Configurável? |
|-----------|--------------|---------------|
| Número de tentativas | **4 tentativas adicionais** | ✅ Sim (Dashboard) |
| Intervalo entre tentativas | **3 dias** | ✅ Sim (Dashboard) |
| Cancelamento automático após tentativas | **Não** | ✅ Sim (Dashboard) |

#### Status Durante Retries

Durante o período de tentativas, a assinatura pode ter os seguintes status:

1. **`pending_payment`** - Aguardando primeira tentativa
2. **`unpaid`** - Tentativas falharam, aguardando retry
3. **`canceled`** - Todas tentativas falharam E cancelamento automático ativo

**Importante:** O Pagar.me **tenta automaticamente** cobrar o cliente durante o período de retry. Isso significa:
- 1ª falha → Pagar.me tenta novamente em 3 dias
- 2ª falha → Pagar.me tenta novamente em 3 dias
- 3ª falha → Pagar.me tenta novamente em 3 dias
- 4ª falha → Pagar.me tenta novamente em 3 dias
- **Total: até 12 dias de tentativas automáticas** (4 retries × 3 dias)

**Fonte:** [Pagar.me Retry Configuration](https://docs.pagar.me/v3/docs/assinaturas)

---

### 4. Implementação Atual do Projeto

**Arquivo:** `src/modules/payments/webhook/webhook.service.ts`

#### Eventos Tratados (linhas 36-57)

```typescript
switch (payload.type) {
  case "charge.paid":
    await WebhookService.handleChargePaid(payload);
    break;
  case "charge.payment_failed":  // ✅ Implementado
    await WebhookService.handleChargeFailed(payload);
    break;
  case "subscription.canceled":
    await WebhookService.handleSubscriptionCanceled(payload);
    break;
  case "subscription.created":
    await WebhookService.handleSubscriptionCreated(payload);
    break;
  case "charge.refunded":
    await WebhookService.handleChargeRefunded(payload);
    break;
  case "subscription.updated":
    await WebhookService.handleSubscriptionUpdated(payload);
    break;
  default:
    break;
}
```

#### Handler Atual de Falha (linhas 166-201)

```typescript
private static async handleChargeFailed(payload: ProcessWebhook) {
  const data = payload.data as {
    subscription?: { id: string };
    invoice?: { id: string };
    metadata?: Record<string, string>;
  };

  const organizationId = data.metadata?.organization_id;
  if (!organizationId) return;

  // ❌ Marca como past_due IMEDIATAMENTE na primeira falha
  await db
    .update(schema.orgSubscriptions)
    .set({ status: "past_due" })
    .where(eq(schema.orgSubscriptions.organizationId, organizationId));

  // Emite evento
  PaymentHooks.emit("charge.failed", {
    subscriptionId: subscription.id,
    invoiceId: data.invoice?.id ?? "",
    error: data.last_transaction?.gateway_response?.message ?? "Payment failed",
  });
}
```

---

## Análise Crítica

### ❌ Problema 1: Evento Incompleto

**Situação atual:** Só escutamos `charge.payment_failed`

**Problema:** Para assinaturas, o Pagar.me pode enviar **`invoice.payment_failed`** em vez de (ou além de) `charge.payment_failed`.

**Evidência:**
- Documentação menciona explicitamente `invoice.payment_failed` para assinaturas
- Invoices são o wrapper de charges em contexto de assinatura

**Risco:**
- Se Pagar.me só envia `invoice.payment_failed`, **nunca** marcaríamos como `past_due`
- Sistema de grace period seria inútil

---

### ❌ Problema 2: Conflito com Retries Automáticos

**Configuração do Pagar.me:**
- 4 tentativas automáticas
- Intervalo de 3 dias
- **Total: até 12 dias** de retries

**Nossa implementação atual:**
- Marca `past_due` na **primeira falha**
- Grace period de **7 dias**

**Conflito:**

```
DIA 0:  Primeira cobrança falha
        ↓ Webhook: charge.payment_failed
        ↓ Nossa API: status = past_due, gracePeriodEnds = dia 7

DIA 3:  Pagar.me tenta automaticamente (2ª tentativa)
        ↓ Falha novamente
        ↓ Webhook: charge.payment_failed
        ↓ Nossa API: ??? (já está past_due)

DIA 6:  Pagar.me tenta automaticamente (3ª tentativa)
        ↓ Falha novamente

DIA 7:  ❌ NOSSO GRACE PERIOD EXPIRA
        ↓ Job suspende assinatura (status = canceled)
        ↓ Usuário perde acesso

DIA 9:  Pagar.me tenta automaticamente (4ª tentativa)
        ✅ SUCESSO! Pagamento aprovado
        ❌ MAS usuário já foi suspenso por nós
```

**Cenário:** Pagar.me resolve o pagamento no dia 9, mas já suspendemos no dia 7.

---

### ❌ Problema 3: Duplicação de Lógica

**Pagar.me já tem:**
- Sistema de retries (4 tentativas × 3 dias = 12 dias)
- Cancelamento automático opcional após retries

**Nosso grace period:**
- 7 dias de acesso durante past_due
- Suspensão automática após 7 dias

**Pergunta:** Estamos criando um grace period redundante?

---

## Cenários Possíveis

### Cenário A: Pagar.me Envia Webhook em CADA Retry

```
DIA 0:  charge.payment_failed (1ª tentativa)
DIA 3:  charge.payment_failed (2ª tentativa - retry)
DIA 6:  charge.payment_failed (3ª tentativa - retry)
DIA 9:  charge.payment_failed (4ª tentativa - retry)
DIA 12: subscription.canceled (Pagar.me desiste)
```

**Comportamento esperado:** Recebemos múltiplos `charge.payment_failed`

**Problema:** Nossa implementação marca `past_due` toda vez (idempotente), mas não sabe diferenciar primeira falha de retry.

---

### Cenário B: Pagar.me Envia Webhook Apenas na Primeira Falha

```
DIA 0:  charge.payment_failed (1ª tentativa)
        [retries acontecem silenciosamente]
DIA 12: subscription.canceled OU charge.paid
```

**Comportamento esperado:** Recebemos apenas 1 webhook de falha, depois resultado final.

**Problema:** Não sabemos se Pagar.me está tentando novamente ou se desistiu.

---

### Cenário C: Pagar.me Usa `invoice.payment_failed` para Assinaturas

```
DIA 0:  invoice.payment_failed
        [retries acontecem]
DIA 12: invoice.paid OU invoice.canceled
```

**Comportamento esperado:** Webhooks específicos de invoice, não charge.

**Problema:** ❌ **Não estamos escutando `invoice.payment_failed`** - grace period nunca inicia!

---

## Questões para Investigar

### 1. Qual evento é realmente enviado?

- [ ] Testar em sandbox: criar assinatura e forçar falha de pagamento
- [ ] Verificar logs de webhook: qual evento chega?
- [ ] Confirmar se é `charge.payment_failed` ou `invoice.payment_failed`

### 2. Quantos webhooks são enviados?

- [ ] Um webhook por retry? Ou apenas no primeiro e no último?
- [ ] Status da assinatura muda durante retries?

### 3. Configuração do Pagar.me da conta

- [ ] Verificar Dashboard: quantos retries estão configurados?
- [ ] Cancelamento automático está ativo?
- [ ] Qual o intervalo entre retries?

### 4. Comportamento do `subscription.updated`

- [ ] Este evento é enviado quando status muda para `unpaid`?
- [ ] Podemos usar `subscription.updated` em vez de `charge.payment_failed`?

---

## Proposta de Ajustes

### Ajuste 1: Adicionar Handler para `invoice.payment_failed`

**Arquivo:** `src/modules/payments/webhook/webhook.service.ts`

```typescript
switch (payload.type) {
  // ... existing cases ...

  case "invoice.payment_failed":  // NOVO
    await WebhookService.handleInvoiceFailed(payload);
    break;
}

private static async handleInvoiceFailed(payload: ProcessWebhook) {
  // Mesmo comportamento de handleChargeFailed
  // Marca como past_due e inicia grace period
}
```

**Ou:** Consolidar ambos em um handler único

```typescript
case "charge.payment_failed":
case "invoice.payment_failed":  // Tratar ambos igualmente
  await WebhookService.handlePaymentFailed(payload);
  break;
```

---

### Ajuste 2: Alinhar Grace Period com Retries do Pagar.me

**Opção A: Grace period > período de retries**

```typescript
const GRACE_PERIOD_DAYS = 15;  // Maior que 12 dias de retries do Pagar.me
```

**Vantagem:** Pagar.me tem chance de resolver antes de suspendermos

**Desvantagem:** Usuário pode ter 15 dias de acesso não pago

---

**Opção B: Confiar no Pagar.me, sem grace period próprio**

```typescript
// Não criar grace period
// Quando Pagar.me cancelar (após retries), recebemos subscription.canceled
// Aí sim marcamos como canceled
```

**Vantagem:** Simplicidade, sem duplicação de lógica

**Desvantagem:** Sem controle sobre tempo de acesso durante retries

---

**Opção C: Grace period condicional baseado em retries**

```typescript
// Tracking de tentativas
pastDueSince: timestamp
retryCount: integer  // Incrementa a cada charge.payment_failed

// Grace period dinâmico
const gracePeriodDays = (retryCount + 1) * 3;  // 3, 6, 9, 12 dias
```

**Vantagem:** Alinha com retries do Pagar.me

**Desvantagem:** Complexidade, precisa contar retries

---

### Ajuste 3: Usar `subscription.updated` como Fonte de Verdade

Em vez de reagir a `charge.payment_failed`, reagir apenas a mudanças de status:

```typescript
case "subscription.updated":
  // Se status mudou para "unpaid" ou "pending_payment"
  // → Marcar como past_due e iniciar grace period

  // Se status mudou de "unpaid" para "active"
  // → Pagar.me resolveu, limpar grace period
```

**Vantagem:**
- Status da assinatura é a fonte de verdade
- Não precisamos contar retries
- Automaticamente sincronizado com Pagar.me

**Desvantagem:**
- Precisa confirmar se `subscription.updated` é enviado em cada mudança

---

## Próximos Passos Recomendados

### 1. Teste em Sandbox (CRÍTICO)

**Objetivo:** Entender comportamento real dos webhooks

**Steps:**
1. Criar assinatura de teste em sandbox
2. Usar cartão de teste que falha
3. Monitorar webhooks recebidos
4. Documentar:
   - Qual evento: `charge.payment_failed` ou `invoice.payment_failed`?
   - Quantos webhooks: um por retry ou apenas no início/fim?
   - Status da assinatura: muda para `unpaid`?
   - Quanto tempo até cancelamento automático (se configurado)?

**Ferramentas:**
- Pagar.me Sandbox
- Webhook.site para capturar payloads
- Logs do nosso webhook endpoint

---

### 2. Verificar Configuração da Conta

**Dashboard Pagar.me → Recorrência:**
- [ ] Quantos retries estão configurados? (padrão: 4)
- [ ] Intervalo entre retries? (padrão: 3 dias)
- [ ] Cancelamento automático ativo? (padrão: não)

**Importante:** Essas configurações afetam diretamente nossa estratégia de grace period.

---

### 3. Ajustar Implementação Baseado nos Testes

**Se descobrirmos que:**

#### A) `invoice.payment_failed` é enviado (não `charge.payment_failed`)
→ **Adicionar handler para `invoice.payment_failed`**

#### B) Retries geram múltiplos webhooks
→ **Tornar `markPastDue()` idempotente** (não resetar `pastDueSince` em retries)

#### C) Retries levam mais de 7 dias
→ **Aumentar `GRACE_PERIOD_DAYS` para 15**

#### D) `subscription.updated` informa status `unpaid`
→ **Usar `subscription.updated` como fonte de verdade**

---

## Recomendação Imediata

### ⚠️ NÃO IMPLEMENTAR GRACE PERIOD ATÉ CONFIRMAR WEBHOOKS

**Razão:** Sem saber exatamente quais webhooks o Pagar.me envia e quando, podemos:
1. Nunca iniciar o grace period (se evento errado)
2. Suspender prematuramente (antes de retries terminarem)
3. Criar lógica redundante com sistema nativo do Pagar.me

### ✅ PLANO DE AÇÃO

1. **Hoje:** Testar em sandbox e documentar webhooks recebidos
2. **Amanhã:** Ajustar plano de implementação baseado em evidências
3. **Depois:** Implementar com confiança

---

## Referências

- [Pagar.me Webhook Events](https://docs.pagar.me/reference/eventos-de-webhook-1)
- [Pagar.me Subscription Concepts](https://docs.pagar.me/v3/docs/conceitos-de-recorr%C3%AAncia)
- [Pagar.me Subscriptions API](https://docs.pagar.me/reference/assinaturas-1)

---

## Decisões Pendentes

| Questão | Opções | Decisão | Data |
|---------|--------|---------|------|
| Qual evento usar? | `charge.payment_failed` vs `invoice.payment_failed` vs ambos | ⏳ Aguardando teste sandbox | - |
| Grace period duration | 7 dias vs 15 dias vs dinâmico | ⏳ Depende de retries configurados | - |
| Fonte de verdade | Charge events vs Subscription events | ⏳ Aguardando teste | - |
| Cancelamento | Nossa lógica vs Pagar.me nativo | ⏳ Depende de configuração Dashboard | - |
