---
status: pending
title: Audit + fix test fixtures and seed helpers for FK activation
type: test
complexity: high
dependencies:
  - task_03
---

# Task 04: Audit + fix test fixtures and seed helpers for FK activation

## Overview

With the FK constraints now active from task_03, systematically audit every direct `db.insert` / `db.update` / `db.delete` statement across `src/**/__tests__/` and `src/test/helpers/**` (including the `seed-organization` helper chain) that writes to `created_by` / `updated_by` / `deleted_by` columns; refactor any fixture using placeholder or unverified user IDs to resolve real users via existing helpers. Run the full local test suite and the seed script smoke test to prove the suite is green with FK enforced before PR 1 merges.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST grep `src/**/__tests__/` AND `src/test/helpers/**` for direct `db.insert`, `db.update`, and `db.delete` statements writing to `createdBy`, `updatedBy`, or `deletedBy`
- MUST replace any hard-coded or placeholder user IDs with references to real users obtained via existing helpers (`createTestUser`, `createTestUserWithOrganization`, or equivalents)
- MUST cover the `seed-organization` chain (`src/test/helpers/seed-organization.ts` and every `createTestX` helper it fans out to) even though those helpers live outside `__tests__/`
- MUST achieve 100% pass on `bun run test` locally before PR 1 is merged
- MUST run `bun run db:seed:org` against a seeded DB end-to-end as a smoke test
- MUST NOT introduce new test helpers unless the existing surface is insufficient; prefer extending existing helpers
</requirements>

## Subtasks

- [ ] 04.1 Catalog every fixture-writing site via grep across `src/**/__tests__/` and `src/test/helpers/**`
- [ ] 04.2 For each site, identify whether the current user-id source resolves to a real users-table row
- [ ] 04.3 Refactor placeholder or unverified sites to resolve a real user via factory or helper
- [ ] 04.4 Run the full test suite (`bun run test`) and iterate on failures until 100% pass
- [ ] 04.5 Execute `bun run db:seed:org` end-to-end against a seeded DB; confirm no FK violations

## Implementation Details

See TechSpec **"Testing Approach"** and the **"Impact Analysis"** row for `src/test/helpers/seed-organization.ts`. Existing user helpers at `src/test/helpers/user.ts` (`createTestUser`, `createTestUserWithOrganization`) create real users via Better Auth; reuse them rather than inventing new ones.

### Relevant Files

- `src/test/helpers/user.ts` — canonical user-creation helpers
- `src/test/helpers/seed-organization.ts` — seed helper chain with `userId` propagation
- `src/db/seeds/organization.ts` — seed entry script; resolves a real user before calling the helper
- `src/**/__tests__/*.test.ts` — candidate fixture-writing sites (dozens of files across modules)
- `package.json` scripts — `test`, `test:affected`, `db:seed:org`, `db:test:reset`

### Dependent Files

- No new files created; changes are confined to fixture and helper sites

### Related ADRs

- [ADR-004: Migration Strategy](adrs/adr-004.md) — FK activation from task_03 is what makes this audit necessary

## Deliverables

- Every test fixture writing to audit columns references a real user
- Full local test suite `bun run test` passes 100% **(REQUIRED)**
- `bun run db:seed:org` smoke test completes with no FK violations **(REQUIRED)**
- No new `.skip` or `.only` markers in committed test files

## Tests

- Unit tests:
  - [ ] N/A — task is about fixing existing tests, not creating new unit coverage
- Integration tests:
  - [ ] `bun run test` completes with zero failures
  - [ ] `bun run db:seed:org` executes without raising any FK violation (exit code 0)
  - [ ] Any previously flaky fixture that relied on implicit null `created_by` values either still resolves to null (unchanged behavior) or uses a real user id (refactored)
- Test coverage target: preserve current coverage baseline; do not introduce coverage regressions
- All tests must pass

## Success Criteria

- Full local test suite green
- Seed script smoke test green
- No new `.skip`, `.only`, or `.todo` markers in committed tests
- Every fixture writing to audit columns demonstrably sources a real user-id
