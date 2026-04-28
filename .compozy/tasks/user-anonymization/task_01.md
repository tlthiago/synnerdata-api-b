---
status: completed
title: Lib infrastructure additions (BadRequestError + anonymizedAt column + AuditAction.anonymize)
type: backend
complexity: low
dependencies: []
---

# Task 01: Lib infrastructure additions (BadRequestError + anonymizedAt column + AuditAction.anonymize)

## Overview
Lay the additive foundation that downstream tasks depend on: a `BadRequestError` class for the project's `AppError` hierarchy, a nullable `anonymized_at` column on the `users` table with a generated migration, and a new `"anonymize"` value on the `AuditAction` enum. All three changes are additive and low-risk; they ship together because nothing else in the PRD can land until they exist.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add a `BadRequestError` class to `src/lib/errors/http-errors.ts` extending `AppError` with `status = 400 as const` and `code = "BAD_REQUEST"` as default. The constructor MUST accept an optional `{ code?: string; details?: unknown }` argument and override `this.code` when `code` is supplied. This single class must support the four error codes the anonymize flow needs (`ADMIN_ACCOUNT_DELETE_FORBIDDEN`, `ACTIVE_SUBSCRIPTION`, `ORGANIZATION_HAS_MEMBERS`, `INVALID_PASSWORD`).
- MUST add a nullable `anonymizedAt: timestamp("anonymized_at", { withTimezone: true })` column to the `users` table in `src/db/schema/auth.ts`.
- MUST run `bun run db:generate` to produce the next sequential migration (the latest committed migration is `0040_apikeys_better_auth_1_6.sql`, so the new file is expected to be `0041_<auto-slug>.sql`) and commit BOTH the generated `.sql` file under `src/db/migrations/` AND the corresponding `meta/_journal.json` + `meta/0041_snapshot.json` updates produced by drizzle-kit.
- MUST add `"anonymize"` to the `AuditAction` literal union in `src/modules/audit/audit.model.ts`. Order: append at the end of the existing union so existing rows are unaffected.
- MUST NOT alter any existing fields, defaults, or constraints; all changes are strictly additive.
- MUST verify zero impact on existing rows: the migration applies to a populated DB without errors and existing rows have `anonymized_at IS NULL` post-migration.
</requirements>

## Subtasks
- [x] 1.1 Add `BadRequestError` class in `src/lib/errors/http-errors.ts` following the `ValidationError`/`ConflictError` pattern, with constructor accepting an optional `{ code?: string; details?: unknown }` argument.
- [x] 1.2 Add `anonymizedAt` column to the `users` Drizzle schema in `src/db/schema/auth.ts`.
- [x] 1.3 Run `bun run db:generate` and commit the generated `0041_<slug>.sql` plus drizzle-kit's `meta/_journal.json` and `meta/0041_snapshot.json` updates. *(Hand-crafted `0041_add_users_anonymized_at.sql` + journal entry; no `0041_snapshot.json` produced — `drizzle-kit generate` blocked by pre-existing snapshot-chain collision in 35-38, same workaround used by commit `46803d6` for migrations 0039/0040.)*
- [x] 1.4 Append `"anonymize"` to the `AuditAction` union in `src/modules/audit/audit.model.ts`.
- [x] 1.5 Run `bun run db:migrate` against the test DB to confirm the migration applies cleanly.
- [x] 1.6 Add unit tests for `BadRequestError` covering default code and overridden code.

## Implementation Details
See TechSpec section "Data Models" for the column shape and "Impact Analysis" for the file list.

The `BadRequestError` extends the pattern at `src/lib/errors/http-errors.ts:34-37` (`ValidationError`). Because `AppError`'s base constructor (see `src/lib/errors/base-error.ts:19-49`) only accepts `(message, details?)`, the new class shadows `code` as a class property and reassigns it in the constructor when an override is provided.

Migration generation uses Drizzle's snake_case casing (per `drizzle.config.ts`). The generated SQL is `ALTER TABLE users ADD COLUMN anonymized_at TIMESTAMP WITH TIME ZONE` — no default, nullable.

### Relevant Files
- `src/lib/errors/http-errors.ts` — destination of `BadRequestError` (line ~34 region for sibling reference).
- `src/lib/errors/base-error.ts:19-49` — `AppError` base contract.
- `src/db/schema/auth.ts:25-41` — `users` table definition; add `anonymizedAt` here.
- `drizzle.config.ts` — confirms snake_case + migrations output path.
- `src/modules/audit/audit.model.ts:4-13` — `AuditAction` union to extend.
- `src/db/migrations/0040_apikeys_better_auth_1_6.sql` — latest migration for naming reference.

### Dependent Files
- `src/lib/auth/hooks.ts` — `validateUserBeforeDelete` will start throwing `BadRequestError` in task_03.
- `src/modules/auth/anonymize/anonymize.service.ts` — service in task_05 reads `anonymizedAt` and writes `AuditAction.anonymize`.
- `src/modules/audit/audit.service.ts` — task_02 extension uses the same model file.

### Related ADRs
- [ADR-005: Refactor validateUserBeforeDelete to AppError](adrs/adr-005.md) — `BadRequestError` is the target error class.
- [ADR-006: Minimal non-PII payload for the anonymization audit-log entry](adrs/adr-006.md) — relies on the new `"anonymize"` action existing.

## Deliverables
- New `BadRequestError` class in `src/lib/errors/http-errors.ts`.
- New `anonymizedAt` column on `users` table.
- Generated migration `.sql` + `meta/` snapshot committed under `src/db/migrations/`.
- New `"anonymize"` value in `AuditAction` union.
- Unit tests for `BadRequestError` with 80%+ coverage **(REQUIRED)**.
- Migration applies cleanly against a populated test DB **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `BadRequestError` with no options has `status = 400` and `code = "BAD_REQUEST"`.
  - [ ] `BadRequestError("msg", { code: "ADMIN_ACCOUNT_DELETE_FORBIDDEN" })` has `code === "ADMIN_ACCOUNT_DELETE_FORBIDDEN"`.
  - [ ] `BadRequestError("msg", { details: { foo: 1 } })` exposes `details` on `toResponse()`.
  - [ ] An instance of `BadRequestError` is `instanceof AppError`.
- Integration tests:
  - [ ] After running `bun run db:migrate`, querying `users` returns rows with `anonymized_at = null`.
  - [ ] TypeScript compilation of `audit.model.ts` accepts `"anonymize"` as a valid `AuditAction` (covered by type-check pass in CI).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `bun run db:migrate` exits 0 against the test database with the new migration applied
- `npx ultracite check` passes on the modified files
- No changes to existing rows or fields beyond the additive column
