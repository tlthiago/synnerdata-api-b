# Pagar.me Webhook — Runbook

> Webhooks do Pagar.me chegando mas não processando, ou não chegando. Cobre débito #93.

## Sintomas

- Cliente reporta: "meu pagamento não foi processado" ou "minha assinatura não renovou".
- Logs Pino mostram pico de `type:"webhook:auth_failure"`, `type:"webhook:skipped:missing-metadata"`, ou `type:"webhook:unhandled-event-type"` (CP-6 log shapes).
- Sentry captura errors com tags `webhook_event_type` e `pagarme_event_id`.
- DB: `SELECT count(*) FROM subscription_events WHERE processed_at IS NULL` retorna N > 10.

## Diagnóstico rápido (≤ 5 min)

1. Query no DB (Coolify → `postgresql-production` → Terminal):
   ```sql
   SELECT pagarme_event_id, event_type, processed_at, error
   FROM subscription_events
   WHERE processed_at IS NULL
   ORDER BY created_at DESC
   LIMIT 20;
   ```
2. Logs da aplicação filtrados por `type:"webhook:*"` nos últimos 30 min.
3. Pagar.me Dashboard → `Webhooks` → aba de retries — verificar se provider está reentregando.

Classificar o cenário:
- **Auth failure** em todos os eventos recentes → credential drift.
- **Missing metadata** em eventos específicos → nossa criação de customer/subscription sem `metadata.organization_id`.
- **Processor error** (erro no switch/case do service) → bug nosso.
- **Eventos não chegando** (Pagar.me dashboard mostra tentativas com 5xx do nosso lado) → dep/infra (ver [5xx-surge.md](./5xx-surge.md)).
- **Pagar.me API própria down** → SLA deles; confirmar em status page do Pagar.me.

## Procedimento de recuperação

**Caminho A — Auth failure:**
1. Comparar `PAGARME_WEBHOOK_USERNAME` e `PAGARME_WEBHOOK_PASSWORD` no Coolify → `app` → Environment Variables com o que está configurado no Pagar.me Dashboard → `Webhooks` → (editar config).
2. Se driftou, atualizar no Pagar.me (ou no Coolify se a rotação foi manual).
3. Pagar.me → reenviar eventos falhados no dashboard.

**Caminho B — Missing metadata:**
1. Identificar `organization_id` ausente nos logs.
2. Investigar como a subscription foi criada sem metadata — provável bug em `admin-provision` ou fluxo antigo.
3. Reparar manualmente no Pagar.me (adicionar metadata via API) ou no DB (`UPDATE subscription_events SET payload = ... WHERE pagarme_event_id = ...`) e reprocessar.

**Caminho C — Processor error:**
1. Abrir Sentry, buscar por `pagarme_event_id`.
2. Ler stack trace, identificar bug.
3. Hotfix → deploy → replay do evento via Pagar.me dashboard (idempotência garantida via `pagarme_event_id` unique constraint — `webhook.service.ts:81-97`).

**Caminho D — Pagar.me API down:**
1. Confirmar via status page oficial do Pagar.me.
2. Aguardar — nada a fazer do nosso lado.
3. Monitorar eventos após retomada; se cliente perto de expirar grace period, intervir manualmente (extend trial ou grace via admin tool).

## Comunicação

- Impacto financeiro direto (renovação travada → possível suspensão do cliente).
- Se backlog > 1h de eventos não processados: comunicar cliente e monitorar grace periods manualmente.
- Mensagem: "Estamos resolvendo um atraso no processamento de pagamentos. Nenhum valor adicional será cobrado."

## Post-incident

- Se bug em processor: issue + teste de regressão em `src/modules/payments/webhook/__tests__/`.
- Se provider issue: registrar em um log interno para avaliar confiabilidade do Pagar.me.
- Se recorrente: considerar alert no Sentry para `type:"webhook:auth_failure"` crescendo.

## Referências

- Service: `src/modules/payments/webhook/webhook.service.ts`.
- Log shapes (CP-6): `webhook:auth_failure`, `webhook:skipped:missing-metadata`, `webhook:unhandled-event-type`.
- Tests: `src/modules/payments/webhook/__tests__/`.
- Memória do CP-6 em [changelog](../improvements/changelog.md).
- Débito #93 em [debts.md](../improvements/debts.md).
