---
status: pending
title: Generate + manually edit migration `0038_audit_fk_references.sql` (`NOT VALID + VALIDATE`)
type: infra
complexity: medium
dependencies:
  - task_02
---

# Task 03: Generate + manually edit migration `0038_audit_fk_references.sql` (`NOT VALID + VALIDATE`)

## Overview

Run `drizzle-kit generate` against the schema updates from task_02 to produce the raw SQL migration, then manually edit the file to apply Postgres's safe two-step FK pattern (`NOT VALID` first, `VALIDATE CONSTRAINT` after) inline in the same migration. Verify the migration applies cleanly against a fresh local database and that every expected constraint is present and validated.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST run `bun db:generate` to produce the initial migration file
- MUST edit the generated file so every `ALTER TABLE ... ADD CONSTRAINT ... REFERENCES "public"."users"("id") ON DELETE SET NULL;` is changed to include `NOT VALID`
- MUST append `ALTER TABLE ... VALIDATE CONSTRAINT "<constraint_name>";` statements for every constraint added, using the same order and Drizzle's conventional constraint names
- MUST commit the edited migration file; drizzle-kit's `_journal.json` should remain accurate for the new migration
- MUST verify the migration applies cleanly on a fresh local DB (`bun db:push` or reset + `bun db:migrate` flow)
- MUST NOT split the migration into multiple files; a single file is required per ADR-004
</requirements>

## Subtasks

- [ ] 03.1 Run `bun db:generate` and confirm the raw migration file is produced
- [ ] 03.2 Edit every `ADD CONSTRAINT ... ON DELETE SET NULL;` statement to append `NOT VALID` before the semicolon
- [ ] 03.3 Append an `ALTER TABLE ... VALIDATE CONSTRAINT "<name>";` block covering every constraint added
- [ ] 03.4 Apply the migration locally against a fresh database and confirm zero errors
- [ ] 03.5 Query `pg_constraint` and `information_schema.table_constraints` to verify expected count and validation status of new FK constraints

## Implementation Details

See TechSpec **"Core Interfaces"** (migration file location) and **ADR-004 "Implementation Notes"** for the generation → manual-edit → apply workflow. The `_journal.json` index is managed automatically by drizzle-kit; do not edit it by hand.

### Relevant Files

- `src/db/migrations/0038_audit_fk_references.sql` (new; exact number determined by current journal state — use whatever drizzle-kit assigns)
- `src/db/migrations/meta/_journal.json` — auto-updated; reviewed but not manually edited
- `drizzle.config.ts` (root) — confirm it points to `src/db/migrations`
- `package.json` — scripts `db:generate`, `db:migrate`, `db:test:reset`

### Dependent Files

- `src/db/schema/*.ts` (26 files from task_02) — source of the diff
- All test fixtures and seed helpers (task_04) — their behavior under active FK is the downstream test of this migration

### Related ADRs

- [ADR-004: Migration Strategy](adrs/adr-004.md) — prescribes the single-file `NOT VALID + VALIDATE` pattern

## Deliverables

- New migration file in `src/db/migrations/` with manually edited `NOT VALID + VALIDATE` SQL
- Successful local migration apply on a reset DB
- Unit tests: N/A — migration is declarative SQL; behavior verified by the integration checks below
- Integration tests listed below **(REQUIRED verification)**

## Tests

- Unit tests:
  - [ ] N/A — migration file is declarative SQL
- Integration tests:
  - [ ] After `bun db:migrate` on a fresh DB, `SELECT COUNT(*) FROM pg_constraint WHERE conname LIKE '%_created_by_users_id_fk';` returns the expected count (matches the number of tables with `created_by`)
  - [ ] Every FK added shows `convalidated = true` in `pg_constraint` (i.e., `VALIDATE` ran successfully)
  - [ ] Attempting `INSERT INTO cost_centers (id, organization_id, name, created_by) VALUES ('cc-test', <valid_org>, 'x', 'non-existent-user');` raises a FK violation (SQLSTATE `23503`)
  - [ ] `INSERT` with a valid `users.id` in `created_by` succeeds
  - [ ] After `DELETE FROM users WHERE id = <id with cost_center reference>`, the related `cost_centers.created_by` is updated to `NULL` (confirming `ON DELETE SET NULL`)
- Test coverage target: qualitative — all integration checks above must be manually verified at least once against the applied migration and captured in the PR description
- All tests must pass

## Success Criteria

- Migration file applies cleanly on fresh local DB
- All expected FK constraints exist and are validated
- FK violation raised on invalid insert
- `ON DELETE SET NULL` behavior verified end-to-end
- No regression in existing tests run against the migrated DB
