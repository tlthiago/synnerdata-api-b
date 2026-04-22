---
status: pending
title: Export `auditUserSchema` + `mapAuditRelations` helper
type: backend
complexity: low
dependencies: []
---

# Task 01: Export `auditUserSchema` + `mapAuditRelations` helper

## Overview

Introduce the shared Zod schema `auditUserSchema` (`{ id, name } | null`) and the type-safe mapping helper `mapAuditRelations<T>` that converts Drizzle relational query results into the API payload shape. These are the primitives every future module (starting with cost-centers) imports to expose user attribution consistently across the 26-table surface.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST export `auditUserSchema` as `z.object({ id: z.string(), name: z.string() }).nullable()` from `src/lib/responses/response.types.ts`
- MUST export `AuditUser` as the inferred TypeScript type (`z.infer<typeof auditUserSchema>`)
- MUST export a generic helper `mapAuditRelations<T>` accepting an object with `createdBy`/`updatedBy`/`deletedBy` (text columns) and `createdByUser`/`updatedByUser`/`deletedByUser` (relation objects) and returning an object where the three `*By` keys hold `AuditUser` values
- MUST NOT modify any existing export, schema, or helper in the target file
- MUST include `.describe()` metadata on the Zod schema for OpenAPI generation consistency with other schemas in the file
</requirements>

> **Scope note (Phase 1+2 only)**: the helper's generic signature in this task assumes the full triple (`createdBy` + `updatedBy` + `deletedBy` — same shape as cost-centers). Five tables in the schema carry only a subset (`ppe_delivery_logs`: only `created_by`; `ppe_delivery_items`, `ppe_job_positions`, `project_employees`: no `updated_by`; `features` in `payments.ts`: no `deleted_by`). None of them has a user-facing CRUD endpoint today and none is in scope for Phase 1+2. If a Phase 3 PR ever targets one of them, a partial-column variant of `mapAuditRelations` (or a relaxed generic) will be introduced in that PR — intentionally deferred so this helper ships simple.

## Subtasks

- [ ] 01.1 Add `auditUserSchema` Zod export at a logical position among existing schemas in `response.types.ts`
- [ ] 01.2 Export `AuditUser` as the inferred type
- [ ] 01.3 Implement and export `mapAuditRelations<T>` generic helper
- [ ] 01.4 Create unit-test coverage exercising schema validation (happy, null, invalid) and mapping reshape (populated, null, mixed)

## Implementation Details

See TechSpec **"Core Interfaces" → "Shared Zod helper"** and **"Mapping helper"** sections for the canonical definitions and exact signatures. Implementation must match that code verbatim except for positional / style choices the existing file already enforces.

### Relevant Files

- `src/lib/responses/response.types.ts` — target file; already exports `successResponseSchema`, `paginatedResponseSchema`, and error schemas. New exports should sit adjacent to related primitives.

### Dependent Files

- `src/modules/organizations/cost-centers/cost-center.model.ts` — will import `auditUserSchema` in task_06
- `src/modules/organizations/cost-centers/cost-center.service.ts` — will import `mapAuditRelations` in task_06
- Every module migrated in Phase 3 will import both

### Related ADRs

- [ADR-002: API Contract Shape](adrs/adr-002.md) — defines the `{ id, name } | null` shape this helper encodes
- [ADR-003: Service Query Pattern](adrs/adr-003.md) — defines the mapping bridge between Drizzle relation keys and payload keys

## Deliverables

- New exports `auditUserSchema`, `AuditUser`, and `mapAuditRelations` in `src/lib/responses/response.types.ts`
- Unit tests with 80%+ coverage **(REQUIRED)**
- Integration tests: N/A — pure utility exports exercised downstream by task_06 integration tests

## Tests

- Unit tests:
  - [ ] `auditUserSchema.parse({ id: "user-1", name: "João" })` returns the object unchanged
  - [ ] `auditUserSchema.parse(null)` returns `null`
  - [ ] `auditUserSchema.parse({ id: 123, name: "João" })` throws (id is not a string)
  - [ ] `auditUserSchema.parse({ id: "user-1" })` throws (name missing)
  - [ ] `auditUserSchema.parse({ id: "user-1", name: "João", email: "x@y" })` strips unknown keys or throws per Zod's default mode — verify expected behavior
  - [ ] `mapAuditRelations` with all three `*User` keys populated drops the three `*By` text columns and returns them as `AuditUser` values under the same `*By` keys
  - [ ] `mapAuditRelations` with all three `*User` keys `null` returns `null` under all three `*By` keys
  - [ ] `mapAuditRelations` preserves non-audit fields (id, name, createdAt, etc.) unchanged
  - [ ] `mapAuditRelations` preserves the declared return type inferred from the input (TypeScript compile check via a small type assertion in the test file)
- Integration tests:
  - [ ] N/A — helper is exercised through module-level tests in task_06
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80% on the new exports
- `import { auditUserSchema, mapAuditRelations, type AuditUser } from "@/lib/responses/response.types";` compiles in any module
- No changes to existing exports in the file
