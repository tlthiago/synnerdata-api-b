# App Container — Runbook

> API não sobe, container em `restarting` loop, ou crash imediato no boot. Cobre débito #93.

## Sintomas

- Coolify UI → container em `restarting` repetido ou `exited`.
- HTTP 502/503 do proxy do Coolify (proxy responde, app não).
- Logs mostram crash durante boot antes de `app.listen()`.
- `/health/live` **não responde** (diferente de db-down, onde `/health/live` volta 200).

**Distinguir de [db-down.md](./db-down.md)**: se `/health/live` retorna 200, é DB. Se nem `/health/live` responde, é este cenário.

## Diagnóstico rápido (≤ 5 min)

1. Coolify → `app` → `Logs` → scroll até primeiro `error` na stack.
2. Identificar categoria:
   - **Zod fail-fast do `src/env.ts`** — env var faltando/inválida. Stack mostra "Environment validation failed" + lista de campos.
   - **Migration falhando em `scripts/entrypoint.sh`** — stack mostra erro SQL ou migration hash mismatch.
   - **OOM no boot** — Coolify mostra `OOMKilled` status.
   - **Syntax/runtime error em código** — stack mostra arquivo e linha do erro (raro se CI passou).

## Procedimento de recuperação

**Caminho A — Env inválida:**
1. Coolify → `app` → `Environment Variables` → corrigir variável flagrada.
2. Clicar `Redeploy`.
3. Confirmar que container sobe via Logs.

**Caminho B — Migration falhando:**
Abrir [migration-rollback.md](./migration-rollback.md).

**Caminho C — OOM:**
1. Coolify → `app` → `Resource Limits` → aumentar memory limit (ex: 256M → 512M).
2. Redeploy. Se persistir, investigar memory leak via heap snapshot em staging.

**Caminho D — Bug de código (deploy recente quebrou):**
1. Coolify → `app` → `Deployments` → aba histórico.
2. Selecionar deploy imediatamente anterior ao que quebrou.
3. `Rollback to this deployment`.
4. Abrir issue no repo com stack trace; hotfix em branch `fix/` → `preview` → `main`.

## Comunicação

- **Avisar cliente em ≤ 5 min** se API ficar fora (mais estrito que DB porque app down = tudo fora, sem fallback).
- Mensagem: "Estamos com uma instabilidade no serviço. Previsão: X min."

## Post-incident

- Se foi bug de código: abrir issue + adicionar cobertura de teste que pegaria o caso.
- Se foi env: documentar a variável faltante em `src/env.ts` (RU-1 fez refine condicional em prod, mas novas deps podem ter adicionado vars).
- Se foi OOM: monitorar se é padrão ou spike isolado; MP-6 (tracing) + CP-17 (métricas) ajudam na causa-raiz futura.

## Referências

- Entrypoint: `scripts/entrypoint.sh`.
- Env schema: `src/env.ts` (fail-fast obrigatório per `.claude/CLAUDE.md`).
- [migration-rollback.md](./migration-rollback.md).
- [db-down.md](./db-down.md) (caso adjacente).
- Débito #93 em [debts.md](../improvements/debts.md).
