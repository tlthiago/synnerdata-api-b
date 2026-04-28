# Database Backup — Coolify + Cloudflare R2

Runbook do processo de backup do Postgres em produção. Gerenciado pelo Coolify (UI) com storage dual — disco local do servidor + Cloudflare R2 (S3-compatible).

Cobre débito #92 do [catálogo de débitos](../improvements/debts.md) (iniciativa de melhorias da API — [README](../improvements/README.md)) e serve como evidência operacional para LGPD (Art. 41 — capacidade de reconstituir dados em caso de incidente).

## Estado atual

Configuração validada em 2026-04-22 via Coolify v4.0.0-beta.460 → `synnerdata/production/postgresql-production/Backups`.

| Eixo | Valor | Observação |
|---|---|---|
| Backup habilitado | ✅ Sim | Agendamento automático ativo |
| Database alvo | `synnerdata` | Apenas a DB da aplicação (não "Backup All Databases") |
| Frequência | `daily` | Dispara diariamente |
| Timezone | UTC | Horário de execução: **00:00 UTC** (≈ 21:00 BRT dia anterior) |
| Timeout | 3600s (1h) | Dump + upload devem completar dentro disso |
| Storage local | ✅ Habilitado | `/data/coolify/backups/databases/root-team-0/postgresql-production-<id>/` |
| Storage S3 | ✅ Habilitado | Cloudflare R2 (credentials em Coolify → S3 Storages) |
| Retention local | 7 backups / 7 dias / 2 GB | Ajustado em 2026-04-22 (CP-45 resolvido). Whichever limit hits first triggers cleanup |
| Retention S3 (R2) | 30 backups / 30 dias / 8 GB | Whichever limit hits first triggers cleanup |
| Formato do dump | `pg_dump` (.dmp) | Arquivo nome: `pg-dump-synnerdata-<timestamp>.dmp` |

Tamanho típico do dump (abril/2026): ~310 KB (base com 1 cliente ativo). Esperar crescimento conforme base de funcionários aumenta.

## Como verificar que os backups estão rodando

1. Coolify UI → `Projects` → `production` → `postgresql-production`.
2. Aba `Backups`.
3. Seção `Executions`: lista paginada de todas as runs, mais recentes no topo.
4. Um backup saudável tem:
   - Status `Success`
   - Duração < 1min para a base atual
   - Linha `Backup Availability: Local Storage ✅ · S3 Storage ✅`
   - Botão `Download` funcional

**Sinais de alerta** que requerem investigação imediata:
- `Failed` em qualquer execution (veja `Logs` do container postgresql-production).
- Ausência de execution no último período de 36h (cron do Coolify não rodou).
- `Local Storage ✅ · S3 Storage ❌` — R2 upload falhou; backup local existe mas sem cópia off-site.
- Size súbito de 0 KB ou muito menor que a média → dump pode estar corrompido.

Se houver falha consecutiva em ≥ 2 backups diários, acionar o dono imediatamente.

## Procedimento de restore

**Premissas**: você tem acesso à UI do Coolify. Para o caminho manual (B), também precisa de acesso SSH ao servidor Coolify e credenciais do Postgres.

### Caminho A — Restore via UI do Coolify (recomendado para incidentes típicos)

1. Identificar qual backup restaurar:
   - UI → Backups → Executions → localizar a run desejada (mais próxima do momento antes do incidente).
   - Clicar `Download` — baixa o arquivo `.dmp` para sua máquina.
2. Provisionar um **Postgres temporário** para staging do restore:
   - Coolify → `Projects` → `production` → `+ New` → `Database` → Postgres.
   - Nomear como `postgresql-restore-staging-<data>`.
   - Usar mesma versão de Postgres do produção (`postgres:17-alpine`).
3. Carregar o dump no staging:
   - Coolify → o novo DB → Terminal.
   - `pg_restore -U postgres -d <db_name> --no-owner --no-acl /tmp/dump.dmp` (upload prévio do dump pro container via `docker cp`).
