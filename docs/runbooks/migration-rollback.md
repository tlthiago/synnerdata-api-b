# Migration Rollback — Runbook

> Migration do Drizzle quebrou deploy; app não sobe ou schema está em estado inválido. Cobre débitos #90 (scale) e #91 (rollback não documentado).

## Sintomas

- Deploy falhou com erro durante `bun run src/db/migrate.ts` em `scripts/entrypoint.sh`.
- App entra em `restarting` loop (Coolify mostra container reiniciando).
- Logs do container mostram erro SQL: coluna duplicada, constraint violation, syntax error, migration hash mismatch.
- Em casos piores: schema parcialmente alterado (migration começou mas não terminou).

## Diagnóstico rápido (≤ 5 min)

1. Identificar qual migration quebrou — Coolify → `app` → Logs → buscar primeira ocorrência de erro Drizzle.
2. Conectar no DB (Coolify → `postgresql-production` → Terminal):
   ```sql
   SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 10;
   ```
3. Comparar hashes/timestamps com `src/db/migrations/*.sql` no branch que foi deployado.
4. Classificar o estado:
   - **A** — Migration registered in `__drizzle_migrations` mas schema inválido (migration parcial).
   - **B** — Migration NOT registered, mas parte do schema já foi alterado (transação não completou; raro mas possível se DDL sem transaction wrap).
   - **C** — Schema destruído (migration tentou `DROP TABLE` sem backup).

## Procedimento de recuperação

**Caminho A — Migration parcial, schema em estado inválido:**
1. Conectar no DB via Coolify Terminal.
2. Reverter manualmente a parte que foi aplicada:
   ```sql
   -- exemplos:
   ALTER TABLE <tabela> DROP COLUMN <coluna>;
   DROP INDEX IF EXISTS <indice>;
   ALTER TABLE <tabela> DROP CONSTRAINT IF EXISTS <constraint>;
   ```
3. Remover registro em `__drizzle_migrations`:
   ```sql
   DELETE FROM __drizzle_migrations WHERE id = <id-da-migration>;
   ```
4. Coolify → `app` → `Deployments` → rollback para commit anterior (sem a migration quebrada).
5. Validar que app subiu: `curl .../health`.

**Caminho B — Migration corrupt no registry, schema ok:**
1. `DELETE FROM __drizzle_migrations WHERE hash = '<hash-quebrado>';`.
2. Corrigir arquivo da migration em branch nova.
3. Commit + deploy.

**Caminho C — Schema destruído:**
1. Parar app imediatamente: Coolify → `app` → `Stop` (evita writes em schema inválido).
2. Restore do backup imediatamente anterior ao deploy: [database-backup.md § Procedimento de restore](./database-backup.md#procedimento-de-restore).
3. Após restore, cherry-pick os commits aplicativos (sem a migration destrutiva) e redeploy.
4. Investigar a migration offline; só reintroduzir com revisão adicional e teste em staging.

## Nota sobre escala (débito #90)

> **Hoje**: 1 instância da API — sem race condition em migration.
>
> **Quando escalar horizontalmente** (2+ instâncias): este modelo quebra. Instâncias competindo pelo lock do `__drizzle_migrations` podem travar o deploy ou aplicar migration 2×.
>
> **Correção futura**: mover migration para job one-shot (Coolify pre-deploy hook dedicado ou Kubernetes Job separado quando migrar de orchestrator). Não investir antes do sinal de escala.

## Comunicação

- Deploy quebrado = API fora até rollback completar.
- **Avisar cliente em ≤ 15 min** se rollback não completou.
- Mensagem: "Estamos revertendo um deploy com problema. Serviço voltará em X min."

## Post-incident

- Postmortem obrigatório.
- Toda migration deve passar por staging antes de merge — se não passou, registrar como lição em `docs/improvements/principles.md` e considerar gating via CI.
- Se Caminho C foi acionado: revisar política de migrations destrutivas (nunca `DROP` sem plano explícito e backup confirmado minutos antes).

## Referências

- Entrypoint: `scripts/entrypoint.sh`.
- Migration runner: `src/db/migrate.ts`.
- Migrations SQL: `src/db/migrations/`.
- Drizzle docs: <https://orm.drizzle.team/docs/migrations>.
- [database-backup.md § Procedimento de restore](./database-backup.md#procedimento-de-restore).
- Débitos #90, #91 em [debts.md](../improvements/debts.md).
