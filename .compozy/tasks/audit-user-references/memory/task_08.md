# Task Memory: task_08.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Prepare the Phase 1 deploy gate so the operator cannot forget G1 (pre-deploy orphan audit), G2 (baseline metrics), G3 (post-deploy orphan audit), and G4/G5 (24h/48h metrics comparison). Execution of G1–G5 happens at deploy time and is not in this task's scope.

## Important Decisions

- The 2026-04-21 ad-hoc audit SQL was not persisted. Authored a canonical version at `.compozy/tasks/audit-user-references/scripts/orphan-audit.sql`. Source of truth for the `(table, column)` set is migration `0039_audit_fk_references.sql`; the audit script enumerates exactly those 72 pairs so `VALIDATE CONSTRAINT` scope and audit scope match.
- Script runs inside `BEGIN;…ROLLBACK;` with `CREATE TEMP VIEW` — zero side effects, session-scoped. Uses psql `\echo` meta-commands for result-set labels; header comment notes how to strip them for non-psql clients.
- Per-column summary filters `WHERE column IS NOT NULL` to keep orphan detection sharp; as a side effect, pairs with zero populated refs do not appear in the summary. Header comment flags this; `Totals.total_refs` is the authoritative coverage signal.
- Kept task_08 frontmatter `status: pending` and master `_tasks.md` entry `pending`. Preparation subtasks (08.0a, 08.0b) marked done; execution subtasks (08.1–08.6) stay unchecked until the operator runs G1–G5 at deploy time.

## Learnings

- Local test DB has 3191 populated audit refs (vs. 930 on prod 2026-04-21) — expected, test DB is seeded with more data. Orphan count = 0 on test DB, confirming FKs are compatible with the current data.
- Of 72 `(table, column)` pairs, 54 have ≥1 populated ref on the test DB. Expect similar or lower coverage on prod (smaller dataset).
- `psql` is not on host PATH; the running Postgres is a Docker container named `synnerdata-api-b`. Used `docker exec -i synnerdata-api-b psql -U postgres -d synnerdata-api-b-test` for the dry-run.

## Files / Surfaces

- Created: `.compozy/tasks/audit-user-references/scripts/orphan-audit.sql`
- Created: `.compozy/tasks/audit-user-references/deploy-gate.md`
- Modified: `.compozy/tasks/audit-user-references/task_08.md` — added preparation subtasks, split deliverables into preparation (done) vs. execution (pending)

## Errors / Corrections

- None.

## Ready for Next Run

- Preparation artifacts committed-ready. Awaiting manual commit along with the rest of Phase 1.
- At PR 1 merge time the operator follows `deploy-gate.md` and pastes evidence into PR description using the embedded template. After G5 clears, they tick subtasks 08.1–08.6 and flip task_08 status to `completed` in both the task file frontmatter and `_tasks.md`.