4. **Smoke test** no staging antes de promover:
   - Rodar queries de sanity (ver [§ Teste periódico](#teste-periódico-trimestral) para lista).
   - Validar contagens esperadas (organizations, employees, subscriptions ativas).
5. Decidir a estratégia de swap:
   - **Se a base de produção sobrevive**: aplicar dump seletivo (apenas tabelas/linhas afetadas) via `psql` no staging → exportar patch → aplicar em produção com transaction wrapping.
   - **Se a base de produção está totalmente corrompida**: parar o container `postgresql-production`, renomear volume, promover staging para produção atualizando env vars da API (`DATABASE_URL`) via Coolify → `app` → Environment Variables.
6. Após swap, **não descartar o staging por 48h** — serve como failback.

### Caminho B — Restore direto via `pg_restore` (offline, recuperação avançada)

Usar quando UI do Coolify está inacessível ou quando precisa restaurar em ambiente isolado.

1. SSH no servidor Coolify.
2. Localizar o dump local mais recente:
   ```bash
   ls -laht /data/coolify/backups/databases/root-team-0/postgresql-production-*/pg-dump-synnerdata-*.dmp | head -5
   ```
3. Alternativa — baixar do R2 (se local está inacessível):
   ```bash
   # credenciais em Coolify → S3 Storages → Cloudflare R2 (mostra accessKey/secretKey/endpoint)
   aws s3 ls s3://<bucket>/ --endpoint-url <r2-endpoint>
   aws s3 cp s3://<bucket>/<key> ./restore.dmp --endpoint-url <r2-endpoint>
   ```
4. Restaurar num Postgres isolado (não produção):
   ```bash
   docker run --rm -d --name pg-restore \
     -e POSTGRES_PASSWORD=restore \
     -p 5433:5432 \
     postgres:17-alpine
   docker cp /path/to/dump.dmp pg-restore:/tmp/
   docker exec pg-restore createdb -U postgres synnerdata_restore
   docker exec pg-restore pg_restore -U postgres -d synnerdata_restore --no-owner --no-acl /tmp/dump.dmp
   ```
5. Smoke test (ver [§ Teste periódico](#teste-periódico-trimestral)).
6. Se a decisão for promover, seguir passos 5-6 do caminho A.

### Pontos de atenção no restore

- **`--no-owner --no-acl`**: importante para evitar erros de permissão quando o dump foi tirado por um user diferente do de restore.
- **Extensions**: o dump inclui `CREATE EXTENSION` para as extensões necessárias. Se restore falhar por missing extension, verificar que o Postgres de destino tem os pacotes instalados.
- **Migrations futuras**: se o dump é antigo, talvez não tenha o schema mais novo. Após restore, rodar `bun run db:migrate` para aplicar migrations pendentes antes de promover.
- **Conexões ativas**: antes de swap de produção, parar a API (Coolify → app → Stop) para evitar writes concorrentes no DB antigo.

## Teste periódico trimestral

Cadência recomendada: **a cada 3 meses**. Agendar no calendário do dono do projeto. Objetivo: provar que backups são restauráveis antes do primeiro incidente real.

**Checklist do teste** (preencher uma cópia a cada execução):

- [ ] Data do teste: ____________________
- [ ] Responsável: ____________________
- [ ] Backup utilizado (execution timestamp): ____________________
- [ ] Tamanho do dump (KB): ____________________
- [ ] Origem (Local / R2): ____________________
- [ ] Ambiente de restore (Postgres temporário — container local ou staging): ____________________
- [ ] **Queries de sanity** executadas com sucesso:
  - [ ] `SELECT count(*) FROM organizations` → valor esperado ≈ ____ (compara com prod)
  - [ ] `SELECT count(*) FROM employees WHERE deleted_at IS NULL` → valor esperado ≈ ____
  - [ ] `SELECT count(*) FROM org_subscriptions WHERE status = 'active'` → valor esperado ≈ ____
  - [ ] `SELECT max(created_at) FROM audit_logs` → deve estar ≤ timestamp do backup + 24h
  - [ ] `SELECT count(*) FROM medical_certificates` → valor esperado ≈ ____
- [ ] Tempo total do restore: ____________________
- [ ] Anomalias encontradas: ____________________
- [ ] Staging descartado após teste: [ ] sim / [ ] não
- [ ] Resultado: [ ] ✅ sucesso / [ ] ⚠️ sucesso com ressalvas / [ ] ❌ falhou

**Se falhar**: abrir incidente no repo, escalar ao dono, priorizar correção imediata — backup que não restaura não é backup.

**Registrar execuções** neste arquivo (histórico acumulado):

| Data | Responsável | Resultado | Ressalvas |
|---|---|---|---|
| _primeira execução pendente_ | — | — | — |

## Retention policy

Política em vigor desde 2026-04-22 (CP-45 resolvido):

| Storage | Backups | Dias | Max GB | Papel |
|---|---|---|---|---|
| Local (`/data/coolify/backups/...`) | 7 | 7 | 2 | Restore rápido (sem egress do R2) nos últimos 7 dias |
| S3 (Cloudflare R2) | 30 | 30 | 8 | Fonte de verdade off-site, long-term |

O Coolify aplica as três regras independentemente — o primeiro limite atingido dispara cleanup. Onde ajustar: Coolify → `postgresql-production` → `Backups` → `Backup Retention Settings`.

## Contatos e escalação

| Função | Quem | Quando acionar |
|---|---|---|
| Dono do sistema | _____________ | Falha consecutiva de backup, teste trimestral, restore real |
| Acesso ao Coolify | _____________ | Precisa executar restore via UI |
| Acesso SSH ao servidor | _____________ | Recuperação offline (caminho B) |
| Contato Cloudflare R2 (billing/quota) | _____________ | Quota de R2 estourou ou problema com bucket |

_Preencher os campos acima com os contatos/logins reais antes da primeira execução do teste trimestral._

## Referências

- [Coolify — Backup documentation](https://coolify.io/docs/databases/backups)
- [Postgres pg_restore man page](https://www.postgresql.org/docs/current/app-pgrestore.html)
- [Cloudflare R2 — S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/)
- Débito #92 em [`docs/improvements/debts.md`](../improvements/debts.md)
