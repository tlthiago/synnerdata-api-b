# PRD #3 — Schema FK + NOT NULL + Drop `deletedBy` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Enforce referential integrity on `createdBy`/`updatedBy` across all 26 in-scope domain tables (NOT NULL + FK to `users.id` ON DELETE RESTRICT) and drop `deletedBy` columns now that PRD #1 made `audit_logs` the authoritative source for deletion attribution.

**Architecture:** A single Drizzle migration (`0042_audit_fk_not_null.sql`) executes, in order: (1) backfill `updated_by = created_by` where NULL on the 22 tables that have both; (2) `ALTER COLUMN ... SET NOT NULL` on 48 columns (26 `createdBy` + 22 `updatedBy`) — gated pre-merge by two pre-deploy scripts: `null-audit.sql` confirms zero `created_by IS NULL` / `updated_by IS NULL` and `orphan-audit-pre.sql` confirms zero FK orphans on populated values; (3) `ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES users(id) ON DELETE RESTRICT NOT VALID` then `VALIDATE CONSTRAINT` on each (48 constraints — pattern proven safe in PR #252's design); (4) `DROP COLUMN deleted_by` on the 24 tables that have it. Application code is updated in two waves: per-module mechanical refactors (parallelizable across 26 tables) update `src/db/schema/*.ts`, services, models, and module CLAUDE.md files in lock-step before generating the migration; a small foundation wave creates the `auditUserAliases()` helper, audits test fixtures, and cherry-picks the audit/deploy-gate artifacts from the closed PR #252.

**Tech Stack:** Bun + Elysia + Drizzle + PostgreSQL. Migrations under `src/db/migrations/`. Schema declarations under `src/db/schema/`. Helper at `src/lib/schemas/audit-users.ts`. Reference module: `src/modules/occurrences/absences/` (canonical Drizzle Core + inline `select()` style).

**Pre-requisites (do not start until cleared):**

- PRD #1 (Audit Coverage Expansion) merged via PR #296 on 2026-04-27 and stable in production. Confirmed via `git log --oneline main` showing commit `e0949b1` as merge of `feat/audit-coverage-expansion`. `audit_logs` is the authoritative deletion-attribution source for every in-scope module — without this, dropping `deletedBy` would silently lose deletion authorship.
- PRD #2 PR 2 (T08 cleanup of Better Auth `deleteUser`) merged to `main` and stable in production for ≥ 48h. The G5 monitoring window in PRD #1 must also be closed (FK migration in this plan reuses the same gate pattern; confirm prior gate is green before adding new constraints).

---

## Decisões vinculantes (do design doc 2026-04-27 — não re-litigar)

These were settled by `docs/improvements/2026-04-27-user-attribution-roadmap-design.md`. Reopening any of them reopens that document.

- Drizzle Core API + inline `select()` + `aliasedTable` for self-joins to `users`. **NOT** the Relational API + `with`. Aligns with `absences` style.
- Reuse `entityReferenceSchema` from `src/lib/schemas/relationships.ts`. Do **not** create a new `auditUserSchema`.
- **No `relations()` blocks** added for audit users in `src/db/schema/*.ts` (Core query style does not consult them).
- Schema convention: `createdBy` and `updatedBy` are `text(...).notNull().references(() => users.id, { onDelete: "restrict" })`. `deletedBy` is removed entirely from domain tables.
- **Semantic A** for `updatedBy`: populated on `INSERT` (= `userId`, equal to `createdBy` initially) **and** on `UPDATE`. Already documented in root `.claude/CLAUDE.md` "Timestamps convention".
- One migration consolidating all changes. `NOT VALID + VALIDATE CONSTRAINT` pattern.
- Helper minimal: `auditUserAliases()` only encapsulates the two `aliasedTable` calls.

---

## Reference: canonical patterns

Read this section once before starting any per-module task — every per-module task replicates it.

### A) Schema declaration (`src/db/schema/<table>.ts`)

**Before** (current — example from `cost-centers.ts:20-23`):

```ts
createdBy: text("created_by"),
updatedBy: text("updated_by"),
deletedAt: timestamp("deleted_at", { withTimezone: true }),
deletedBy: text("deleted_by"),
```

**After**:

```ts
createdBy: text("created_by")
  .notNull()
  .references(() => users.id, { onDelete: "restrict" }),
updatedBy: text("updated_by")
  .notNull()
  .references(() => users.id, { onDelete: "restrict" }),
deletedAt: timestamp("deleted_at", { withTimezone: true }),
// deletedBy removed
```

The `users` import comes from `./auth` (already imported in most schema files for `organizations`/`users` references; add the import if missing).

For tables that lack `updatedBy` (4 tables: `ppe_delivery_logs`, `ppe_delivery_items`, `ppe_job_positions`, `project_employees`), only the `createdBy` clause changes; do not add `updatedBy`. For tables without `deletedBy` (2 tables: `features`, `ppe_delivery_logs`), there is no `deletedBy` line to remove — only the createdBy/updatedBy NOT NULL+FK changes apply.

### B) Service mutations (`src/modules/**/<name>.service.ts`)

The `delete` method currently sets `deletedBy: userId` alongside `deletedAt: new Date()`. Remove that line. The audit_logs entry written by `AuditService.log({ action: "delete", ... })` is the new authoritative deletion attribution.

**Before** (example from `src/modules/occurrences/absences/absence.service.ts:367-371`):

```ts
const [deleted] = await db
  .update(schema.absences)
  .set({
    deletedAt: new Date(),
    deletedBy: userId,
  })
  ...
```

**After**:

```ts
const [deleted] = await db
  .update(schema.absences)
  .set({
    deletedAt: new Date(),
  })
  ...
```

If the same service references `deletedBy` in a `findByIdIncludingDeleted` SELECT projection (absences does, line 90), drop that key from the SELECT and from the function's return type. The `userId` parameter on `delete(...)` stays — it is still used by `AuditService.log`.

### C) Model response Zod (`src/modules/**/<name>.model.ts`)

Remove the `deletedBy: z.string().nullable().describe(...)` field from the data schema. Keep `deletedAt` (the timestamp; non-null on a deleted resource) — only the `deletedBy` field is removed because the column no longer exists. Verify no Zod `.pick()` / `.omit()` chains depend on the removed key.

**Before** (example from `cost-center.model.ts:28`):

```ts
deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
```

**After**: line removed.

### D) Module CLAUDE.md

Several module CLAUDE.md files mention `deletedBy` in convention sections (e.g., `src/modules/occurrences/CLAUDE.md` "Audit trail: createdBy, updatedBy, deletedBy"). Update those mentions to drop `deletedBy` and reference `audit_logs` as the deletion attribution source. The exact text per module is given inline in each module task.

### E) Migration generation + hand-tune

Drizzle's `bun run db:generate` will produce ALTER statements from the schema diff, but it generates `ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES users(id) ON DELETE RESTRICT` as a single atomic statement that validates immediately and takes a strong lock on the table for the duration of the validation scan. Production safety requires the **NOT VALID + VALIDATE CONSTRAINT** split:

- `ALTER TABLE x ADD CONSTRAINT x_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;` — instantaneous, takes a brief AccessExclusiveLock to add the metadata, but does NOT scan the table.
- `ALTER TABLE x VALIDATE CONSTRAINT x_created_by_users_id_fk;` — scans the table under a ShareUpdateExclusiveLock (allows reads + writes); aborts atomically and rolls back the ADD CONSTRAINT if any row violates.

The hand-tune step (Task 28) re-shapes the auto-generated SQL into this split, plus prepends backfill UPDATEs (Drizzle does not emit data backfill).

---

## File structure — files this plan creates or modifies

### Created

- `docs/improvements/2026-04-28-prd-3-schema-fk-not-null-plan.md` — this file
- `src/lib/schemas/audit-users.ts` — `auditUserAliases()` helper
- `src/lib/schemas/__tests__/audit-users.test.ts` — helper unit tests
- `src/db/migrations/0042_audit_fk_not_null.sql` — generated by Drizzle, then hand-tuned
- `src/db/migrations/meta/0042_snapshot.json` — generated by Drizzle (do not edit)
- `.compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql` — cherry-pick from PR #252 worktree (pré-0042 schema)
- `.compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql` — fork de pre, sem `deleted_by` UNION lines (pós-0042 schema)
- `.compozy/tasks/audit-fk-not-null/scripts/null-audit.sql` — NEW, conta `created_by IS NULL` / `updated_by IS NULL` por tabela
- `.compozy/tasks/audit-fk-not-null/deploy-gate.md` — adapted from PR #252 worktree, com seção "Rollback considerations" appended

### Modified

**Schema (26 files in `src/db/schema/`)**: `absences.ts`, `accidents.ts`, `admin-org-provisions.ts`, `billing-profiles.ts`, `branches.ts`, `cost-centers.ts`, `cpf-analyses.ts`, `employees.ts`, `job-classifications.ts`, `job-positions.ts`, `labor-lawsuits.ts`, `medical-certificates.ts`, `organization-profiles.ts`, `payments.ts` (only the `features` table inside it), `ppe-deliveries.ts`, `ppe-delivery-items.ts`, `ppe-delivery-logs.ts`, `ppe-items.ts`, `ppe-job-positions.ts`, `project-employees.ts`, `projects.ts`, `promotions.ts`, `sectors.ts`, `terminations.ts`, `vacations.ts`, `warnings.ts`

**Services that strip `deletedBy: userId` from soft-delete (19 files)**: `absence`, `accident`, `admin-provision`, `branch`, `cost-center`, `cpf-analysis`, `employee`, `job-classification`, `job-position`, `labor-lawsuit`, `medical-certificates`, `ppe-delivery`, `ppe-item`, `project`, `promotion`, `sector`, `termination`, `vacation`, `warning`

**Models that drop `deletedBy` from response Zod (18 files)**: `absence.model.ts`, `accident.model.ts`, `branch.model.ts`, `cost-center.model.ts`, `cpf-analysis.model.ts`, `employee.model.ts`, `job-classification.model.ts`, `job-position.model.ts`, `labor-lawsuit.model.ts`, `medical-certificates.model.ts`, `ppe-delivery.model.ts`, `ppe-item.model.ts`, `project.model.ts`, `promotion.model.ts`, `sector.model.ts`, `termination.model.ts`, `vacation.model.ts`, `warning.model.ts`

**Audit module**: `src/modules/audit/pii-redaction.ts` (remove `"deletedBy"` from `IGNORED_AUDIT_FIELDS`), `src/modules/audit/__tests__/pii-redaction.test.ts` (drop the assertion), `src/modules/audit/CLAUDE.md` ("Campos metadata ignorados" line)

**Documentation**: `.claude/CLAUDE.md` (root — update "Soft deletes" + "Timestamps convention" sections), `src/modules/CLAUDE.md` (note new convention if applicable), `src/modules/occurrences/CLAUDE.md` ("Audit trail" line), and per-module `CLAUDE.md` files where `deletedBy` is mentioned (≤ 12 files).

### Per-table audit-column matrix (26 tables)

| # | Table | createdBy | updatedBy | deletedBy | Owning module |
|---|---|---|---|---|---|
| 1 | absences | ✓ | ✓ | ✓ | occurrences/absences |
| 2 | accidents | ✓ | ✓ | ✓ | occurrences/accidents |
| 3 | admin_org_provisions | ✓ | ✓ | ✓ | payments/admin-provision |
| 4 | billing_profiles | ✓ | ✓ | ✓ | payments/billing |
| 5 | branches | ✓ | ✓ | ✓ | organizations/branches |
| 6 | cost_centers | ✓ | ✓ | ✓ | organizations/cost-centers |
| 7 | cpf_analyses | ✓ | ✓ | ✓ | occurrences/cpf-analyses |
| 8 | employees | ✓ | ✓ | ✓ | employees |
| 9 | features | ✓ | ✓ | — | payments (features sub-resource) |
| 10 | job_classifications | ✓ | ✓ | ✓ | organizations/job-classifications |
| 11 | job_positions | ✓ | ✓ | ✓ | organizations/job-positions |
| 12 | labor_lawsuits | ✓ | ✓ | ✓ | occurrences/labor-lawsuits |
| 13 | medical_certificates | ✓ | ✓ | ✓ | occurrences/medical-certificates |
| 14 | organization_profiles | ✓ | ✓ | ✓ | organizations/profile |
| 15 | ppe_deliveries | ✓ | ✓ | ✓ | occurrences/ppe-deliveries |
| 16 | ppe_delivery_items | ✓ | — | ✓ | occurrences/ppe-deliveries (M2M) |
| 17 | ppe_delivery_logs | ✓ | — | — | occurrences/ppe-deliveries (audit log) |
| 18 | ppe_items | ✓ | ✓ | ✓ | organizations/ppe-items |
| 19 | ppe_job_positions | ✓ | — | ✓ | organizations/ppe-items (M2M) |
| 20 | project_employees | ✓ | — | ✓ | organizations/projects (M2M) |
| 21 | projects | ✓ | ✓ | ✓ | organizations/projects |
| 22 | promotions | ✓ | ✓ | ✓ | occurrences/promotions |
| 23 | sectors | ✓ | ✓ | ✓ | organizations/sectors |
| 24 | terminations | ✓ | ✓ | ✓ | occurrences/terminations |
| 25 | vacations | ✓ | ✓ | ✓ | occurrences/vacations |
| 26 | warnings | ✓ | ✓ | ✓ | occurrences/warnings |

Totals: 26 createdBy, 22 updatedBy, 24 deletedBy.

---

## Tasks

### Task 1: Cherry-pick + fork orphan audits, add NULL audit, adapt deploy gate

**Files:**
- Create: `.compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql` — forked from PR #252 worktree, schema state pré-0042 (still has `deleted_by` UNION lines)
- Create: `.compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql` — forked from pre, schema state pós-0042 (sem `deleted_by` UNION lines)
- Create: `.compozy/tasks/audit-fk-not-null/scripts/null-audit.sql` — NEW, counts `created_by IS NULL` / `updated_by IS NULL` per table
- Create: `.compozy/tasks/audit-fk-not-null/deploy-gate.md` — adapted from PR #252 worktree, including a new "Rollback considerations" section

The originating script and runbook were authored on the `feat/cost-centers-audit-user-info` worktree (PR #252, closed). They remain valid as starting points — this task forks them into the four production-safe artifacts above.

- [x] **Step 1: Generate `orphan-audit-pre.sql` (direct copy, used in G1 pre-deploy gate)**

```bash
mkdir -p .compozy/tasks/audit-fk-not-null/scripts
cp .worktrees/feat/cost-centers-audit-user-info/.compozy/tasks/audit-user-references/scripts/orphan-audit.sql \
   .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql
```

The script is read-only (wraps everything in `BEGIN; ... ROLLBACK;`) and unions `created_by`/`updated_by`/`deleted_by` populated rows across all 26 tables, then LEFT JOINs `users`. **Schema state assumed**: pre-migration 0042 — all 24 tables still have `deleted_by`. Expected output: `total_orphans = 0`. Any non-zero count is a hard deploy blocker. Update the script's header comment to call out that this version assumes pre-0042 schema.

- [x] **Step 2: Fork `orphan-audit-post.sql` removing the `deleted_by` UNION lines**

```bash
cp .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql \
   .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql
sed -i '/SELECT .*deleted_by .*FROM/d' .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql
```

Verify the result: the `CREATE TEMP VIEW` body should now contain only SELECTs for `created_by` (26 lines) and `updated_by` (22 lines) — total 48 SELECT lines in the UNION:

```bash
grep -c 'created_by FROM' .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql
# expected: 26
grep -c 'updated_by FROM' .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql
# expected: 22
grep -c 'deleted_by FROM' .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql
# expected: 0
```

Update the post-script's header comment to call out that this version assumes post-0042 schema (no `deleted_by` columns). It is used in G3 post-deploy verification (Task 32 Step 5) and in Task 30 Step 3 local verification.

- [x] **Step 3: Generate `null-audit.sql` (NEW — counts NULLs per table)**

Create `.compozy/tasks/audit-fk-not-null/scripts/null-audit.sql` with the same `BEGIN; ... ROLLBACK;` skeleton as orphan-audit, but the body is 26 UNIONed SELECTs (one per table) counting `created_by IS NULL` and `updated_by IS NULL`. Tables that lack `updated_by` (4 tables: `ppe_delivery_logs`, `ppe_delivery_items`, `ppe_job_positions`, `project_employees`) emit `NULL::bigint` for the `updated_by_nulls` column.

Template (the agent must literally enumerate all 26 tables — partial shown):

```sql
-- Pre-deploy NULL audit for createdBy/updatedBy across the 26 in-scope tables.
-- Source of truth: schema convention requires NOT NULL on every audit reference.
-- Migration 0042_audit_fk_not_null.sql will fail at ALTER COLUMN SET NOT NULL
-- if ANY row has created_by IS NULL or (for tables with updatedBy) updated_by IS NULL.
--
-- Expected output: every row has created_by_nulls = 0 AND updated_by_nulls = 0
-- (NULL for the 4 tables without updatedBy).
-- Any non-zero count blocks the merge until backfilled manually.
--
-- Re-run this script verbatim pre-deploy. Read-only — wrapped in BEGIN/ROLLBACK.

BEGIN;

\echo ''
\echo '=== Per-table NULL counts on createdBy/updatedBy ==='
SELECT 'absences' AS table_name,
       COUNT(*) FILTER (WHERE created_by IS NULL)::bigint AS created_by_nulls,
       COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint AS updated_by_nulls
FROM absences
UNION ALL SELECT 'accidents',
       COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
       COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
FROM accidents
UNION ALL SELECT 'admin_org_provisions',
       COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
       COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
FROM admin_org_provisions
-- ... continue for: billing_profiles, branches, cost_centers, cpf_analyses, employees, features,
--     job_classifications, job_positions, labor_lawsuits, medical_certificates, organization_profiles,
--     ppe_deliveries, ppe_items, projects, promotions, sectors, terminations, vacations, warnings.
-- For tables WITHOUT updated_by (ppe_delivery_logs, ppe_delivery_items, ppe_job_positions, project_employees),
-- the second column is NULL::bigint:
UNION ALL SELECT 'ppe_delivery_logs',
       COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
       NULL::bigint
FROM ppe_delivery_logs
UNION ALL SELECT 'ppe_delivery_items',
       COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
       NULL::bigint
FROM ppe_delivery_items
UNION ALL SELECT 'ppe_job_positions',
       COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
       NULL::bigint
FROM ppe_job_positions
UNION ALL SELECT 'project_employees',
       COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
       NULL::bigint
FROM project_employees
ORDER BY 1;

\echo ''
\echo '=== Totals (deploy gate: both must be zero) ==='
WITH per_table AS (
  -- (literal copy of the same UNION ALL list above, also returning created_by_nulls + updated_by_nulls)
  SELECT 0::bigint AS created_by_nulls, 0::bigint AS updated_by_nulls WHERE FALSE
  -- Replace this stub with the full UNION block from above.
)
SELECT
  SUM(created_by_nulls)::bigint AS total_created_by_nulls,
  SUM(COALESCE(updated_by_nulls, 0))::bigint AS total_updated_by_nulls
FROM per_table;

ROLLBACK;
```

The agent expanding this template must enumerate all 26 tables in both the per-table block and the `WITH per_table AS (...)` totals CTE — no shortcuts.

- [x] **Step 4: Copy and adapt the deploy gate runbook**

```bash
cp .worktrees/feat/cost-centers-audit-user-info/.compozy/tasks/audit-user-references/deploy-gate.md \
   .compozy/tasks/audit-fk-not-null/deploy-gate.md
```

Edit the copied file:

- Replace every reference to `0039_audit_fk_references.sql` with `0042_audit_fk_not_null.sql`.
- Replace every reference to `PR 1` with `PRD #3 PR`.
- Update the "Scope" section bullets: 48 FK constraints (not 72 — we drop `deleted_by` instead of FK-ing it), 26 tables, baseline 2026-04-21 still applies for `total_refs ≥ 930` (the pre-script's UNION still includes `deleted_by` populated rows; pre-deploy must show zero orphans on those too because the column is being dropped immediately after).
- Replace the single-script reference with **two pre-deploy SQL scripts**: `null-audit.sql` runs first (gates `ALTER COLUMN SET NOT NULL`), then `orphan-audit-pre.sql` (gates `VALIDATE CONSTRAINT`). Both must show all-zero counts for the gate to clear. Post-deploy uses `orphan-audit-post.sql` (no `deleted_by` lines).
- Update Failure Actions → Schema-correct but data-legitimate paragraph: rollback strategy is `0043_revert_audit_fk.sql` with `ALTER TABLE ... DROP CONSTRAINT ...` for each of 48 constraints + `ADD COLUMN deleted_by text` for each of 24 tables (with no NOT NULL — historic deletedBy values are not recoverable post-drop).
- **Append a new section at the end of the file titled `## Rollback considerations`:**

  ```markdown
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
  ```

- [x] **Step 5: Verify the scripts run against the local test DB**

```bash
bun run db:test:reset
bun run db:migrate
psql "$TEST_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/null-audit.sql
psql "$TEST_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql
```

Expected: `null-audit.sql` returns near-zero counts (the seed creates rows with real users; flag any non-zero in the audit notes for follow-up). `orphan-audit-pre.sql` returns `total_orphans = 0` if no fixture leaks. If non-zero, halt — fixture leak must be fixed before the migration is generated (Task 28 would fail on `VALIDATE CONSTRAINT`).

`orphan-audit-post.sql` cannot be functionally tested at this point — the `deleted_by` columns still exist locally, so its semantics aren't exercised until the migration applies. Task 30 Step 3 covers the post-script run.

- [x] **Step 6: Commit**

```bash
git add .compozy/tasks/audit-fk-not-null/
git commit -m "chore(prd-3): cherry-pick orphan/null/deploy-gate artifacts adapted for migration 0042"
```

---

### Task 2: Add `auditUserAliases()` helper

**Files:**
- Create: `src/lib/schemas/audit-users.ts`
- Create: `src/lib/schemas/__tests__/audit-users.test.ts`

The helper encapsulates the two `aliasedTable` calls used by every domain service that joins `users` for `createdBy` and `updatedBy`. The aliases must use distinct names so the resulting SQL can SELECT both `creator.id`/`creator.name` and `updater.id`/`updater.name` from the same query.

- [x] **Step 1: Write the failing test**

Create `src/lib/schemas/__tests__/audit-users.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { schema } from "@/db/schema";
import { auditUserAliases } from "../audit-users";

describe("auditUserAliases", () => {
  test("returns creator and updater aliases distinct from base users table", () => {
    const { creator, updater } = auditUserAliases();
    expect(creator).toBeDefined();
    expect(updater).toBeDefined();
    expect(creator).not.toBe(schema.users);
    expect(updater).not.toBe(schema.users);
    expect(creator).not.toBe(updater);
  });

  test("aliases expose id and name columns from users", () => {
    const { creator, updater } = auditUserAliases();
    expect(creator.id).toBeDefined();
    expect(creator.name).toBeDefined();
    expect(updater.id).toBeDefined();
    expect(updater.name).toBeDefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
NODE_ENV=test bun test --env-file .env.test src/lib/schemas/__tests__/audit-users.test.ts
```
Expected: FAIL — `auditUserAliases` is not exported from a non-existent module.

- [x] **Step 3: Implement the helper**

Create `src/lib/schemas/audit-users.ts`:

```ts
import { aliasedTable } from "drizzle-orm";
import { schema } from "@/db/schema";

export function auditUserAliases() {
  return {
    creator: aliasedTable(schema.users, "creator"),
    updater: aliasedTable(schema.users, "updater"),
  };
}
```

- [x] **Step 4: Run test to verify it passes**

```bash
NODE_ENV=test bun test --env-file .env.test src/lib/schemas/__tests__/audit-users.test.ts
```
Expected: PASS.

- [x] **Step 5: Type-check and commit**

```bash
bun x tsc --noEmit 2>&1 | tail -20
```

Expected: zero errors.

```bash
git add src/lib/schemas/audit-users.ts src/lib/schemas/__tests__/audit-users.test.ts
git commit -m "feat(lib/schemas): add auditUserAliases helper for audit-user joins"
```

---

### Task 3: Pre-flight test fixture audit

**Files:** No code change in this task — it produces a written audit report committed as `.compozy/tasks/audit-fk-not-null/fixture-audit.md` (see Step 4 below).

PR #252's `task_04` already proved that fixture leaks (placeholder/hard-coded `userId` writes to audit columns) cause migration failure. The two known leaks (`cpf-analyses` `userId: organizationId` bug; `payments/plans` trial-constraint isolation) were extracted as standalone commits and are already in `preview` (commits `8fa7b08` and `3e101f6` / `824bd64`). This task verifies no new leak has been introduced since.

- [x] **Step 1: Grep for direct audit-column writes in fixtures**

```bash
grep -rEn 'createdBy:|updatedBy:|deletedBy:' src/test/helpers/ src/db/seeds/ 2>&1 | tee /tmp/audit-fixture-grep.txt
grep -rEn 'createdBy:|updatedBy:|deletedBy:' src/**/__tests__/ 2>&1 | tee -a /tmp/audit-fixture-grep.txt
```

For each match, classify into one of:
- (a) **Real user**: the value resolves to a `users.id` produced by `createTestUser` / `createTestUserWithOrganization` / `addMemberToOrganization`. ✓ Safe.
- (b) **Helper passthrough**: the value is `userId: input.userId` where `input.userId` is supplied by the caller. ✓ Safe — caller responsibility.
- (c) **Placeholder / hard-coded / wrong-shape**: value is a literal string like `"user-test"`, or a different ID like `organizationId`, or `undefined`. ✗ FK violation pending.

- [x] **Step 2: Reset test DB and run both pre-deploy audit scripts against it**

```bash
bun run db:test:reset
bun run db:migrate
psql "$TEST_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/null-audit.sql
psql "$TEST_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql
```

Expected: `null-audit.sql` returns near-zero counts and `orphan-audit-pre.sql` returns `total_orphans = 0` after a clean migration. If non-zero on either, the leak is in the seed / migration default values, not fixtures — escalate. (`orphan-audit-post.sql` is not exercised here — `deleted_by` columns still exist locally.)

- [x] **Step 3: Run a representative test batch and re-check both audits**

```bash
NODE_ENV=test bun test --env-file .env.test \
  src/modules/organizations/cost-centers/__tests__/ \
  src/modules/occurrences/absences/__tests__/ \
  src/modules/occurrences/cpf-analyses/__tests__/ \
  src/modules/payments/plans/__tests__/
psql "$TEST_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/null-audit.sql
psql "$TEST_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql
```

Expected: both still report all-zero. If non-zero, the new leak is in one of the modules just exercised — bisect by running individual files.

- [x] **Step 4: Document findings**

Create `.compozy/tasks/audit-fk-not-null/fixture-audit.md` with:
- Date and commit SHA
- Classification summary (counts per category a/b/c from Step 1)
- Any new leak found (`(c)` matches), with file:line and proposed fix
- Confirmation that `total_orphans = 0` in Step 3

If category (c) leaks are found, address each as a discrete commit before proceeding to Task 4.

- [x] **Step 5: Commit the audit document**

```bash
git add .compozy/tasks/audit-fk-not-null/fixture-audit.md
git commit -m "chore(prd-3): document fixture audit (zero new leaks since PR #252)"
```

---

### Task 4 — 25: Per-module mechanical refactor (22 tasks cobrindo 26 tabelas, parallelizable after Task 3)

Each task below applies the canonical patterns from sections **A** (schema), **B** (service), **C** (model), **D** (CLAUDE.md) of the Reference at the top of this plan to one schema file (or a small group of related schema files when M2M/log siblings travel together — see Tasks 9, 10, 19) and its consuming module. Per-module steps are intentionally identical so a subagent can run any of them independently.

**Crucial ordering note**: these 22 tasks update the schema TS files **and** the consuming services/models in the same commit. They do **not** generate or apply the migration — that happens once in Task 28 after all 22 tasks are done. Until Task 28 runs, the runtime DB still has the `deletedBy` column and accepts NULL `createdBy`/`updatedBy`; the schema TS just stops declaring those nuances. Tests still pass because:
- Service no longer writes `deletedBy` → DB stores NULL on new soft-deletes (acceptable transient state)
- Service no longer reads `deletedBy` in SELECT projections → no SQL error
- Model no longer exposes `deletedBy` → response shape changes (test must be updated if it asserted the field)

**Per-module template** (8 steps):

- [x] **Step 1: Update schema TS file** — apply pattern (A) to `src/db/schema/<file>.ts`. Add `import { users } from "./auth"` if not already present.
- [x] **Step 2: Type-check** — `bun x tsc --noEmit 2>&1 | tail -20`. Expected: errors localized to the consuming service/model that still reference `deletedBy`.
- [x] **Step 3: Update service** — apply pattern (B) to `src/modules/.../<name>.service.ts`. Remove `deletedBy: userId` from the `set({ ... })` of the soft-delete update; remove `deletedBy:` from any SELECT projection used by `findByIdIncludingDeleted` / equivalent; remove `deletedBy` from the function's return type. The audit_logs entry (added in PRD #1) is the new attribution source — no replacement code needed.
- [x] **Step 4: Update model** — apply pattern (C) to `src/modules/.../<name>.model.ts`. Remove the `deletedBy` field from the response Zod data schema. Verify no `.pick({ deletedBy: true })` / `.omit({ deletedBy: true })` chains depend on the key.
- [x] **Step 5: Update existing tests if any assert on `deletedBy`** — grep `deletedBy` inside this module's `__tests__/`. If a test asserts `expect(body.data.deletedBy).toBe(...)` or includes `deletedBy` in a `toMatchObject({...})`, drop that key from the assertion. Do not add new tests — soft-delete behavior is already covered by `audit_logs` assertions from PRD #1's audit-coverage tests.
- [x] **Step 6: Update module CLAUDE.md** — apply pattern (D). Look for any literal string `deletedBy` in the file; replace with attribution-via-audit_logs language. Most modules require a one-line edit.
- [x] **Step 7: Run the module's test suite** — `NODE_ENV=test bun test --env-file .env.test src/modules/.../__tests__/`. Expected: PASS. The DB still has the `deletedBy` column (migration not yet generated/applied) and accepts the now-omitted `deletedBy` write — Drizzle simply does not include the column in the INSERT/UPDATE.
- [x] **Step 8: Type-check + commit**

```bash
bun x tsc --noEmit 2>&1 | tail -20
```
Expected: zero errors.

```bash
git add src/db/schema/<file>.ts src/modules/<path>/
git commit -m "refactor(<module>): drop deletedBy + tighten createdBy/updatedBy schema"
```

#### Task 4: `cost_centers`

- Schema file: `src/db/schema/cost-centers.ts`
- Service: `src/modules/organizations/cost-centers/cost-center.service.ts`
- Model: `src/modules/organizations/cost-centers/cost-center.model.ts:28`
- CLAUDE.md: `src/modules/organizations/cost-centers/CLAUDE.md` (search for `deletedBy`)
- Test path: `src/modules/organizations/cost-centers/__tests__/`
- Has all three audit columns; full canonical pattern applies.

#### Task 5: `branches`

- Schema: `src/db/schema/branches.ts`
- Service: `src/modules/organizations/branches/branch.service.ts`
- Model: `src/modules/organizations/branches/branch.model.ts:122`
- CLAUDE.md: `src/modules/organizations/branches/CLAUDE.md`
- Test path: `src/modules/organizations/branches/__tests__/`

#### Task 6: `sectors`

- Schema: `src/db/schema/sectors.ts`
- Service: `src/modules/organizations/sectors/sector.service.ts`
- Model: `src/modules/organizations/sectors/sector.model.ts:28`
- CLAUDE.md: `src/modules/organizations/sectors/CLAUDE.md`
- Test path: `src/modules/organizations/sectors/__tests__/`

#### Task 7: `job_positions`

- Schema: `src/db/schema/job-positions.ts`
- Service: `src/modules/organizations/job-positions/job-position.service.ts`
- Model: `src/modules/organizations/job-positions/job-position.model.ts:43`
- CLAUDE.md: `src/modules/organizations/job-positions/CLAUDE.md`
- Test path: `src/modules/organizations/job-positions/__tests__/`

#### Task 8: `job_classifications`

- Schema: `src/db/schema/job-classifications.ts`
- Service: `src/modules/organizations/job-classifications/job-classification.service.ts`
- Model: `src/modules/organizations/job-classifications/job-classification.model.ts:53`
- CLAUDE.md: `src/modules/organizations/job-classifications/CLAUDE.md`
- Test path: `src/modules/organizations/job-classifications/__tests__/`

#### Task 9: `projects` + `project_employees`

- Schema files: `src/db/schema/projects.ts`, `src/db/schema/project-employees.ts`
- Service: `src/modules/organizations/projects/project.service.ts` (the M2M table is mutated via the same service)
- Model: `src/modules/organizations/projects/project.model.ts:74`
- CLAUDE.md: `src/modules/organizations/projects/CLAUDE.md`
- Test path: `src/modules/organizations/projects/__tests__/`
- `projects` has all three; `project_employees` has only `createdBy` (NOT NULL + FK) and `deletedBy` (drop). No `updatedBy` on either change for the M2M.

Both schema files updated in this task's commit.

#### Task 10: `ppe_items` + `ppe_job_positions`

- Schema files: `src/db/schema/ppe-items.ts`, `src/db/schema/ppe-job-positions.ts`
- Service: `src/modules/organizations/ppe-items/ppe-item.service.ts`
- Model: `src/modules/organizations/ppe-items/ppe-item.model.ts:45`
- CLAUDE.md: `src/modules/organizations/ppe-items/CLAUDE.md`
- Test path: `src/modules/organizations/ppe-items/__tests__/`
- `ppe_items` has all three; `ppe_job_positions` (M2M) has only `createdBy` + `deletedBy`.

#### Task 11: `organization_profiles`

- Schema: `src/db/schema/organization-profiles.ts`
- Service: `src/modules/organizations/profile/profile.service.ts` (verify path; profile module may not call `set({ deletedBy })` if it uses upsert semantics — if no `deletedBy:` lines exist, only the schema, model, and CLAUDE.md change apply)
- Model: locate the response Zod for organization-profiles; remove `deletedBy` if present
- CLAUDE.md: `src/modules/organizations/profile/CLAUDE.md` if it exists
- Test path: `src/modules/organizations/profile/__tests__/`

#### Task 12: `employees`

- Schema: `src/db/schema/employees.ts`
- Service: `src/modules/employees/employee.service.ts` (3 occurrences of `deletedBy` per earlier grep — at line ~910 and 937; review each in context)
- Model: `src/modules/employees/employee.model.ts:624`
- CLAUDE.md: `src/modules/employees/CLAUDE.md`
- Test path: `src/modules/employees/__tests__/`

#### Task 13: `absences`

- Schema: `src/db/schema/absences.ts`
- Service: `src/modules/occurrences/absences/absence.service.ts` (canonical reference)
- Model: `src/modules/occurrences/absences/absence.model.ts:85`
- CLAUDE.md: `src/modules/occurrences/absences/CLAUDE.md`
- Test path: `src/modules/occurrences/absences/__tests__/`

#### Task 14: `accidents`

- Schema: `src/db/schema/accidents.ts`
- Service: `src/modules/occurrences/accidents/accident.service.ts`
- Model: `src/modules/occurrences/accidents/accident.model.ts:74`
- CLAUDE.md: `src/modules/occurrences/accidents/CLAUDE.md`
- Test path: `src/modules/occurrences/accidents/__tests__/`

#### Task 15: `vacations`

- Schema: `src/db/schema/vacations.ts`
- Service: `src/modules/occurrences/vacations/vacation.service.ts`
- Model: `src/modules/occurrences/vacations/vacation.model.ts:123`
- CLAUDE.md: `src/modules/occurrences/vacations/CLAUDE.md`
- Test path: `src/modules/occurrences/vacations/__tests__/`

#### Task 16: `medical_certificates`

- Schema: `src/db/schema/medical-certificates.ts`
- Service: `src/modules/occurrences/medical-certificates/medical-certificates.service.ts`
- Model: `src/modules/occurrences/medical-certificates/medical-certificates.model.ts:110`
- CLAUDE.md: `src/modules/occurrences/medical-certificates/CLAUDE.md`
- Test path: `src/modules/occurrences/medical-certificates/__tests__/`

#### Task 17: `warnings`

- Schema: `src/db/schema/warnings.ts`
- Service: `src/modules/occurrences/warnings/warning.service.ts`
- Model: `src/modules/occurrences/warnings/warning.model.ts:120`
- CLAUDE.md: `src/modules/occurrences/warnings/CLAUDE.md`
- Test path: `src/modules/occurrences/warnings/__tests__/`

#### Task 18: `terminations`

- Schema: `src/db/schema/terminations.ts`
- Service: `src/modules/occurrences/terminations/termination.service.ts`
- Model: `src/modules/occurrences/terminations/termination.model.ts:131`
- CLAUDE.md: `src/modules/occurrences/terminations/CLAUDE.md`
- Test path: `src/modules/occurrences/terminations/__tests__/`
- The fixture file `__tests__/create-termination.test.ts` references `deletedBy` per the earlier grep — verify and update assertions in Step 5.

#### Task 19: `ppe_deliveries` + `ppe_delivery_items` + `ppe_delivery_logs`

- Schema files: `src/db/schema/ppe-deliveries.ts`, `src/db/schema/ppe-delivery-items.ts`, `src/db/schema/ppe-delivery-logs.ts`
- Service: `src/modules/occurrences/ppe-deliveries/ppe-delivery.service.ts`
- Model: `src/modules/occurrences/ppe-deliveries/ppe-delivery.model.ts:104`
- CLAUDE.md: `src/modules/occurrences/ppe-deliveries/CLAUDE.md`
- Test path: `src/modules/occurrences/ppe-deliveries/__tests__/`
- `ppe_deliveries`: all three (full pattern). `ppe_delivery_items`: only `createdBy` + `deletedBy` (no `updatedBy`). `ppe_delivery_logs`: only `createdBy` (no `updatedBy`, no `deletedBy`) — only the createdBy NOT NULL + FK change applies.

All three schema files updated in this task's commit.

#### Task 20: `labor_lawsuits`

- Schema: `src/db/schema/labor-lawsuits.ts`
- Service: `src/modules/occurrences/labor-lawsuits/labor-lawsuit.service.ts`
- Model: `src/modules/occurrences/labor-lawsuits/labor-lawsuit.model.ts:223`
- CLAUDE.md: `src/modules/occurrences/labor-lawsuits/CLAUDE.md`
- Test path: `src/modules/occurrences/labor-lawsuits/__tests__/`

#### Task 21: `cpf_analyses`

- Schema: `src/db/schema/cpf-analyses.ts`
- Service: `src/modules/occurrences/cpf-analyses/cpf-analysis.service.ts`
- Model: `src/modules/occurrences/cpf-analyses/cpf-analysis.model.ts:89`
- CLAUDE.md: `src/modules/occurrences/cpf-analyses/CLAUDE.md`
- Test path: `src/modules/occurrences/cpf-analyses/__tests__/`

#### Task 22: `promotions`

- Schema: `src/db/schema/promotions.ts`
- Service: `src/modules/occurrences/promotions/promotion.service.ts`
- Model: `src/modules/occurrences/promotions/promotion.model.ts:85`
- CLAUDE.md: `src/modules/occurrences/promotions/CLAUDE.md`
- Test path: `src/modules/occurrences/promotions/__tests__/`

#### Task 23: `admin_org_provisions`

- Schema: `src/db/schema/admin-org-provisions.ts`
- Service: `src/modules/payments/admin-provision/admin-provision.service.ts`
- Model: locate the response Zod for admin-provisions; remove `deletedBy` if present
- CLAUDE.md: `src/modules/payments/admin-provision/CLAUDE.md`
- Test path: `src/modules/payments/admin-provision/__tests__/`

#### Task 24: `billing_profiles`

- Schema: `src/db/schema/billing-profiles.ts`
- Service: `src/modules/payments/billing/billing.service.ts` (or wherever billing-profile mutations live; if no `set({ deletedBy })` exists, only schema/model/CLAUDE.md change)
- Model: locate the response Zod for billing-profiles
- CLAUDE.md: `src/modules/payments/billing/CLAUDE.md`
- Test path: `src/modules/payments/billing/__tests__/`

#### Task 25: `features`

- Schema: edit only the `features` table block inside `src/db/schema/payments.ts` (lines 391-410). Add `.notNull().references(() => users.id, { onDelete: "restrict" })` to both `createdBy` and `updatedBy`. **Do not touch any other table in `payments.ts`** — they are out of scope.
- Service: `src/modules/payments/features/...` (if no service writes `createdBy`/`updatedBy` because features are seed-only, document that in the commit message; only the schema change applies)
- Model: locate the features Zod model if any user-facing endpoint exposes it
- CLAUDE.md: `src/modules/payments/CLAUDE.md` (root payments doc)
- Test path: `src/modules/payments/features/__tests__/` (may not exist — fall back to `src/modules/payments/__tests__/`)
- `features` has no `deletedBy` — only the createdBy/updatedBy NOT NULL+FK changes apply. Skip the model `deletedBy` removal step.

#### Task 26-29: catch-up and verification within Task batch

After Tasks 4-25 are done, three small follow-ups:

#### Task 26: Update `src/modules/audit/pii-redaction.ts`

- Modify: `src/modules/audit/pii-redaction.ts:23`
- Modify: `src/modules/audit/__tests__/pii-redaction.test.ts:42`
- Modify: `src/modules/audit/CLAUDE.md` (line ~43)

- [x] **Step 1: Drop `"deletedBy"` from the `IGNORED_AUDIT_FIELDS` Set**

In `src/modules/audit/pii-redaction.ts`, the set currently includes `"createdAt"`, `"updatedAt"`, `"deletedAt"`, `"createdBy"`, `"updatedBy"`, `"deletedBy"`. Remove the `"deletedBy"` entry. The column will not appear in any future audit `before`/`after` diff because it no longer exists in the schema.

- [x] **Step 2: Update the unit test**

In `src/modules/audit/__tests__/pii-redaction.test.ts`, find the line `expect(IGNORED_AUDIT_FIELDS.has("deletedBy")).toBe(true);` and remove it. Ensure no other test in the file depends on `deletedBy` being in the set.

- [x] **Step 3: Update audit module CLAUDE.md**

In `src/modules/audit/CLAUDE.md`, the line currently reads:

```
- **Campos metadata ignorados**: `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `deletedBy` — não aparecem no diff (valores são reconstituíveis do próprio log entry)
```

Replace with:

```
- **Campos metadata ignorados**: `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy` — não aparecem no diff (valores são reconstituíveis do próprio log entry; `deletedBy` foi removido do schema em PRD #3 — `audit_logs` é a fonte de atribuição de deleção)
```

- [x] **Step 4: Run audit tests**

```bash
NODE_ENV=test bun test --env-file .env.test src/modules/audit/__tests__/
```
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/modules/audit/pii-redaction.ts src/modules/audit/__tests__/pii-redaction.test.ts src/modules/audit/CLAUDE.md
git commit -m "refactor(audit): drop deletedBy from IGNORED_AUDIT_FIELDS (column removed in PRD #3)"
```

#### Task 27: Update root `.claude/CLAUDE.md` with new convention

**File:** `.claude/CLAUDE.md`

Two sections need adjustment:

- [x] **Step 1: Update "Soft deletes" line**

Find:

```
- **Soft deletes** — entities use `deletedAt`/`deletedBy` fields instead of hard delete. Always filter with `isNull(schema.<table>.deletedAt)` in queries to exclude deleted records
```

Replace with:

```
- **Soft deletes** — entities use a `deletedAt` field instead of hard delete (the `deletedBy` field was removed in PRD #3 — deletion attribution is now the responsibility of `audit_logs`, see `src/modules/audit/`). Always filter with `isNull(schema.<table>.deletedAt)` in queries to exclude deleted records
```

- [x] **Step 2: Update "Timestamps convention" line**

Find:

```
- **Timestamps convention** — all tables include `createdAt` (defaultNow), `updatedAt` ($onUpdate), `createdBy`, `updatedBy`. Populate `createdBy`/`updatedBy` with the user ID from session
```

Replace with:

```
- **Timestamps convention** — all in-scope domain tables include `createdAt` (defaultNow), `updatedAt` ($onUpdate), `createdBy` (NOT NULL FK to `users.id` ON DELETE RESTRICT), `updatedBy` (NOT NULL FK to `users.id` ON DELETE RESTRICT). Populate `createdBy` on INSERT and `updatedBy` on both INSERT and UPDATE — both equal to the user ID from session. Helper for self-joins to `users`: `auditUserAliases()` from `src/lib/schemas/audit-users.ts`. Query style: Drizzle Core API + inline `select()` + `aliasedTable` (NOT the Relational API). Reference implementation: `src/modules/occurrences/absences/absence.service.ts`
```

- [x] **Step 3: Update `src/modules/occurrences/CLAUDE.md` "Audit trail" line**

Find:

```
- Audit trail: `createdBy`, `updatedBy`, `deletedBy` com userId da sessão
```

Replace with:

```
- Audit trail: `createdBy` (no INSERT) + `updatedBy` (no INSERT e no UPDATE) com userId da sessão. Atribuição de deleção via `audit_logs` (PRD #3 removeu `deletedBy` das tabelas)
```

- [x] **Step 4: Commit**

```bash
git add .claude/CLAUDE.md src/modules/occurrences/CLAUDE.md
git commit -m "docs(claude-md): record PRD #3 convention (FK + NOT NULL on createdBy/updatedBy; deletedBy removed)"
```

#### Task 28: Generate the migration

**Files:**
- Create: `src/db/migrations/0042_audit_fk_not_null.sql`
- Create: `src/db/migrations/meta/0042_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`

- [x] **Step 1: Run Drizzle generate**

```bash
bun run db:generate
```

Drizzle inspects the diff between `src/db/schema/**` (now reflecting the post-migration shape after Tasks 4-25) and `meta/0041_snapshot.json` and emits a new `0042_<name>.sql` plus `0042_snapshot.json` and updates `_journal.json`. The auto-generated SQL contains, for each affected column:

```sql
-- For createdBy NOT NULL + FK (26 tables):
ALTER TABLE "<table>" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "<table>" ADD CONSTRAINT "<table>_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;

-- For updatedBy NOT NULL + FK (22 tables):
ALTER TABLE "<table>" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "<table>" ADD CONSTRAINT "<table>_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT;

-- For deletedBy DROP (24 tables):
ALTER TABLE "<table>" DROP COLUMN "deleted_by";
```

If the file is named `0042_<random-adjective>.sql`, rename it to `0042_audit_fk_not_null.sql` and update the corresponding `tag` field in `_journal.json`. Drizzle's snapshot files are versioned by `idx`, not name — the rename is safe.

- [x] **Step 2: Verify the snapshot is consistent**

```bash
bun x tsc --noEmit 2>&1 | tail -5
git diff --stat src/db/migrations/
```

Expected: snapshot/journal/SQL changes only; no schema TS file regenerated by Drizzle (those were committed in Tasks 4-25).

- [x] **Step 3: Commit the auto-generated migration**

```bash
git add src/db/migrations/0042_audit_fk_not_null.sql src/db/migrations/meta/_journal.json src/db/migrations/meta/0042_snapshot.json
git commit -m "feat(db): generate migration 0042 (audit FK + NOT NULL + drop deletedBy) — auto-generated"
```

This intermediate commit is the **unsafe** version (atomic FK validation, no backfill). The next task converts it to production-safe.

---

### Task 29: Hand-tune the migration for production safety

**Files:**
- Modify: `src/db/migrations/0042_audit_fk_not_null.sql`

The auto-generated SQL has two production safety gaps:

1. **No backfill.** `ALTER COLUMN updated_by SET NOT NULL` will fail on any row where `updated_by IS NULL`. The 22 tables that have `updatedBy` may have NULL values from older inserts pre-Semantic-A.
2. **Atomic FK validation.** `ADD CONSTRAINT ... FOREIGN KEY ...` validates immediately under AccessExclusiveLock. With 26 tables and potentially millions of rows, this can cause minute-level table locks on production.

The hand-tune converts the migration into the safe form: backfill → SET NOT NULL → ADD CONSTRAINT NOT VALID → VALIDATE CONSTRAINT (separate step) → DROP COLUMN.

- [x] **Step 1: Open the migration file**

```bash
$EDITOR src/db/migrations/0042_audit_fk_not_null.sql
```

- [x] **Step 2: Prepend the backfill block at the top of the file**

**Rationale**: para linhas legacy onde `updated_by IS NULL`, fazer backfill com `created_by` — a entidade nunca foi atualizada, então a aproximação mais próxima da verdade é o autor do `INSERT` (alinhado à Semantic A: `updatedBy` igual a `createdBy` no instante do create). Sem o backfill, o `ALTER COLUMN updated_by SET NOT NULL` falharia em runtime de migration. Para cada uma das 22 tabelas com `updatedBy`, emit:

```sql
UPDATE <table> SET updated_by = created_by WHERE updated_by IS NULL;
```

Insert above the first `ALTER TABLE` statement:

```sql
-- ============================================================================
-- PRD #3 — Audit FK + NOT NULL + drop deletedBy
--
-- This migration enforces referential integrity on createdBy/updatedBy across
-- 26 in-scope domain tables and drops deletedBy on 24 of them. audit_logs
-- (populated by PRD #1) is now the authoritative source of deletion attribution.
--
-- Production safety:
--   - Pre-deploy gate: both null-audit.sql (zero NULLs on createdBy/updatedBy)
--     AND orphan-audit-pre.sql (zero FK orphans) must clear within 24h of merge.
--     Scripts: .compozy/tasks/audit-fk-not-null/scripts/null-audit.sql and
--              .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql
--   - Backfill: updated_by = created_by for any row with updated_by IS NULL
--     (Semantic A normalization).
--   - FK constraints added with NOT VALID (no table scan), then VALIDATE
--     CONSTRAINT in a separate statement (ShareUpdateExclusiveLock — allows
--     concurrent reads/writes; aborts atomically if any orphan slips through).
--   - DROP COLUMN deleted_by is irreversible. Rollback strategy in
--     .compozy/tasks/audit-fk-not-null/deploy-gate.md (re-add column without
--     historical values; deletion attribution before this migration is in
--     audit_logs from PRD #1).
-- ============================================================================

-- Step 1: Backfill updated_by = created_by where NULL (22 tables with updatedBy)
UPDATE absences SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE accidents SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE admin_org_provisions SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE billing_profiles SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE branches SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE cost_centers SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE cpf_analyses SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE employees SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE features SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE job_classifications SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE job_positions SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE labor_lawsuits SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE medical_certificates SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE organization_profiles SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE ppe_deliveries SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE ppe_items SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE projects SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE promotions SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE sectors SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE terminations SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE vacations SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE warnings SET updated_by = created_by WHERE updated_by IS NULL;
```

(22 backfill statements — one per table that has `updatedBy`.)

- [x] **Step 3: Convert each `ADD CONSTRAINT ... FOREIGN KEY` to NOT VALID + VALIDATE CONSTRAINT split**

Drizzle emits each FK as a single statement. Convert each to two statements. Example:

**Before** (auto-generated):

```sql
ALTER TABLE "absences" ADD CONSTRAINT "absences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;
```

**After** (hand-tuned):

```sql
ALTER TABLE "absences" ADD CONSTRAINT "absences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "absences" VALIDATE CONSTRAINT "absences_created_by_users_id_fk";
```

A `sed` snippet handles the bulk transformation safely (run inside the editor or as a separate script):

```bash
# Inside the migration file (or piped — verify diff before saving)
sed -i -E 's/(ON DELETE RESTRICT);$/\1 NOT VALID;/' src/db/migrations/0042_audit_fk_not_null.sql
```

That covers the `NOT VALID` half. Then, immediately after each `ADD CONSTRAINT ... NOT VALID;` line, append a `VALIDATE CONSTRAINT` line. Programmatic transform:

```bash
awk '
  /^ALTER TABLE .* ADD CONSTRAINT .* FOREIGN KEY .* NOT VALID;$/ {
    print
    match($0, /ADD CONSTRAINT "([^"]+)"/, arr)
    cname = arr[1]
    match($0, /^ALTER TABLE "([^"]+)"/, arr)
    tname = arr[1]
    printf("ALTER TABLE \"%s\" VALIDATE CONSTRAINT \"%s\";\n", tname, cname)
    next
  }
  { print }
' src/db/migrations/0042_audit_fk_not_null.sql > /tmp/0042_safe.sql
mv /tmp/0042_safe.sql src/db/migrations/0042_audit_fk_not_null.sql
```

Verify: there should now be 48 `ADD CONSTRAINT ... NOT VALID` statements followed each by a `VALIDATE CONSTRAINT` statement (48 + 48 = 96 lines for the FK section). And 24 `DROP COLUMN deleted_by` statements at the end.

- [x] **Step 4: Reorder the SQL into clear phases**

Adjust the file so statements are grouped by phase (top-down):

```
-- (header comment)
-- Step 1: Backfill (22 UPDATEs)
-- Step 2: SET NOT NULL on 26 createdBy + 22 updatedBy (48 statements)
-- Step 3: ADD CONSTRAINT FOREIGN KEY NOT VALID on 26 + 22 (48 statements)
-- Step 4: VALIDATE CONSTRAINT for the 48 added above (48 statements)
-- Step 5: DROP COLUMN deleted_by on 24 tables (24 statements)
```

The auto-generated order interleaves `SET NOT NULL` and `ADD CONSTRAINT` per table; reordering into phases makes the migration auditable and matches the deploy-gate runbook's phase narrative.

- [x] **Step 5: Validate the SQL syntax**

```bash
psql "$TEST_DATABASE_URL" -c "BEGIN; \i src/db/migrations/0042_audit_fk_not_null.sql ; ROLLBACK;"
```

Expected: zero errors. Any error here is a syntax/order problem. Note: this will fail if the test DB has existing FK constraints with the same name from a prior run — reset first with `bun run db:test:reset && bun run db:migrate` (which only applies migrations 0001-0041; 0042 is the one being verified).

- [x] **Step 6: Commit the hand-tune**

```bash
git add src/db/migrations/0042_audit_fk_not_null.sql
git commit -m "feat(db): hand-tune migration 0042 (backfill, NOT VALID/VALIDATE split, phase-ordered)"
```

---

### Task 30: Apply migration locally and run full per-module test batches

**Files:** No code change — verification only.

This task replicates PR #252's `task_04` batching plan to confirm the migration applies cleanly and no module test regresses against the new constraints.

- [x] **Step 1: Reset test DB and apply migrations 0001-0042**

```bash
bun run db:test:reset
bun run db:migrate
```

Expected: migrations apply in order; the final apply line mentions `0042_audit_fk_not_null`.

- [x] **Step 2: Verify constraints and dropped columns are present**

```bash
psql "$TEST_DATABASE_URL" -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND constraint_name LIKE '%_created_by_users_id_fk';"
```
Expected: `26`.

```bash
psql "$TEST_DATABASE_URL" -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND constraint_name LIKE '%_updated_by_users_id_fk';"
```
Expected: `22`.

```bash
psql "$TEST_DATABASE_URL" -c "SELECT COUNT(*) FROM information_schema.columns WHERE column_name='deleted_by' AND table_schema='public';"
```
Expected: `0`.

- [x] **Step 3: Run `orphan-audit-post.sql` against test DB**

```bash
psql "$TEST_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql
```

`orphan-audit-post.sql` was created in Task 1 Step 2 with the `deleted_by` UNION lines already removed (the column no longer exists after migration 0042 applies). Expected: `total_refs > 0`, `total_orphans = 0`. No script edits or follow-up commit needed.

- [x] **Step 4: Run module suites in 9 batches** (per PR #252 task_04 plan, refresher of the full-suite sweep)

```bash
echo "Batch 1/9: lib"; NODE_ENV=test bun test --env-file .env.test src/lib/
echo "Batch 2/9: auth + public + audit"; NODE_ENV=test bun test --env-file .env.test src/modules/auth/ src/modules/public/ src/modules/audit/
echo "Batch 3/9: admin + cbo"; NODE_ENV=test bun test --env-file .env.test src/modules/admin/ src/modules/cbo-occupations/
echo "Batch 4/9: organizations"; NODE_ENV=test bun test --env-file .env.test src/modules/organizations/
echo "Batch 5/9: employees"; NODE_ENV=test bun test --env-file .env.test src/modules/employees/
echo "Batch 6/9: occurrences A"; NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/absences/ src/modules/occurrences/accidents/ src/modules/occurrences/cpf-analyses/ src/modules/occurrences/labor-lawsuits/ src/modules/occurrences/medical-certificates/
echo "Batch 7/9: occurrences B"; NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/ppe-deliveries/ src/modules/occurrences/promotions/ src/modules/occurrences/terminations/ src/modules/occurrences/vacations/ src/modules/occurrences/warnings/
echo "Batch 8/9: payments A"; NODE_ENV=test bun test --env-file .env.test src/modules/payments/admin-checkout/ src/modules/payments/admin-provision/ src/modules/payments/admin-subscription/ src/modules/payments/billing/ src/modules/payments/checkout/ src/modules/payments/customer/ src/modules/payments/features/
echo "Batch 9/9: payments B"; NODE_ENV=test bun test --env-file .env.test src/modules/payments/hooks/ src/modules/payments/jobs/ src/modules/payments/limits/ src/modules/payments/pagarme/ src/modules/payments/plan-change/ src/modules/payments/plans/ src/modules/payments/price-adjustment/ src/modules/payments/subscription/ src/modules/payments/webhook/
```

Each batch is a synchronous foreground run. If a batch reports failures, stop, fix, re-run only that batch. **Do not skip a failing batch and proceed.** Expected: all 9 green.

- [x] **Step 5: Smoke seed**

```bash
bun run db:seed:org
```

Expected: exit 0; no FK violation surfaces in the seed log.

- [x] **Step 6: No commit unless step 4 surfaced fixture/test breakage that needed fixing**

If any batch required a fix, that fix is a separate small commit (`fix(<module>): adjust assertion for deletedBy removal` or similar) referencing PRD #3.

---

### Task 31: Type-check and lint

**Files:** No code change.

- [x] **Step 1: Type-check**

```bash
bun x tsc --noEmit 2>&1 | tail -20
```
Expected: zero errors.

- [x] **Step 2: Lint**

```bash
npx ultracite check
```
Expected: clean.

Any error here is a leftover from Tasks 4-26 — locate the file, fix the issue, recommit per the original task's scope. Do not commit a `chore(lint)` blanket fix; trace each warning to its origin.

---

### Task 32: G1 pre-deploy gate (production audits + frontend verification)

**Files:** No code change. PR description gets evidence pasted into it.

This step happens **on the PR**, not the branch. It is operational, not implementation. Capture evidence in the PR description per the template in `.compozy/tasks/audit-fk-not-null/deploy-gate.md`.

- [ ] **Step 1: Run pre-deploy audits against production within 24h of merge**

Run the **NULL audit** first — this gates against any row with `created_by IS NULL` or `updated_by IS NULL` that would cause `ALTER COLUMN ... SET NOT NULL` to fail at runtime:

```bash
psql "$PROD_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/null-audit.sql
```

Expected: every row reports `created_by_nulls = 0` and `updated_by_nulls = 0` (or NULL for the 4 tables without `updated_by`); totals row reports both totals = 0. Any non-zero count blocks the merge until manually backfilled. Document any non-zero finding plus the backfill SQL applied as a separate "NULL backfill" entry in the PR description.

Then run the **orphan audit** (FK orphans on populated values):

```bash
psql "$PROD_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql
```

Expected: `total_orphans = 0`, `total_refs ≥ 930` (baseline 2026-04-21).

- [ ] **Step 2: Capture both audit result sets in the PR description**

Under `## G1 Pre-deploy audits`:

```
### NULL audit
- Run at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- Operator: <handle>
- Per-table summary: <link to gist or paste — every row should be 0/0 (or 0/NULL)>
- Total: created_by_nulls = 0, updated_by_nulls = 0 ✓

### Orphan audit (pre-deploy)
- Run at (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- Operator: <handle>
- Result: total_refs = <N>, total_orphans = 0 ✓
- Per-column summary: <link to gist or paste>
- Orphan detail: (0 rows) ✓
```

- [ ] **Step 3: Capture 7-day baseline metrics (G2)** — 5xx rate, p95, DB CPU. Pre-deploy snapshot.

- [ ] **Step 3.5: Verify frontend contract (deletedBy non-consumer)**

```bash
cd ../synnerdata-web-n-anonymize  # or wherever the frontend repo lives
grep -rn 'deletedBy\|deleted_by' src/
```

Expected: zero matches in non-generated code. Matches under `src/lib/api/generated/` (or equivalent kubb output dir) are acceptable — the generator regenerates after merge from the new OpenAPI spec. **Any match in manually-authored code blocks the merge** until the frontend team removes the consumer.

Annotate the result in the PR description under `## Frontend contract verification`:

```
- Frontend repo: <path / commit>
- Manual `deletedBy`/`deleted_by` matches outside generated code: <count + file:line list>
- Status: <CLEAR / BLOCKED — describe required frontend change>
```

If BLOCKED, do not merge. Coordinate with the frontend team via the agreed channel before re-running this step.

- [ ] **Step 4: Merge the PR**

After merge, the deploy pipeline runs the migration. Watch the per-statement log in real time.

- [ ] **Step 5: Run G3 post-deploy orphan audit**

```bash
psql "$PROD_DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql
```

Same expected output as the pre-deploy orphan audit (`total_orphans = 0`). The post-script omits the `deleted_by` UNION lines because the column was dropped by the migration. Run within minutes of migration completion.

- [ ] **Step 6: Run G4 (T+24h) and G5 (T+48h) metric checks** — each within ±10% of G2 baseline.

- [ ] **Step 7: Mark gate cleared in PR**

When G5 passes, edit the PR description: `Phase 2 unblocked: YES` under the G5 block. PRD #4 (cost-centers pilot) is now unblocked.

---

## Dependencies and parallelism

- **Foundation (sequential):** Task 1 → Task 2 → Task 3 — these set up the helper, the deploy-gate artifacts, and confirm zero fixture leaks before any schema change.
- **Per-module fan-out (parallel after Task 3):** Tasks 4-25 — 22 tasks, each independent. A subagent can pick any. Each commit is atomic and can land out of order. Joint runtime: as fast as the slowest single module.
- **Catch-up (sequential after all of 4-25):** Tasks 26 → 27 — small follow-ups for the audit module and the root CLAUDE.md.
- **Migration generation (sequential after 26-27):** Task 28 → Task 29 — Drizzle generates from the post-refactor schema, hand-tune produces the production-safe form.
- **Verification (sequential after 29):** Task 30 → Task 31 — full module batches under the new constraints, then type-check and lint.
- **Deploy gate (operational, post-merge):** Task 32.

Estimated calendar time: 1 week per the design doc, dominated by the per-module fan-out. With 5-6 subagents in parallel, Tasks 4-25 collapse to ~1 day. Tasks 28-30 are the longest single tasks (~half-day each, including hand-tune and full-batch run).

---

## Out of scope (explicit)

- **Service-layer query refactoring to inline `select()` + `auditUserAliases()`.** This plan only lands the FK + NOT NULL + dropped-column changes. Adopting `auditUserAliases()` in services to expose `createdBy`/`updatedBy` as `{ id, name }` in API responses is **PRD #4** (cost-centers pilot) and **PRD #5+** (rollout). Services in this plan keep returning `createdBy`/`updatedBy` as text user IDs.
- **API contract changes.** Response shapes are unchanged at this layer (the `deletedBy` field disappears from response Zod; active frontend grep verification happens in Task 32 Step 3.5 immediately before merge — any non-generated frontend consumer found there blocks the merge until removed).
- **Audit log retention policy review.** Out of scope; future concern.
- **`auditUserAliases()` adoption beyond the helper landing + tests.** The helper is created (Task 2) but not consumed by any service in this plan.
- **Frontend changes.** The `deletedBy` field disappears from response payloads. Active grep verification (Task 32 Step 3.5) blocks the merge if any non-generated frontend code references `deletedBy`/`deleted_by`. Future `createdBy`/`updatedBy` shape changes (text → `{ id, name }`) are **PRD #4** (cost-centers pilot) scope.
- **Schema-level `relations()` blocks for audit users.** Per the design doc binding decisions, none are added.

---

## Notes for the executor

- Task 1's cherry-pick depends on the `.worktrees/feat/cost-centers-audit-user-info/` worktree being present at execution time. If that worktree has been removed, fetch the source files via `git show acc6939:.compozy/tasks/audit-user-references/scripts/orphan-audit.sql > .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql` and `git show acc6939:.compozy/tasks/audit-user-references/deploy-gate.md > .compozy/tasks/audit-fk-not-null/deploy-gate.md` (commit `acc6939` is the head of the closed PR #252 branch). Then apply the Step 2/3/4 transformations as written. `null-audit.sql` is fully new (no source to cherry-pick) — generate it from the template in Task 1 Step 3.
- Tasks 4-25 each run pre-existing module tests in Step 7 to verify no regression. The test DB still has the `deletedBy` column at this point (migration not yet applied) — tests pass because services no longer write or read the column, and the column accepts NULL.
- Task 29's hand-tune is the highest-risk step. The `awk` snippet is provided but read it carefully against your migration's actual content before piping. Always preview with `git diff` before committing.
- Task 30 Step 4's batching plan exists to keep each foreground `bun test` invocation under ~5 minutes. Do **not** consolidate batches — that re-introduces the activity-timeout failure mode that crashed PR #252's task_04 first attempt.
- After Task 30 succeeds locally, the branch is ready for review. Do **not** merge until G1 (Task 32) is green and the user has approved.
- The plan does not adopt subagent-driven-development for Task 30 because the batched test runs need to stay foreground in a single shell; subagents cannot share the same connected DB session reliably.
