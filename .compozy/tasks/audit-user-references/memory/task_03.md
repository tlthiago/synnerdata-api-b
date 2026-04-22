# Task Memory: task_03.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Apply ADR-004 NOT VALID + VALIDATE CONSTRAINT pattern to the drizzle-generated FK migration and prove it applies cleanly on a fresh local DB.

## Important Decisions

- Migration layout: block A = 72 `ADD CONSTRAINT ... NOT VALID;` lines (one per audit column, preserving drizzle's original order); block B = 72 `VALIDATE CONSTRAINT ...;` lines in the same order. Both blocks use `--> statement-breakpoint` so drizzle's migrator runs each statement individually inside its single transaction per ADR-004.
- File rewritten in full via Write (not per-line Edit) because the file was still untracked from task_02 and the transformation touches every line — a full rewrite is easier to review than 72 incremental diffs.

## Learnings

- The generated FK lines use lowercase `ON DELETE set null ON UPDATE no action`. The `NOT VALID` keyword is appended between `no action` and the trailing `;` — Postgres parses it as `NOT VALID;`. Verified by successful migrator apply.
- Applying via `bun --env-file .env.test --bun drizzle-kit migrate` works even though `package.json`'s `db:migrate` script is pinned to `.env`. Invoking drizzle-kit directly with the test env file keeps production/dev DBs untouched.
- `db:test:reset` only drops the DB — it does not recreate it. Fresh-DB flow requires a subsequent `CREATE DATABASE` (and `pg_terminate_backend` if any session is still connected).
- Constraint count distribution: 26 `created_by` + 22 `updated_by` (missing on `ppe_delivery_items`, `ppe_delivery_logs`, `ppe_job_positions`, `project_employees`) + 24 `deleted_by` (missing on `ppe_delivery_logs`, `features`) = 72. Matches task_02's per-file column inventory.

## Files / Surfaces

- `src/db/migrations/0039_audit_fk_references.sql` — 144 lines, rewritten with NOT VALID + VALIDATE pattern.
- `src/db/migrations/meta/_journal.json` — unchanged by task_03 (drizzle-kit already recorded `0039_audit_fk_references` during task_02).

## Errors / Corrections

- Initial psql heredoc invocation (`docker exec ... psql ... <<'EOF'`) produced no output because docker exec was not attached to stdin; corrected by adding `-i` (`docker exec -i ... psql ...`).
- Dropping the test DB initially failed with "being accessed by other users"; resolved by running `SELECT pg_terminate_backend(pid) ...` first.

## Ready for Next Run

- Migration file is ready for commit (auto-commit disabled for this run per caller).
- Task 04 can now sweep `__tests__/` and `src/test/helpers/` against the migrated DB — FKs are active and enforced there.
