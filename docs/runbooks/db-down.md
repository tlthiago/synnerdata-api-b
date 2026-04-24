# DB Down — Runbook

> Postgres principal da aplicação inacessível (connection refused, timeout, corrupção). Cobre débito #93 ([débitos](../improvements/debts.md)).

## Sintomas

- `GET /health` retorna 503 com `checks.database: { ok: false }`.
- Sentry captura erros tipo `connection refused`, `timeout`, `too many clients already`.
- Logs Pino (`type:"db:*"`) mostram falhas consecutivas.
- API responde 500 em endpoints que tocam DB; endpoints sem DB (ex: `/health/live`) continuam 200.

**Distinguir de [app-container.md](./app-container.md)**: se `/health/live` responde 200 mas `/health` retorna 503, é DB. Se nem `/health/live` responde, é container/app — abrir `app-container.md`.

## Diagnóstico rápido (≤ 5 min)

1. `curl -s https://<domain>/health | jq` — confirma que é DB.
2. Coolify UI → `Projects` → `production` → `postgresql-production` — status do container.
3. Se acesso SSH: `docker logs --tail 200 $(docker ps -qf name=postgresql-production)`.
4. Causas comuns:
   - Container parado ou em `restarting`.
   - VPS com disco cheio (`df -h` no host).
   - VPS sem memória (OOM killer derrubou Postgres).
   - Pool exhausted (muitas conexões abertas, não DB morto).

## Procedimento de recuperação

**Caminho A — Container parado/reiniciando:**
1. Coolify → `postgresql-production` → `Restart`.
2. Aguardar status voltar para `Running`.
3. Testar `curl .../health` → `ok: true`.
4. Se app também precisar restart (pool travado): Coolify → `app` → `Restart`.

**Caminho B — VPS sem recursos:**
1. SSH no host → `df -h` e `free -m`.
2. Disco cheio → `docker system prune -af` (cuidado: remove containers parados, images unused, build cache).
3. Memória cheia → identificar processo consumindo: `ps aux --sort=-%mem | head`.
4. Escalar com provider da VPS se persistir.

**Caminho C — Pool exhausted sem DB morto:**
1. Confirmar: `SELECT count(*) FROM pg_stat_activity;` via Coolify Terminal do postgres.
2. Restart da API (Coolify → `app` → `Restart`) libera conexões.
3. Se recorrente, investigar query slow/long-running em `pg_stat_activity`.

**Caminho D — Suspeita de corrupção:**
Seguir [database-backup.md § Procedimento de restore](./database-backup.md#procedimento-de-restore).

## Comunicação

- API key serve Power BI do cliente → ficar fora > 10 min impacta cliente.
- **Avisar cliente em ≤ 15 min** se API não voltou.
- Mensagem: "Estamos resolvendo um problema com nossa base de dados. Previsão: X min. Seu acesso retorna automaticamente."

## Post-incident

- Registrar: duração, root cause, se audit trail foi preservado.
- Se backup foi acionado → registrar no § "Registrar execuções" do [database-backup.md](./database-backup.md).
- Se recorrente (2+ incidentes em um trimestre) → investigar causa sistêmica; considerar upgrade de VPS ou DB managed.

## Referências

- Código do healthcheck: `src/lib/health/index.ts`.
- [database-backup.md](./database-backup.md) — restore procedures.
- [docs/improvements/debts.md](../improvements/debts.md) — débito #93.
