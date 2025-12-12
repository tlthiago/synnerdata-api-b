# Plano de Implementação Faseado - Upgrade de Subscription

## Visão Geral

Este plano divide a implementação do fluxo de upgrade em **8 fases incrementais**, onde cada fase:

1. Tem escopo mínimo para funcionar
2. Inclui testes de validação antes de prosseguir
3. Depende apenas das fases anteriores

---

## Progresso Atual

| Fase | Nome | Status | Observações |
|------|------|--------|-------------|
| 1 | [Types & Client](./phase-1-types-client.md) | ✅ Completa | Tipos e métodos implementados |
| 2 | [Plan Sync](./phase-2-plan-sync.md) | ✅ Completa | syncToPagarme e ensureSynced implementados |
| 2 | [Plan Module Refactor](./phase-2-plan-module-refactor.md) | ✅ Completa | CRUD completo + testes E2E |
| 3 | [Checkout Refactor](./phase-3-checkout-refactor.md) | ✅ Completa | Payment Links com `type: "subscription"` + pendingCheckouts |
| 4 | [Webhook Handler](./phase-4-webhook-handler.md) | ✅ Completa | `handleSubscriptionCreated` + `syncCustomerData` implementados |
| 5 | [E2E Test](./phase-5-e2e-test.md) | ✅ Completa | `upgrade-use-case.test.ts` cobre fluxo completo |
| 6 | [Email Confirmação](./phase-6-polish.md) | ✅ Completa | Email de confirmação de upgrade |
| 7 | [Jobs Agendados](./phase-7-scheduled-jobs.md) | ⏳ Pendente | Expiração de trials + notificações |
| 8 | [Melhorias](./phase-8-improvements.md) | ⏳ Backlog | Funcionalidades opcionais |

---

## Resumo de Status

```
FLUXO CORE (Fases 1-5)     ████████████████████ 100% ✅
NOTIFICAÇÕES (Fase 6)      ████████████████████ 100% ✅
AUTOMAÇÃO (Fase 7)         ░░░░░░░░░░░░░░░░░░░░   0% ⏳
MELHORIAS (Fase 8)         ░░░░░░░░░░░░░░░░░░░░   0% 📋

PROGRESSO TOTAL: ~75% (pronto para produção)
```

---

## O que está FUNCIONANDO

```
✅ Signup → Trial automático (14 dias)
✅ POST /checkout → Payment Link (type: "subscription")
✅ Pagamento no Pagar.me → Webhook → Subscription ativada
✅ Customer data sincronizado para organization_profiles
✅ Email de confirmação de upgrade enviado ao owner
✅ Cancelamento + Restauração de subscription
✅ Billing Portal (listar invoices, download)
✅ Sistema de hooks/eventos
✅ Testes E2E cobrindo fluxo completo
```

---

## O que está PENDENTE

### Para Produção (Recomendado)

| Item | Fase | Prioridade | Estimativa |
|------|------|------------|------------|
| Job de expiração de trials | 7 | Média | 2-3h |
| Email de trial expirando | 7 | Média | 1-2h |

### Nice to Have (Backlog)

| Item | Fase | Prioridade | Estimativa |
|------|------|------------|------------|
| Email de pagamento falhou | 8 | Média | 1h |
| Notificação Slack | 8 | Baixa | 1h |
| Atualização de cartão | 8 | Baixa | 2h |
| Métricas/Analytics | 8 | Baixa | 4h |
| Proration (mudança de plano) | 8 | Baixa | 8h+ |

---

## Fases Detalhadas

### Fases Completas (Core + Notificações)

| Fase | Nome | Objetivo | Arquivos |
|------|------|----------|----------|
| 1 | [Types & Client](./phase-1-types-client.md) | Tipos + métodos PagarmeClient | `pagarme.types.ts`, `client.ts` |
| 2 | [Plan Sync](./phase-2-plan-sync.md) | Sincronizar planos → Pagar.me | `plan.service.ts` |
| 2 | [Plan Module Refactor](./phase-2-plan-module-refactor.md) | CRUD completo de planos | `plan/` |
| 3 | [Checkout Refactor](./phase-3-checkout-refactor.md) | Payment Links subscription | `checkout.service.ts` |
| 4 | [Webhook Handler](./phase-4-webhook-handler.md) | `subscription.created` + sync | `webhook.service.ts` |
| 5 | [E2E Test](./phase-5-e2e-test.md) | Teste do fluxo completo | `upgrade-use-case.test.ts` |
| 6 | [Email Confirmação](./phase-6-polish.md) | Enviar email pós-upgrade | `email.ts`, `webhook.service.ts` |

