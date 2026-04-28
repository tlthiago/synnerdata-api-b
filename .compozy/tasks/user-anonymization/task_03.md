---
status: completed
title: Refactor validateUserBeforeDelete to AppError + auth.ts adapter
type: refactor
complexity: medium
dependencies:
  - task_01
---

# Task 03: Refactor validateUserBeforeDelete to AppError + auth.ts adapter

## Overview
Migrate the shared deletion-precondition helper `validateUserBeforeDelete` in `src/lib/auth/hooks.ts` from Better Auth's `APIError` to the project's `AppError` hierarchy (specifically `BadRequestError` with stable code overrides). Because the legacy Better Auth `user.deleteUser` block in `src/lib/auth.ts` still calls this helper during PR 1 (per ADR-009 two-PR rollout), add a small adapter inside the hook that catches `AppError` and re-throws as `APIError` so Better Auth's response pipeline keeps working until PR 2 deletes the legacy block entirely.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST refactor `validateUserBeforeDelete` in `src/lib/auth/hooks.ts:127-176` to throw `BadRequestError` from `src/lib/errors/http-errors.ts` with `code` overrides `ADMIN_ACCOUNT_DELETE_FORBIDDEN`, `ACTIVE_SUBSCRIPTION`, and `ORGANIZATION_HAS_MEMBERS` preserved verbatim.
- MUST preserve every existing business rule: admin/super_admin block, owner-with-paid-subscription block (`hasAccess && status in ["active","past_due"]`), owner-with-other-active-members block, and the trial-org cascade return value (`organizationId | null`).
- MUST NOT change the helper's return type or function signature; only the internal throw mechanism changes.
- MUST add an adapter inside the existing `user.deleteUser.beforeDelete` hook in `src/lib/auth.ts:101-115` that wraps the call to `validateUserBeforeDelete` in a try/catch, catches `AppError`, and re-throws as Better Auth's `APIError("BAD_REQUEST", { code: error.code, message: error.message })`. Other errors propagate untouched.
- MUST keep `auth.api.deleteOrganization` invocation logic unchanged — the adapter only touches the validator's error translation.
- MUST keep the `afterDelete` hook calling `auditUserDelete` unchanged in PR 1 (its removal is task_08).
- MUST search the codebase for any remaining `APIError` import in `hooks.ts` post-refactor and remove it if unused.
- MUST add tests confirming each of the three error codes is produced via `BadRequestError` when called outside the hook (direct unit test) AND via `APIError` (with the same code) when called inside the hook (legacy path still works).
- MUST keep behavioral parity with the legacy flow: every scenario in `src/modules/auth/__tests__/delete-account.test.ts` (which exercises the legacy `POST /api/auth/delete-user` path through the new adapter) MUST continue to pass after the refactor and adapter are in place. This is the parity gate for completing this task; the legacy test file is only deleted later, in task_06.
</requirements>

## Subtasks
- [x] 3.1 Replace `APIError("BAD_REQUEST", { code, message })` throws in `validateUserBeforeDelete` with `BadRequestError(message, { code })`, preserving all three code constants.
- [x] 3.2 Remove the now-unused `APIError` import from `hooks.ts` if it has no other references. *(Import retained — still used by `validateBeforeCreateInvitation` and `validateBeforeDeleteOrganization`.)*
- [x] 3.3 In `src/lib/auth.ts:101-115`, wrap the `await validateUserBeforeDelete(...)` call in a try/catch that translates `AppError` → `APIError` for Better Auth's response pipeline.
- [x] 3.4 Add unit tests for `validateUserBeforeDelete` invoked directly (asserts `BadRequestError` is thrown with each code).
- [x] 3.5 Integration parity for the legacy `POST /api/auth/delete-user` flow — the existing `src/modules/auth/__tests__/delete-account.test.ts` exercises every guard via the adapter; all 11 tests still pass after the refactor.

## Implementation Details
See TechSpec sections "System Architecture > Component Overview" (validateUserBeforeDelete is the shared invariant) and "Impact Analysis" (PR 1 column shows both files modified). ADR-005 frames the decision; ADR-009 explains why the adapter exists transiently in PR 1.

The adapter snippet to add inside `auth.ts beforeDelete` is shown in ADR-009's Implementation Notes — a 6-line try/catch around the existing call.

### Relevant Files
- `src/lib/auth/hooks.ts:127-176` — primary refactor target.
- `src/lib/auth.ts:101-115` — adapter installation site.
- `src/lib/errors/http-errors.ts` — `BadRequestError` (created in task_01).
- `src/lib/errors/base-error.ts:19-49` — `AppError` base contract (used by the adapter for `instanceof` check).

### Dependent Files
- `src/modules/auth/anonymize/anonymize.service.ts` (task_05) — direct caller of the refactored validator; benefits from `AppError` semantics.
- `src/modules/auth/__tests__/delete-account.test.ts` — exercises the legacy path through the adapter; will be deleted in task_06 but must continue to pass during PR 1 development.

### Related ADRs
- [ADR-005: Refactor validateUserBeforeDelete to AppError and remove Better Auth deleteUser block](adrs/adr-005.md) — refactor decision.
- [ADR-009: Two-PR rollout sequencing](adrs/adr-009.md) — adapter is the bridge between PR 1 and PR 2.

## Deliverables
- Refactored `validateUserBeforeDelete` throwing `BadRequestError` with stable codes.
- Adapter inside `auth.ts beforeDelete` translating `AppError` → `APIError` for Better Auth.
- Unit tests covering the three error codes via direct invocation **(REQUIRED)**.
- Integration tests covering the three error codes via the legacy `/api/auth/delete-user` path **(REQUIRED)**.
- Test coverage >=80% on the refactored helper.

## Tests
- Unit tests:
  - [ ] `validateUserBeforeDelete({ role: "admin", ... })` throws `BadRequestError` with `code === "ADMIN_ACCOUNT_DELETE_FORBIDDEN"`.
  - [ ] `validateUserBeforeDelete({ role: "super_admin", ... })` throws `BadRequestError` with `code === "ADMIN_ACCOUNT_DELETE_FORBIDDEN"`.
  - [ ] `validateUserBeforeDelete(owner-with-active-paid-subscription)` throws `BadRequestError` with `code === "ACTIVE_SUBSCRIPTION"`.
  - [ ] `validateUserBeforeDelete(owner-with-other-members)` throws `BadRequestError` with `code === "ORGANIZATION_HAS_MEMBERS"`.
  - [ ] `validateUserBeforeDelete(no-org-user)` returns `null`.
  - [ ] `validateUserBeforeDelete(sole-owner-of-empty-trial)` returns the `organizationId`.
- Integration tests:
  - [ ] `POST /api/auth/delete-user` (legacy path through the adapter) returns 400 with `code === "ADMIN_ACCOUNT_DELETE_FORBIDDEN"` for an admin user.
  - [ ] `POST /api/auth/delete-user` returns 400 with `code === "ACTIVE_SUBSCRIPTION"` for an owner with an active paid subscription.
  - [ ] `POST /api/auth/delete-user` returns 400 with `code === "ORGANIZATION_HAS_MEMBERS"` for an owner with other members.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80% on the refactored helper
- The legacy `/api/auth/delete-user` flow returns the same error codes it did before this task (verified via the integration tests)
- **Parity gate:** every existing scenario in `src/modules/auth/__tests__/delete-account.test.ts` continues to pass without modifications to the test assertions; only test setup adjustments (e.g., re-importing) are acceptable
- `npx ultracite check` passes
