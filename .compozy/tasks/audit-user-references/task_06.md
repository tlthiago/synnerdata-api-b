---
status: completed
title: Pilot — refactor `cost-centers` module (model + service + tests)
type: refactor
complexity: medium
dependencies:
  - task_01
  - task_03
  - task_04
---

# Task 06: Pilot — refactor `cost-centers` module (model + service + tests)

## Overview

Apply the canonical user-attribution pattern end-to-end in the `cost-centers` module, serving as the reference implementation for the Phase 3 rollout. Extend the response Zod schema to include `createdBy`/`updatedBy`/`deletedBy` as `AuditUser` objects, refactor `CostCenterService` to use `db.query` + `with` for reads and the transaction-wrapped write-then-reread pattern for mutations, and extend the 5 integration tests with populated and null attribution cases (including hard-deleted creator to exercise `ON DELETE SET NULL`).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST extend `costCenterDataSchema` in `cost-center.model.ts` with `createdBy`, `updatedBy`, `deletedBy` typed as `auditUserSchema` from task_01
- MUST refactor `CostCenterService.findByIdOrThrow` and `.findAll` to use `db.query.costCenters.findFirst/findMany({ with })` plus `mapAuditRelations`
- MUST refactor `CostCenterService.create`, `.update`, `.delete` to use the transaction-wrapped write-then-reread pattern (see TechSpec "Core Interfaces")
- MUST preserve every existing behavioral guarantee (soft-delete filtering, name uniqueness check, cascading org-scope check)
- MUST extend every one of the 5 `__tests__/*.test.ts` files with assertions verifying the new fields on the response
- MUST add explicit test coverage for: populated audit case, `createdBy: null` on system-seeded record, `createdBy: null` after the creator user is hard-deleted
- MUST keep OpenAPI reflection accurate (Zod schema update propagates automatically through the existing Elysia + OpenAPI plugin)
</requirements>

## Subtasks

- [x] 06.1 Extend `costCenterDataSchema` with three `auditUserSchema` fields
- [x] 06.2 Refactor read methods (`findByIdOrThrow`, `findAll`) to use the Relational API + `mapAuditRelations`
- [x] 06.3 Refactor write methods (`create`, `update`, `delete`) with `db.transaction()` wrapping write-then-reread
- [x] 06.4 Update existing assertions in all 5 test files to verify the new fields
- [x] 06.5 Add the null-case integration tests (system-created record, hard-deleted creator user)
- [x] 06.6 Run the affected test suite to 100% pass
- [x] 06.7 Spot-check the OpenAPI output (dev server `/swagger` or equivalent) to confirm the new shape is documented

## Implementation Details

See TechSpec **"Core Interfaces"** for every code pattern (schema extension, service read, service write-then-reread, `mapAuditRelations` usage). Do not copy the code; follow the patterns in the service.

### Relevant Files

- `src/modules/organizations/cost-centers/cost-center.model.ts` — extend response schema
- `src/modules/organizations/cost-centers/cost-center.service.ts` — refactor all 5 CRUD methods
- `src/modules/organizations/cost-centers/__tests__/create-cost-center.test.ts`
- `src/modules/organizations/cost-centers/__tests__/list-cost-centers.test.ts`
- `src/modules/organizations/cost-centers/__tests__/get-cost-center.test.ts`
- `src/modules/organizations/cost-centers/__tests__/update-cost-center.test.ts`
- `src/modules/organizations/cost-centers/__tests__/delete-cost-center.test.ts`
- `src/lib/responses/response.types.ts` — source of `auditUserSchema`, `AuditUser`, `mapAuditRelations` (task_01)

### Dependent Files

- `src/modules/organizations/cost-centers/index.ts` — controller; picks up updated Zod schema automatically via re-exports in `cost-center.model.ts`

### Related ADRs

- [ADR-002: API Contract Shape](adrs/adr-002.md)
- [ADR-003: Service Query Pattern](adrs/adr-003.md)

## Deliverables

- Updated `cost-center.model.ts` with the three new fields in `costCenterDataSchema`
- Refactored `cost-center.service.ts` using Relational API + transaction-wrapped writes
- 5 updated integration test files with new assertions + null cases
- All cost-centers integration tests green (`NODE_ENV=test bun test --env-file .env.test src/modules/organizations/cost-centers/__tests__/`) **(REQUIRED)**
- Unit tests: N/A — service is thin over Drizzle; logic coverage comes from integration tests
- Test coverage target: >=80% for modified service methods

## Tests

- Unit tests:
  - [x] N/A — service exercises DB through integration tests; no logic worth isolating from Drizzle
- Integration tests:
  - [x] POST `/v1/cost-centers` returns 200 with `createdBy: { id, name }` populated, `updatedBy` populated, `deletedBy: null`
  - [x] GET `/v1/cost-centers` returns each item with populated `createdBy`/`updatedBy` and `deletedBy: null`
  - [x] GET `/v1/cost-centers/:id` returns the three new fields correctly populated for an active record
  - [x] PUT `/v1/cost-centers/:id` returns `updatedBy: { id, name }` matching the acting session user
  - [x] DELETE `/v1/cost-centers/:id` returns the record with `deletedBy: { id, name }` populated
  - [x] GET `/v1/cost-centers/:id` on a record inserted directly with `createdBy = null` returns `createdBy: null` without Zod validation errors
  - [x] After hard-deleting the creator user via `db.delete(users)...`, GET `/v1/cost-centers/:id` returns `createdBy: null` (validates end-to-end wiring of `ON DELETE SET NULL`)
- Test coverage target: >=80% on `cost-center.service.ts`
- All tests must pass

## Success Criteria

- All cost-centers integration tests passing
- Test coverage >=80% on modified service methods
- OpenAPI spec reflects the new response shape
- No regression in unrelated modules or suite-wide tests
- Pattern is clearly implemented as the canonical reference for Phase 3 (documented in task_07)
