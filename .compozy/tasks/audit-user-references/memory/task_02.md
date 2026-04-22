# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- FK + `relations()` added to 26 domain schemas; migration diff (`0039_audit_fk_references.sql`) produced with only FK statements.

## Important Decisions

- Migration filename is `0039_audit_fk_references.sql` (not `0038` as written in techspec/task_03) because migration `0038_fix-default-trial-plan-archived` was already committed when this task ran.
- `relationName` convention: `<singular-entity>Creator`/`Updater`/`Deleter` (e.g., `costCenterCreator`, `ppeDeliveryLogCreator`). Matches techspec example.

## Learnings

- Drizzle-kit snapshot chain was broken pre-existing: `0035_snapshot.json` through `0038_snapshot.json` shared identical `id`/`prevId` UUIDs because migrations 0036–0038 were data-only / index-only and the snapshot file was copy-pasted. Fixed chain by assigning fresh UUIDs to 0036–0038 and linking `prevId` forward. Required before `drizzle-kit generate` would run.
- Snapshot `0038_snapshot.json` also had stale `subscription_plans_single_active_trial.where` clause (missing `AND organization_id IS NULL` that migration 0037 added). Fixed the where clause in-place so drizzle-kit diff only contained the new FK additions.
- Biome/ultracite strips unused imports between Edit calls. Safe pattern for multi-step edits touching imports: add `.references()` first, then relations block, then the `users` import last (or use Write to rewrite the whole file in one shot).
- `bun x tsc --noEmit` runs silently on success; zero output === zero errors.

## Files / Surfaces

- 26 schema files under `src/db/schema/`: absences, accidents, admin-org-provisions, billing-profiles, branches, cost-centers, cpf-analyses, employees, job-classifications, job-positions, labor-lawsuits, medical-certificates, organization-profiles, payments (features only), ppe-deliveries, ppe-delivery-items, ppe-delivery-logs, ppe-items, ppe-job-positions, project-employees, projects, promotions, sectors, terminations, vacations, warnings.
- New migration: `src/db/migrations/0039_audit_fk_references.sql` (72 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` statements; no unexpected drift).
- Snapshot-chain fixes: `src/db/migrations/meta/0036_snapshot.json`, `0037_snapshot.json`, `0038_snapshot.json` (regenerated `id`/`prevId`; 0038 also patched `subscription_plans_single_active_trial.where`).
- Added `src/db/migrations/meta/0039_snapshot.json` and journal entry 39.
- `.env` in worktree root is symlinked to main repo `.env` (needed for `drizzle-kit generate`).

## Errors / Corrections

- First attempt: biome stripped `users` import from `absences.ts`. Re-added manually; afterwards switched to Write-based rewrites or import-last Edit ordering.
- First drizzle-kit run emitted DROP/CREATE for `subscription_plans_single_active_trial` due to snapshot drift; patched snapshot and regenerated for a clean diff.

## Ready for Next Run

- Task 03 consumes `0039_audit_fk_references.sql` (update its internal filename references from `0038_` to `0039_`). Apply `NOT VALID` / `VALIDATE CONSTRAINT` per ADR-004.
- Snapshot chain fixes and `.env` symlink are in the working tree but uncommitted; reviewer must decide whether to keep them in the Phase 1 PR or separate infra PR.