### Fases Pendentes (Automação)

| Fase | Nome | Objetivo | Arquivos |
|------|------|----------|----------|
| 7 | [Jobs Agendados](./phase-7-scheduled-jobs.md) | Expirar trials + notificar | `jobs/`, GitHub Actions |
| 8 | [Melhorias](./phase-8-improvements.md) | Funcionalidades opcionais | Vários |

---

## Diagrama de Dependências

```text
Fase 1: Types & Client ──────────────────────────────────────┐
    │                                                        │
    ├──► Fase 2: Plan Sync + Refactor                        │
    │        │                                               │
    │        └──► Fase 3: Checkout Refactor                  │
    │                 │                                      │
    └─────────────────┼──► Fase 4: Webhook Handler           │
                      │        │                             │
                      └────────┴──► Fase 5: E2E Test         │
                                        │                    │
                                        └──► Fase 6: Email ──┤
                                                 │           │
                                                 └──► Fase 7: Jobs
                                                         │
                                                         └──► Fase 8: Melhorias
```

---

## Comparativo: Better Auth + Stripe vs Nossa Implementação

| Funcionalidade | Better Auth + Stripe | Nossa Implementação | Status |
|----------------|---------------------|---------------------|--------|
| Signup com Trial | `createCustomerOnSignUp` | `SubscriptionService.createTrial()` | ✅ |
| Trial Abuse Prevention | 1 trial por user | `trialUsed` flag por org | ✅ |
| Checkout Hosted | Stripe Checkout | Payment Links subscription | ✅ |
| Webhook Processing | `invoice.paid`, etc. | `subscription.created`, etc. | ✅ |
| Webhook Idempotency | Via Stripe Event ID | `subscription_events` table | ✅ |
| Cancel/Restore | Endpoints próprios | `cancel()`, `restore()` | ✅ |
| Hooks/Events | `onSubscriptionCreate` | `PaymentHooks.emit()` | ✅ |
| Authorization | `authorizeReference` | `AuthorizationService` | ✅ |
| Billing Portal | Stripe Portal | `BillingService` (próprio) | ✅ |
| List Invoices | Via Stripe API | `BillingService.listInvoices()` | ✅ |
| Email Confirmação | Sim | `sendUpgradeConfirmationEmail()` | ✅ |
| Trial Expiration Job | Sim | ⏳ Pendente | Fase 7 |
| Grace Period | `past_due` state | Implícito (formalizar) | ⚠️ Parcial |
| Plan Limits | Stripe limits | Interface existe, falta service | ⏳ Pendente |
| Dunning Emails | Stripe retry + emails | ⏳ Pendente | Fase 8 |

**Conclusão:** ~90% de paridade com Better Auth + Stripe adaptado para Pagarme.

### Implementações Verificadas

- **Idempotência:** ✅ Implementada em `webhook.service.ts:18-32` via tabela `subscription_events`
- **Error Tracking:** ✅ Implementado em `webhook.service.ts:60-71` com registro de erros e retry

---

## Comandos Úteis

```bash
# Verificar tipos
npx tsc --noEmit

# Verificar linting
npx ultracite check

# Rodar testes de payments
bun test src/modules/payments/

# Rodar teste específico
bun test src/modules/payments/__tests__/upgrade-use-case.test.ts
```

---

## Próximos Passos

1. **Implementar Fase 7** - Jobs agendados (3-4h)
2. **Deploy para produção** - Fluxo core + emails funcionando
3. **Implementar Fase 8** - Conforme necessidade

---

## Arquivos Principais

```
src/modules/payments/
├── pagarme/
│   ├── client.ts           # PagarmeClient com todos os métodos
│   └── pagarme.types.ts    # Tipos da API Pagarme
├── plan/
│   ├── plan.service.ts     # syncToPagarme, ensureSynced, CRUD
│   └── index.ts            # Controllers público/protegido
├── checkout/
│   └── checkout.service.ts # create() com Payment Links
├── webhook/
│   └── webhook.service.ts  # handleSubscriptionCreated + syncCustomerData
├── subscription/
│   └── subscription.service.ts # Trial, cancel, restore, checkAccess
├── billing/
│   └── billing.service.ts  # Portal, invoices
├── hooks/
│   └── index.ts            # PaymentHooks event emitter
└── __tests__/
    └── upgrade-use-case.test.ts # Teste E2E completo
```
