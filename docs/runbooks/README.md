# Runbooks — synnerdata-api-b

> Procedimentos operacionais para incidentes em produção. Assume familiaridade com a stack (Coolify UI, Postgres, Bun, Pagar.me v5 sandbox).

## Por onde começar

| Sintoma | Runbook | Prioridade |
|---|---|---|
| `/health` retorna `data.status: "unhealthy"`, erro de DB no Sentry | [db-down.md](./db-down.md) | 🔴 crítico |
| API não responde, Coolify mostra container em `restarting` | [app-container.md](./app-container.md) | 🔴 crítico |
| Cliente reporta falha de pagamento/renovação | [pagarme-webhook.md](./pagarme-webhook.md) | 🟡 alto |
| Usuários não recebem verification/reset email | [smtp-down.md](./smtp-down.md) | 🟡 alto |
| Sentry alertando pico de 5xx | [5xx-surge.md](./5xx-surge.md) | 🔴 crítico (triagem → runbook específico) |
| Deploy falhou em migration, app não sobe | [migration-rollback.md](./migration-rollback.md) | 🔴 crítico |
| Backup não rodou / restore necessário | [database-backup.md](./database-backup.md) | varia |

## Ordem de escalação padrão

| Tempo desde detecção | Ação |
|---|---|
| 0-5 min | Checar Coolify UI (status containers) + Sentry dashboard + `/health` |
| 5-15 min | Abrir runbook específico; executar diagnóstico + procedimento |
| 15-30 min (se não resolveu) | Comunicar cliente; continuar procedimento ou escalar para caminho alternativo |
| 30-60 min | Se persistir, postmortem formal; abrir incidente em issue dedicada no repo |

## Contexto do produto

- **Cliente atual**: 1 em produção (MVP).
- **Consumidores**: front web + API keys (Power BI do cliente).
- **SLA de fato**: não há SLA contratual formal; tratar como "comunicar se > 15 min".
- **Oncall**: dono único do projeto.

## Débitos rastreados

Runbooks cobrem débitos #90, #91, #93 do [catálogo de débitos](../improvements/debts.md). Parte do CP-38 (Onda 5 — [roadmap](../improvements/roadmap.md)).

## Referências

- [docs/improvements/README.md](../improvements/README.md) — dashboard da iniciativa de infra.
- [docs/improvements/principles.md § 4.1 #14-17](../improvements/principles.md) — stack de observabilidade (Pino + Sentry + requestId).
