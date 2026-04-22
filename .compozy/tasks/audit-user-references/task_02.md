---
status: completed
title: Add FK + `relations()` to all 26 domain schema files
type: infra
complexity: high
dependencies: []
---

# Task 02: Add FK + `relations()` to all 26 domain schema files

## Overview

Add `.references(() => users.id, { onDelete: "set null" })` to every existing `created_by` / `updated_by` / `deleted_by` column across 26 domain schema files, and extend each file's `relations()` block with one-to-one relations to `users` named `createdByUser` / `updatedByUser` / `deletedByUser`. This establishes the database-level referential integrity and the `relations()` metadata that downstream services will consume via Drizzle's Relational API.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `.references(() => users.id, { onDelete: "set null" })` to every existing audit column on the 26 target tables, preserving all other column attributes (type, nullability, indexes)
- MUST extend each file's existing `*Relations` export with `createdByUser` / `updatedByUser` / `deletedByUser` one-to-one relations, matched to the actual columns on the table (skip any relation whose underlying column does not exist on that specific table — e.g., `ppe_delivery_logs` has only `created_by`)
- MUST use distinct `relationName` strings per relation (e.g., `costCenterCreator`, `branchCreator`) so Drizzle can disambiguate multiple relations to the same target (`users`)
- MUST NOT change column names, nullability, indexes, or any unrelated schema element
- MUST produce TypeScript code that compiles (`bun x tsc --noEmit` passes)
- MUST produce a drizzle-kit diff containing only the expected `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` statements — no unexpected schema drift
</requirements>

## Subtasks

- [x] 02.1 Import `users` from `./auth` in every target schema file that does not already import it
- [x] 02.2 Update every audit column declaration with the `.references()` clause
- [x] 02.3 Extend each `*Relations` export with the corresponding `createdByUser` / `updatedByUser` / `deletedByUser` entries (skipping those whose columns do not exist on the table)
- [x] 02.4 Run `bun db:generate` against the updated schema and inspect the produced migration diff for correctness
- [x] 02.5 Verify TypeScript compilation (`bun x tsc --noEmit`) passes with zero errors

## Implementation Details

See TechSpec **"Core Interfaces" → "Canonical schema file shape"** for the exact pattern, and the **"Relation naming convention"** note for the `*User` suffix rationale. The 26 target files are listed below in Relevant Files; use the existing `memberRelations` block in `src/db/schema/auth.ts:224-233` as a shape reference for multi-relation blocks.

### Relevant Files

- `src/db/schema/absences.ts` — 3 audit columns
- `src/db/schema/accidents.ts` — 3 audit columns
- `src/db/schema/admin-org-provisions.ts` — 3 audit columns
- `src/db/schema/billing-profiles.ts` — 3 audit columns
- `src/db/schema/branches.ts` — 3 audit columns
- `src/db/schema/cost-centers.ts` — 3 audit columns
- `src/db/schema/cpf-analyses.ts` — 3 audit columns
- `src/db/schema/employees.ts` — 3 audit columns
- `src/db/schema/job-classifications.ts` — 3 audit columns
- `src/db/schema/job-positions.ts` — 3 audit columns
- `src/db/schema/labor-lawsuits.ts` — 3 audit columns
- `src/db/schema/medical-certificates.ts` — 3 audit columns
- `src/db/schema/organization-profiles.ts` — 3 audit columns
- `src/db/schema/payments.ts` — ONLY the `features` table has audit columns (2: `created_by`, `updated_by`). Other tables in this file must not be touched.
- `src/db/schema/ppe-deliveries.ts` — 3 audit columns
- `src/db/schema/ppe-delivery-items.ts` — 2 audit columns (`created_by`, `deleted_by`)
- `src/db/schema/ppe-delivery-logs.ts` — 1 audit column (`created_by`)
- `src/db/schema/ppe-items.ts` — 3 audit columns
- `src/db/schema/ppe-job-positions.ts` — 2 audit columns (`created_by`, `deleted_by`)
- `src/db/schema/project-employees.ts` — 2 audit columns (`created_by`, `deleted_by`)
- `src/db/schema/projects.ts` — 3 audit columns
- `src/db/schema/promotions.ts` — 3 audit columns
- `src/db/schema/sectors.ts` — 3 audit columns
- `src/db/schema/terminations.ts` — 3 audit columns
- `src/db/schema/vacations.ts` — 3 audit columns
- `src/db/schema/warnings.ts` — 3 audit columns
- `src/db/schema/auth.ts:224-233` — reference implementation for a multi-relation block (`memberRelations`)

### Dependent Files

- `src/db/schema/index.ts` — `fullSchema` barrel picks up new relations automatically via the existing `*Relations` exports
- `src/db/migrations/0038_audit_fk_references.sql` (new, task_03) — drizzle-kit will diff against these schema changes to produce the migration

### Related ADRs

- [ADR-002: API Contract Shape](adrs/adr-002.md) — establishes the FK direction
- [ADR-003: Service Query Pattern](adrs/adr-003.md) — consumes these relations via `db.query` + `with`
- [ADR-004: Migration Strategy](adrs/adr-004.md) — migration in task_03 consumes the schema diff

## Deliverables

- 26 schema files updated consistently with FK + relations
- Zero TypeScript errors (`bun x tsc --noEmit` green)
- `bun db:generate` produces a migration diff containing only the expected FK additions
- Unit tests: N/A — schema declarations are configuration; correctness is verified by migration apply + downstream integration tests
- Integration tests: downstream tests in task_03 and task_04 verify constraint activation and test-suite stability **(REQUIRED coverage path)**

## Tests

- Unit tests:
  - [ ] N/A — schema files are declarative configuration exercised by Drizzle at migration + query time
- Integration tests:
  - [ ] `bun db:generate` produces a migration file containing `ALTER TABLE ... ADD CONSTRAINT` statements for every audit column on every listed table and nothing else (validated by diff review in this task; applied in task_03)
  - [ ] Resulting TS type inferred via `typeof costCenters.$inferSelect` continues to include `createdBy: string | null`, `updatedBy: string | null`, `deletedBy: string | null` with unchanged nullability
- Test coverage target: N/A for this task; downstream tasks maintain suite-level coverage
- All tests must pass (downstream)

## Success Criteria

- All 26 files modified consistently with FK + relations
- `bun x tsc --noEmit` passes
- `bun db:generate` produces expected diff with no unrelated changes
- No drift in existing column definitions, indexes, or nullability
