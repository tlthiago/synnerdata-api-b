# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

- Task 01 implemented: `auditUserSchema`, `AuditUser`, `mapAuditRelations` exported from `src/lib/responses/response.types.ts`. Awaiting manual commit (auto-commit disabled for this run).
- Task 02 implemented: FK + `relations()` added to 26 domain schemas; `src/db/migrations/0039_audit_fk_references.sql` produced with 72 FK statements only. Awaiting manual commit.
- Task 03 implemented: `0039_audit_fk_references.sql` rewritten to ADR-004 pattern (72 `ADD CONSTRAINT ... NOT VALID` + 72 `VALIDATE CONSTRAINT`). Applied cleanly against fresh test DB; all 72 constraints present with `convalidated=true` and `ON DELETE SET NULL`. FK violation, valid insert, and ON DELETE SET NULL all verified on `cost_centers`. Awaiting manual commit.
- Task 04 implemented: fixture audit across `src/test/helpers/**` + `src/**/__tests__/**` found one real FK bug — `src/modules/occurrences/cpf-analyses/__tests__/create-cpf-analysis.test.ts` passed `userId: organizationId` (placeholder) into `createTestEmployee`; fixed to destructure real `userId`. Also hardened `payments/plans/__tests__/yearly-discount-and-trial-constraint.test.ts` against pre-existing `PlanFactory.archiveActiveTrial` pollution (self-healing transaction re-activates `plan-trial` before the constraint assertion). All 9 foreground test batches now green (2599 tests). `bun src/db/seeds/organization.ts --preset minimal` smoke test passes end-to-end against the FK-active DB. Awaiting manual commit.
- Task 05 implemented: one bullet added under `## Architectural Decisions` in root `.claude/CLAUDE.md` documenting the user-attribution pattern (FK+`ON DELETE SET NULL`, `*User` relations, `db.query`+`with`, `{ id, name } | null` payload, `mapAuditRelations` helper) with links to ADR-002/ADR-003. Awaiting manual commit.
- Task 06 implemented: `cost-centers` pilot refactor complete. `costCenterDataSchema` extended with three `auditUserSchema` fields; `CostCenterService` uses `db.query` + `with` for reads and `db.transaction` write-then-reread for writes. 5 integration tests extended + 2 null-case tests added (system-seeded, hard-deleted creator). 44 tests pass. Awaiting manual commit.
- Task 07 implemented: `src/modules/organizations/cost-centers/CLAUDE.md` gained a `## User Attribution (canonical pattern)` section flagging cost-centers as the Phase 3 reference, pointing to `auditUserSchema` / `mapAuditRelations` (import path `@/lib/responses/response.types`), `AUDIT_USER_WITH` + `db.query` reads, and `db.transaction` write-then-reread with atomicity rationale. ADRs linked via `../../../../.compozy/tasks/audit-user-references/adrs/adr-00{2,3}.md` (both resolve). Awaiting manual commit.
- Task 08 preparation done: authored `.compozy/tasks/audit-user-references/scripts/orphan-audit.sql` (72-position read-only audit; dry-run on test DB = 3191 refs, 0 orphans) and `.compozy/tasks/audit-user-references/deploy-gate.md` (G1–G5 runbook + PR evidence template). Task status stays `pending` because G1–G5 execute at deploy time. Awaiting manual commit.

## Shared Decisions

- `mapAuditRelations` generic requires the full triple (`createdBy`/`updatedBy`/`deletedBy` + matching `*User` relations). Partial-column variants are deferred to Phase 3 PRs that target schemas without the full triple.
- Relation naming: `createdByUser` / `updatedByUser` / `deletedByUser` (techspec + ADR-002/003). Drizzle relational API result is passed to `mapAuditRelations` before Zod response validation.
- `relationName` on each `one(users, …)`: `<singular-entity>Creator`/`Updater`/`Deleter` (e.g., `costCenterCreator`). Required because each domain table has up to three self-joins to `users`.
- Migration filename is `0039_audit_fk_references.sql` (not `0038_` as techspec/task_03 describe) — `0038_fix-default-trial-plan-archived` was already on main when Phase 1 started.
- Canonical pilot pattern (from task_06): define `const AUDIT_USER_WITH = { createdByUser: { columns: { id: true, name: true } }, updatedByUser: { ... }, deletedByUser: { ... } } as const;` at the top of the service. Reads call `db.query.<table>.findFirst/findMany({ with: AUDIT_USER_WITH })` then `mapAuditRelations`. Writes wrap mutation + re-read in `db.transaction` (pre-checks stay outside). Pre-existence check can use `db.query.<table>.findFirst({ columns: { id: true } })`; delete pre-check needs `db.select({ id, deletedAt })` because the row may already be soft-deleted.
- On `create`, the service now sets `updatedBy: userId` in addition to `createdBy: userId` — matches the "populate createdBy/updatedBy from session" convention in root CLAUDE.md and is required by task_06's test plan.

## Shared Learnings

- Worktrees under `.worktrees/` do NOT inherit `.env` / `.env.test` from the main repo. Symlinking the main repo's `.env.test` (and `.env` for `drizzle-kit generate`) into the worktree root unblocks `bun test` / `bun db:generate` (the bundled `src/test/preload.ts` throws if `DATABASE_URL` is unset, even for pure-utility tests).
- Zod v4 (`^4.1.13`) `.object()` still strips unknown keys by default — matches v3 behavior for these helpers.
- Drizzle-kit refused to generate migrations until the snapshot chain for `0036`–`0038` was repaired: the three files had identical `id`/`prevId` because they were copy-pasted from `0035` for data-only migrations. Fixed in task_02 with fresh UUIDs and a forward-linked `prevId` chain. Also patched `0038_snapshot.json`'s `subscription_plans_single_active_trial.where` to include `AND "organization_id" IS NULL` (migration 0037's effect was not reflected in the snapshot).
- Biome/ultracite strips unused imports between consecutive `Edit` calls. For schema edits that add a new import, either write the whole file in one `Write` call or order edits so the new `import` line comes after the lines that use it.

## Open Risks

- Snapshot-chain and `.env` symlink fixes are scoped to the Phase 1 PR by default. Reviewer should decide whether to split them into a separate infra PR or keep bundled; they are load-bearing for any future `drizzle-kit generate`.

## Handoffs

- task_04 runs its fixture audit against a DB with FKs active; drop + recreate the test DB and run `bun --env-file .env.test --bun drizzle-kit migrate` before running the full suite (the `db:migrate` script is pinned to `.env`, so invoke drizzle-kit directly for the test DB).
- task_06 (pilot) imports `auditUserSchema` and `mapAuditRelations` from `@/lib/responses/response.types`.
- For `db:seed:org` smoke verification post-FK activation: the default dev-DB owner org is often at the trial tier limit (10/10) — seed against a freshly created user+org inside the test DB (set `DATABASE_URL` pointing at the test DB) to avoid mutating real data.
- `PlanFactory.archiveActiveTrial` (via any `PlanFactory.create({ isTrial: true })`) archives the default public trial `plan-trial` before inserting. Any test that asserts on `plan-trial` still being active must first re-activate it (archive competing public trials, then set `plan-trial.archivedAt = NULL`) or it will fail when the batch scope includes other payments tests.
