# Deploy Gate — PRD #3 Schema FK + NOT NULL + drop deletedBy (PRD #3 PR)

Operational runbook for the merge/deploy of migration `0042_audit_fk_not_null.sql`.
Execution owner: the person merging the PRD #3 PR. Evidence owner: the same person, captured in
the PR description or a pinned comment.

This gate is mandatory. Skipping any check aborts the deploy and fails PRD #3.

---

## Scope

- Migration: `src/db/migrations/0042_audit_fk_not_null.sql` — 48 FK constraints added via
  `NOT VALID + VALIDATE CONSTRAINT` (26 `created_by` + 22 `updated_by`) across 26 tables, plus
  `ALTER COLUMN ... SET NOT NULL` on the same 48 columns and `DROP COLUMN deleted_by` on 24
  tables. PRD #1 already populated `audit_logs` with deletion attribution — that is now the
  authoritative source.
- Data baseline on production (2026-04-21): 930 populated audit references, 0 orphans (from
  the PRD #1 deploy gate). Same baseline still applies for the pre-deploy `orphan-audit-pre.sql`
  because that script's UNION still includes `deleted_by` populated rows; pre-deploy must show
  zero orphans on those too because the column is being dropped immediately after.
- Audit scripts (read-only, transaction rolls back):
  - `.compozy/tasks/audit-fk-not-null/scripts/null-audit.sql` — counts `created_by IS NULL`
    and `updated_by IS NULL` per table. Gates `ALTER COLUMN ... SET NOT NULL`.
  - `.compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql` — orphan check on
    populated audit columns including `deleted_by`. Gates `VALIDATE CONSTRAINT`.
  - `.compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql` — orphan check after
    deploy (no `deleted_by` UNION lines because the column was dropped).
- Related ADR: `adrs/adr-004.md` — documents the atomic abort behavior if `VALIDATE` fails.

---

## Timeline

| Step | When | Action | Artifact |
|------|------|--------|----------|
| G1 | ≤24h before merging PRD #3 PR | Run NULL audit + orphan-audit-pre against production | Output pasted into PR |
| G2 | Immediately before merge | Snapshot 7-day baseline metrics (5xx, p95, DB CPU) | Link or screenshot in PR |
| G3 | Immediately after migration applies | Run orphan-audit-post against production | Output pasted into PR |
| G4 | 24h post-deploy | Re-check 5xx, p95, DB CPU; note any deviation | Note in PR |
| G5 | 48h post-deploy | Re-check the same three metrics; close the gate | Final status in PR |

If any of G1, G3, G4, G5 fails, see **Failure Actions** below.

---

## G1 — Pre-deploy NULL + orphan audits

Run within 24 hours of merging the PRD #3 PR. Earlier runs (e.g. the 2026-04-21 baseline) do not
count for G1 because new NULL/orphan rows could have appeared in the interval.

**G1.a — NULL audit (gates `ALTER COLUMN ... SET NOT NULL`)**

```bash
psql "$PROD_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/null-audit.sql
```

Expected output:

- `Per-table NULL counts`: every row reports `created_by_nulls = 0` and `updated_by_nulls = 0`
  (or `NULL` for the 4 tables without `updated_by`: `ppe_delivery_logs`, `ppe_delivery_items`,
  `ppe_job_positions`, `project_employees`).
- `Totals`: `total_created_by_nulls = 0`, `total_updated_by_nulls = 0`.

Fail (any non-zero NULL count): abort the merge. The migration's `ALTER COLUMN ... SET NOT NULL`
would fail at runtime if any row has the audit column NULL. Document the finding plus the
backfill SQL applied in the PR description under a new section **G1 NULL backfill**, then
re-run G1.a until both totals are zero.

**G1.b — Orphan audit (gates `VALIDATE CONSTRAINT`)**

```bash
psql "$PROD_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql
```

Expected output:

- `Per-column summary`: each reported row has `orphan_count = 0`.
- `Orphan detail`: `(0 rows)`.
- `Totals`: `total_refs ≥ 930`, `total_orphans = 0`.

Pass (both G1.a and G1.b): paste the result sets into the PR description under the section
**G1 Pre-deploy audits**. Include the UTC timestamps.

Fail (`total_orphans > 0`): abort the merge. Do not override. `VALIDATE CONSTRAINT` would fail
during the migration transaction and the deploy would roll back atomically, but catching the
problem here avoids a noisy failed-deploy event. Route to **Failure Actions**.

---

## G2 — Pre-deploy metrics baseline

Capture a 7-day pre-deploy baseline for:

- **5xx error rate** across the API (or at minimum the 26 affected modules' endpoints).
- **p95 request latency** on the same scope.
- **Database CPU utilization** on the primary.

Source: the project's existing observability stack (whichever dashboard already renders these
three metrics — no new alerting is introduced by this PR).

Pass: link or screenshot pasted into PR description under **G2 Baseline metrics (7-day)**, with
the capture timestamp and the rolling-window end.

Fail: if the metrics cannot be captured (dashboard outage, vendor issue), postpone the merge
until they can. Phase 1 success criteria require before/after comparison; merging without a
baseline forfeits that.

---

## G3 — Post-deploy orphan audit

Run immediately after the migration finishes applying (watch the deploy pipeline for Drizzle's
per-statement logs; once the last `DROP COLUMN deleted_by` logs complete, run this).

```bash
psql "$PROD_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql
```

Note: `orphan-audit-post.sql` omits the `deleted_by` UNION lines because the column was dropped
by the migration. Running `orphan-audit-pre.sql` post-deploy would error on the missing columns.

Expected output: identical shape to G1.b but with lower `total_refs` (24 tables × `deleted_by`
share excluded). `total_orphans = 0`.

Pass: paste the three result sets into the PR description under **G3 Post-deploy orphan audit**
with the UTC timestamp.

Fail: anything other than `total_orphans = 0` is an incident. The migration should have aborted
atomically if `VALIDATE` failed, so a non-zero post-deploy count implies either a partial apply
(escalate to DB infra immediately) or a race during the deploy window (exceedingly unlikely).
Route to **Failure Actions**.

---

## G4 — 24-hour metrics check

At +24h from the deploy completing, compare the same three metrics against the G2 baseline.

- 5xx rate deviation from baseline: threshold **≤ +10%**.
- p95 latency deviation from baseline: threshold **≤ +10%**.
- DB CPU deviation from baseline: threshold **≤ +10%**.

Pass: note the observed values and deltas in the PR description under **G4 24h check**.

Fail (any metric exceeds +10% deviation): open an incident ticket, link it from the PR, and
proceed to **Failure Actions**. PRD #4 (cost-centers pilot of `auditUserAliases()` adoption)
cannot start until this clears.

---

## G5 — 48-hour metrics check

At +48h from the deploy, repeat the same comparison. Same thresholds as G4.

Pass: record values + deltas under **G5 48h check — GATE CLEARED**. PRD #4 is unblocked.

Fail: same as G4.

---

## Failure Actions

The migration is designed to fail atomically (ADR-004): if `VALIDATE CONSTRAINT` encounters an
orphan, the entire transaction rolls back and the schema is untouched. So a G1 or G3 orphan
result never causes a partial state by itself — but it does gate the deploy.

On any failure:

1. Halt further PRD #3 merges. Record the failing output in the PR.
2. Decide between the three responses:
   - **Data-clean**: if the orphan(s) can be triaged to a known bug or a hard-deleted test user
     that should not exist in prod, write a targeted data-cleanup migration (separate PR) that
     sets the offending audit columns to a real user (or `NULL` for `deleted_by`, which is being
     dropped anyway). Re-run G1 after the cleanup is deployed; merge the PRD #3 PR only after
     G1.a and G1.b are both green.
   - **Schema-correct but data-legitimate**: extremely unlikely. If an orphan is a real user
     that was hard-deleted outside the Better Auth flow, open an incident and loop in security
     before any cleanup. Do not merge the PRD #3 PR until resolved. Rollback strategy if a
     post-deploy regression requires reverting: `0043_revert_audit_fk.sql` with
     `ALTER TABLE ... DROP CONSTRAINT ...` for each of the 48 FK constraints + `ALTER TABLE
     ... ADD COLUMN deleted_by text` for each of the 24 tables (no `NOT NULL` — historical
     `deleted_by` values were destroyed by `DROP COLUMN` and cannot be recovered; see Rollback
     considerations below).
   - **Metrics regression (G4/G5)**: open an incident, do not start PRD #4, investigate root
     cause. Rollback only if the regression is traced to FK enforcement and no data-side fix is
     viable.
3. Document the failure and the chosen response as a new entry in the PR description under
   **Incidents during gate**.

---

## PR description — evidence template

Copy this block into the PRD #3 PR description. Replace placeholders as each gate step clears.

```markdown
## PRD #3 Deploy Gate — evidence

### G1 Pre-deploy audits

#### NULL audit
- Run at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- Operator: <handle>
- Per-table summary: <link to gist or paste — every row should be 0/0 (or 0/NULL)>
- Total: total_created_by_nulls = 0, total_updated_by_nulls = 0 ✅

#### Orphan audit (pre-deploy)
- Run at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- Operator: <handle>
- Result: total_refs = <N>, total_orphans = 0 ✅
- Per-column summary: <link to gist or paste>
- Orphan detail: (0 rows) ✅

#### NULL backfill (only if G1 NULL audit reported any non-zero count)
- Backfill SQL applied: <link or paste>
- Re-run NULL audit result: total_created_by_nulls = 0, total_updated_by_nulls = 0 ✅

### G2 Baseline metrics (7-day pre-deploy)

- Captured at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- 7-day window: <start> → <end>
- 5xx rate baseline: <value>
- p95 latency baseline: <value>
- DB CPU baseline: <value>
- Dashboard: <link>

### Frontend contract verification

- Frontend repo: <path / commit>
- Manual `deletedBy`/`deleted_by` matches outside generated code: <count + file:line list>
- Status: <CLEAR / BLOCKED — describe required frontend change>

### G3 Post-deploy orphan audit

- Run at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- Script: orphan-audit-post.sql (no `deleted_by` UNION lines)
- Result: total_refs = <N>, total_orphans = 0 ✅
- Orphan detail: (0 rows) ✅

### G4 24h check (T+24h from deploy)

- Checked at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- 5xx rate: <value> (Δ <±%> vs baseline) <✅/❌>
- p95 latency: <value> (Δ <±%> vs baseline) <✅/❌>
- DB CPU: <value> (Δ <±%> vs baseline) <✅/❌>
- Threshold: ±10%

### G5 48h check — GATE CLEARED

- Checked at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- 5xx rate: <value> (Δ <±%> vs baseline) <✅/❌>
- p95 latency: <value> (Δ <±%> vs baseline) <✅/❌>
- DB CPU: <value> (Δ <±%> vs baseline) <✅/❌>
- PRD #4 unblocked: <YES/NO>

### Incidents during gate

<List any failure, decision, and resolution, or "None.">
```

---

## References

- Plan: `docs/improvements/2026-04-28-prd-3-schema-fk-not-null-plan.md`
- Design doc: `docs/improvements/2026-04-27-user-attribution-roadmap-design.md`
- ADR-004: `adrs/adr-004.md` — migration atomic-abort behavior
- Predecessor gate: `.compozy/tasks/audit-coverage-expansion/` (PRD #1 G1-G5 evidence)

---

## Rollback considerations

Esta migration faz `DROP COLUMN deleted_by` em 24 tabelas. Rollback restaura o schema
(`ALTER TABLE ... ADD COLUMN deleted_by text`) mas **NÃO** restaura valores históricos —
eles eram a única fonte da informação e foram destruídos pelo DROP COLUMN.

Implicações:

- Após T+0 do deploy, deletion attribution para todo soft-delete histórico passa a ser
  exclusivamente via `audit_logs` (populado por PRD #1).
- Após T+24h sem incidente operacional, considere o rollback como destrutivo de auditoria:
  re-adicionar a coluna não recupera nada, e qualquer linha que tenha sido soft-deletada
  no período T+0..T+24h passa a ter `deleted_by IS NULL` na coluna re-adicionada.
  **Forward fix é preferível.**
- O rollback mantém-se necessário apenas para casos de regressão funcional (ex.: query
  em prod ainda referenciando `deleted_by`). Se a regressão for puramente de schema
  (FK constraint causando insert failure), prefira ajustar a aplicação a desfazer a
  migration.
