# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Audit `src/**/__tests__/` and `src/test/helpers/**` for direct `db.insert/update/delete` to `createdBy`/`updatedBy`/`deletedBy` with placeholder user IDs; refactor to real users; validate via 9 foreground batches + seed smoke test.

## Important Decisions

- Batched `bun test` in the foreground per the task's "Batching Plan". Each batch emitted a final `pass/fail` summary, resetting the activity timer.
- For the `db:seed:org` smoke test: the dev DB's existing owner org already hits the 10/10 trial tier limit. Instead of mutating real data, I created a fresh user+org via `createTestUserWithOrganization` inside the test DB (FKs active, clean slate) and invoked `src/db/seeds/organization.ts` with `DATABASE_URL` overridden to the test DB. Both the in-process `seedOrganization()` call AND the literal `bun src/db/seeds/organization.ts --org … --preset minimal` returned clean with zero FK violations.

## Learnings

- Only one real audit-FK bug surfaced in the full suite: `src/modules/occurrences/cpf-analyses/__tests__/create-cpf-analysis.test.ts` at the `test.each(["viewer"])` block passed `userId: organizationId` to `createTestEmployee`, leaking a garbage FK value into `employees.created_by`. Pre-FK it silently inserted; post-FK it fails with `sectors_created_by_users_id_fk`. Fix: destructure `userId` from `createTestUserWithOrganization` and pass it through.
- Every other `createdBy`/`updatedBy`/`deletedBy` write in tests + helpers already resolves to a real user via `createTestUser*` or `user.id`. The `seed-organization` chain propagates a real `userId` through every sub-helper, which in turn calls the service layer (the real write path) — so FKs validate once caller provides a real user.
- Test pollution in batch 9 (payments) caused `src/modules/payments/plans/__tests__/yearly-discount-and-trial-constraint.test.ts::"should prevent creating a second active trial plan"` to fail deterministically when run with siblings (passes in isolation 7/7). Root cause: `PlanFactory.create({ isTrial: true })` archives the active default trial before inserting, so after enough trial-creating tests the default (`plan-trial`) ended up archived and the uniqueness test had nothing to conflict with. Unrelated to audit FKs but fixed here defensively: added a transactional guard inside the test that archives any competing public trial (id ≠ `plan-trial`) and un-archives `plan-trial` before exercising the constraint. Batch 9 now green in 687/687.
- Batch 2 had one transient flake (`src/modules/public/provision-status/__tests__/provision-status.test.ts::"should return processing for pending_payment provision"`, 500 response) that did not reproduce on the immediate retry — 152/152 pass on re-run.
- Worktree's `.env` / `.env.test` symlinks unblocked `drizzle-kit migrate` against both DBs; the shared workflow memory already notes this. Dev DB needed `bun --env-file .env --bun drizzle-kit migrate` once to apply `0039_audit_fk_references.sql` before the seed smoke test.

## Files / Surfaces

- Fixed: `src/modules/occurrences/cpf-analyses/__tests__/create-cpf-analysis.test.ts` — `userId: organizationId` → destructure real `userId` from `createTestUserWithOrganization`.
- Fixed: `src/modules/payments/plans/__tests__/yearly-discount-and-trial-constraint.test.ts` — added transactional guard at the start of the unique-constraint test so `plan-trial` is re-activated (and competing public trials archived) before asserting the constraint fires. Unrelated to audit FKs but needed for batch 9 to land green.
- Audited clean (no change needed): `src/test/helpers/*`, `src/test/factories/*`, `src/modules/**/__tests__/*.test.ts` direct-insert sites (`cost-centers/get-cost-center.test.ts` system-seed, `vacations/update-vacation.test.ts` legacy seed, `terminations/create-termination.test.ts` soft-delete update, `employees/import/import.service.test.ts` terminated-employee fixture).

## Errors / Corrections

- Initial batch 9 run failed on the unique-trial-constraint test due to pre-existing pollution from `PlanFactory.archiveActiveTrial`. Remediated in-place with a transactional guard inside the test itself (re-activates `plan-trial`, archives any other active public trial). Batch 9 now returns 687/687.
- Cannot run `bun run db:seed:org` against the dev DB's only existing owner org — it's at the employee limit (10/10). Worked around by seeding into the test DB with a freshly created user+org.

## Batch Results

| # | Scope | Tests | Fails | Time | Notes |
|---|---|---:|---:|---:|---|
| 1 | `src/lib/` | 249 | 0 | 10.0s | — |
| 2 | auth + public + audit | 152 | 0 | 29.7s | 1 transient flake on 1st run; green on retry |
| 3 | admin + cbo | 75 | 0 | 22.8s | — |
| 4 | organizations | 423 | 0 | 191.4s | — |
| 5 | employees | 188 | 0 | 43.1s | — |
| 6 | occurrences A | 216 | 0 | 105.8s | Fixed cpf-analyses FK bug before this pass |
| 7 | occurrences B | 322 | 0 | 158.3s | — |
| 8 | payments A | 247 | 0 | 120.8s | — |
| 9 | payments B | 687 | 0 | 139.6s | Green after trial-plan guard fix; see note above |

Seed smoke test: `bun src/db/seeds/organization.ts --org test-org-431e7eed… --preset minimal` (DATABASE_URL pointing at test DB with 72 FKs active) exited 0 — 1 branch, 2 sectors, 1 cost-center, 3 employees, 8 occurrences.

## Ready for Next Run

- All FK-related fixture issues resolved (cpf-analyses typo). The trial-plan constraint flake in batch 9 is now self-healing via the in-test guard.
- All 9 batches green; seed smoke test green. Task 04 ready to mark completed. PR note should acknowledge (a) the cpf-analyses fixture fix and (b) the trial-constraint test hardening, so both changes are visible for review.
