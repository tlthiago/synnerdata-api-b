---
status: completed
title: Audit + fix test fixtures and seed helpers for FK activation
type: test
complexity: high
dependencies:
  - task_03
---

# Task 04: Audit + fix test fixtures and seed helpers for FK activation

## Overview

With the FK constraints now active from task_03, (a) systematically audit every direct `db.insert` / `db.update` / `db.delete` statement across `src/**/__tests__/` and `src/test/helpers/**` (including the `seed-organization` helper chain) that writes to `created_by` / `updated_by` / `deleted_by` columns and refactor placeholder user IDs to reference real users; (b) run the suite in small batches by module area (≤ 5 min each) to avoid compozy's activity-timeout gate while still catching any FK-related regression before PR 1 merges; (c) run the seed script smoke test.

**Context for this run**: a previous compozy run crashed on this task because `bun run test` ran in a silent background shell for >10 min, tripping compozy's default `--timeout 10m`. The redesign below batches the suite and forbids silent waits.

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
- MUST reset the test DB and re-apply the migration chain before running any batch, so the 72 audit FKs are active from a clean slate
- MUST run the suite in **foreground batches by module area** (enumerated under "Batching Plan" below) — each batch is a single blocking `bun test` invocation that emits live output. NO background shells, NO `ScheduleWakeup` with silent wait, NO "launch then sleep" patterns
- MUST emit a short status line between batches (e.g., `echo "batch X/Y OK (pass=N, fail=0)"`) so compozy's activity timer resets on each batch boundary
- MUST run `bun run db:seed:org` against a seeded DB end-to-end as a smoke test after all batches pass
- MUST NOT introduce new test helpers unless the existing surface is insufficient; prefer extending existing helpers
- MUST NOT mark the task completed until every batch returns zero failures AND the seed smoke test exits 0
</requirements>

> **Anti-patterns that caused the previous failure**:
> 1. **Silent-wait pattern**: launching `bun run test` in a background shell, then calling `ScheduleWakeup` + waiting without emitting any output. Compozy's activity timer (default 10 min) kills the task. **Never do this.**
> 2. **Monolithic suite run**: a single `bun run test` invocation spans >10 min of silent work between the first and last test. Even in foreground, the process may buffer output and look idle. **Break into batches that finish in ≤ 5 min each.**
> 3. **Moving on while the gate still runs**: do not start the next batch or subtask while the previous `bun test` has not exited. Always wait for the exit code synchronously in the foreground.

> **Exception to CLAUDE.md's "never run the full suite during development" rule**: the root CLAUDE.md (section "Execução de Testes") instructs contributors to only run tests related to the changed module and leave the full suite for CI. This task is an explicit, one-off exception justified by the blast radius of activating FK constraints across 26 tables. The batching plan below preserves the "don't shotgun the whole suite" spirit by executing in deliberate, named chunks with clear gates between them.

## Subtasks

- [x] 04.1 Grep every fixture-writing site across `src/**/__tests__/` and `src/test/helpers/**` for direct `db.insert/update/delete` touching `createdBy`/`updatedBy`/`deletedBy`; capture the list
- [x] 04.2 For each site, check whether the current user-id source resolves to a real `users` row; flag placeholders and hard-coded IDs
- [x] 04.3 Refactor flagged sites to resolve a real user via `createTestUser` / `createTestUserWithOrganization` / equivalents (no new helpers unless justified)
- [x] 04.4 Reset test DB (`bun run db:test:reset`) and re-apply migrations (`bun run db:migrate` or push against `.env.test`); verify the 72 audit FKs are present and validated (one short SQL query)
- [x] 04.5 Run the suite in the foreground batches listed under "Batching Plan" below. After each batch, emit a status line and stop if any failure surfaces. Iterate on failures before moving to the next batch
- [x] 04.6 Execute `bun run db:seed:org` against a seeded DB end-to-end; confirm exit code 0 and no FK violations

## Batching Plan

Each batch is a single synchronous `NODE_ENV=test bun test --env-file .env.test <paths>` call in the foreground. Do **not** use `run_in_background: true`. Between batches, emit one line like `echo "✅ batch N/9 passed"` so the activity timer resets.

