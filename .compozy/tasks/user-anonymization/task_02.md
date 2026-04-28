---
status: completed
title: Extend AuditService.log with optional transaction parameter
type: backend
complexity: low
dependencies: []
---

# Task 02: Extend AuditService.log with optional transaction parameter

## Overview
Extend `AuditService.log` to accept an optional Drizzle transaction argument. When the transaction is provided, the insert runs on that transaction connection and any failure propagates (so the caller's transaction rolls back); when absent, the existing fire-and-forget behavior — try/catch around the insert with `logger.error` on failure — is preserved exactly. This unlocks the atomic anonymization flow in task_05 without changing the contract for any existing caller.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST extend `AuditService.log` in `src/modules/audit/audit.service.ts` with an optional second parameter that accepts a Drizzle transaction (e.g., the value yielded inside `db.transaction(async (tx) => {...})`).
- MUST preserve the existing fire-and-forget behavior verbatim when the transaction parameter is absent — the same try/catch and `logger.error({ type: "audit:log:failed", entry, error })` call.
- MUST propagate insert errors when the transaction parameter is provided (no try/catch around the insert). The caller is expected to handle them; the absence of catch is what enables the transaction to roll back.
- MUST use the transaction connection (`tx`) for the insert when provided; otherwise use the module-level `db` instance.
- MUST NOT change the `AuditLogEntry` shape, the inserted-row column mapping, or the id generation pattern (`audit-${crypto.randomUUID()}`).
- MUST verify all existing call sites of `AuditService.log` continue to work without modification (they pass only one argument).
</requirements>

## Subtasks
- [x] 2.1 Modify `AuditService.log` signature to accept an optional transaction parameter.
- [x] 2.2 Branch on the parameter: with-tx path runs insert without try/catch; without-tx path keeps the existing try/catch.
- [x] 2.3 Extract the row-building logic into a small private helper to avoid duplication between the two paths.
- [x] 2.4 Add a 2-line code comment documenting the strict-vs-fire-and-forget contract.
- [x] 2.5 Add unit/integration tests covering both branches: silent-fail without tx, propagation with tx.
- [x] 2.6 Confirm zero changes needed at existing call sites (search for `AuditService.log(` and verify all pass exactly one argument).

## Implementation Details
See TechSpec section "Core Interfaces" (the `AnonymizeService` snippet shows the strict-mode call site) and ADR-008 for the rationale.

The current implementation lives at `src/modules/audit/audit.service.ts:9-29`. The transaction connection type matches what `db.transaction(async (tx) => ...)` yields — Drizzle's `PgTransaction` parameterized by the project schema.

### Relevant Files
- `src/modules/audit/audit.service.ts:9-29` — `AuditService.log` to extend.
- `src/db/index.ts` (or equivalent) — confirms the Drizzle `db` instance type that the `tx` parameter must mirror.
- `src/db/schema/audit.ts:11-50` — `auditLogs` table and `AuditLogEntry` types.

### Dependent Files
- `src/modules/auth/anonymize/anonymize.service.ts` (task_05) — first consumer of the new strict-mode contract.
- All existing call sites of `AuditService.log` — must remain compatible without changes (search the codebase to enumerate).

### Related ADRs
- [ADR-008: Extend AuditService.log with optional transaction parameter](adrs/adr-008.md) — primary driver.
- [ADR-002: Atomic single-transaction semantics](adrs/adr-002.md) — atomicity requirement that motivates this extension.

## Deliverables
- Updated `AuditService.log` signature accepting an optional transaction.
- Both behavior branches (silent-fail vs propagating) implemented and tested.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test covering the transaction-rollback path **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `AuditService.log(entry)` with no `tx` argument continues to swallow insert errors and log them via `logger.error`.
  - [ ] `AuditService.log(entry)` with no `tx` argument writes the row with the standard id format `audit-<uuid>` and the expected null defaults.
  - [ ] `AuditService.log(entry, tx)` propagates an insert error to the caller (no catch).
  - [ ] `AuditService.log(entry, tx)` runs the insert on the transaction connection (verified by the row appearing inside the transaction's view).
- Integration tests:
  - [ ] Inside a `db.transaction(async (tx) => { await AuditService.log(entry, tx); throw new Error("boom"); })`, the audit-log row is NOT present after rollback.
  - [ ] Inside a `db.transaction(async (tx) => { await AuditService.log(entry, tx); })` that commits, the audit-log row IS present after commit.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- All existing call sites of `AuditService.log` compile and behave identically without changes
- `npx ultracite check` passes