| # | Scope | Paths |
|---|---|---|
| 1 | Lib + shared responses | `src/lib/` |
| 2 | Auth + public + audit | `src/modules/auth/` `src/modules/public/` `src/modules/audit/` |
| 3 | Admin + CBO | `src/modules/admin/` `src/modules/cbo-occupations/` |
| 4 | Organizations (cost-centers pilot + others) | `src/modules/organizations/` |
| 5 | Employees | `src/modules/employees/` |
| 6 | Occurrences — part A | `src/modules/occurrences/absences/` `src/modules/occurrences/accidents/` `src/modules/occurrences/cpf-analyses/` `src/modules/occurrences/labor-lawsuits/` `src/modules/occurrences/medical-certificates/` |
| 7 | Occurrences — part B | `src/modules/occurrences/ppe-deliveries/` `src/modules/occurrences/promotions/` `src/modules/occurrences/terminations/` `src/modules/occurrences/vacations/` `src/modules/occurrences/warnings/` |
| 8 | Payments — part A | `src/modules/payments/admin-checkout/` `src/modules/payments/admin-provision/` `src/modules/payments/admin-subscription/` `src/modules/payments/billing/` `src/modules/payments/checkout/` `src/modules/payments/customer/` `src/modules/payments/features/` |
| 9 | Payments — part B | `src/modules/payments/hooks/` `src/modules/payments/jobs/` `src/modules/payments/limits/` `src/modules/payments/pagarme/` `src/modules/payments/plan-change/` `src/modules/payments/plans/` `src/modules/payments/price-adjustment/` `src/modules/payments/subscription/` `src/modules/payments/webhook/` |

Ignore batches whose directory does not exist (some modules may not have `__tests__/`); a missing path is not a failure. `SKIP_INTEGRATION_TESTS=true` must remain **unset** so DB integration tests run; Pagar.me-gated tests under payments/** will skip by themselves when the flag is absent and credentials are missing — that is acceptable behavior per CLAUDE.md.

## Implementation Details

See TechSpec **"Testing Approach"** and the **"Impact Analysis"** row for `src/test/helpers/seed-organization.ts`. Existing user helpers at `src/test/helpers/user.ts` (`createTestUser`, `createTestUserWithOrganization`) create real users via Better Auth; reuse them rather than inventing new ones.

### Relevant Files

- `src/test/helpers/user.ts` — canonical user-creation helpers
- `src/test/helpers/seed-organization.ts` — seed helper chain with `userId` propagation
- `src/db/seeds/organization.ts` — seed entry script; resolves a real user before calling the helper
- `src/**/__tests__/*.test.ts` — candidate fixture-writing sites (dozens of files across modules)
- `package.json` scripts — `test`, `db:test:reset`, `db:migrate`, `db:seed:org`

### Dependent Files

- No new files created; changes are confined to fixture and helper sites

### Related ADRs

- [ADR-004: Migration Strategy](adrs/adr-004.md) — FK activation from task_03 is what makes this audit necessary

## Deliverables

- Every test fixture writing to audit columns references a real user
- All 9 batches from the plan above pass (zero failures) **(REQUIRED)**
- `bun run db:seed:org` smoke test completes with no FK violations **(REQUIRED)**
- No new `.skip` or `.only` markers in committed test files

## Tests

- Unit tests:
  - [ ] N/A — task is about fixing existing tests, not creating new unit coverage
- Integration tests:
  - [ ] Each batch listed above completes with zero failures
  - [ ] `bun run db:seed:org` executes without raising any FK violation (exit code 0)
  - [ ] Any previously flaky fixture that relied on implicit null `created_by` values either still resolves to null (unchanged behavior) or uses a real user id (refactored)
- Test coverage target: preserve current coverage baseline; do not introduce coverage regressions
- All tests must pass

## Success Criteria

- All 9 test batches green, with a clear per-batch status line emitted in the run log
- Seed script smoke test green
- No new `.skip`, `.only`, or `.todo` markers in committed tests
- Every fixture writing to audit columns demonstrably sources a real user-id
- Task completed without triggering compozy's activity timeout
