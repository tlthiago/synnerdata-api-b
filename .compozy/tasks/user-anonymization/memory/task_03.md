# Task Memory: task_03.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Done: validator throws `BadRequestError` with preserved codes; adapter installed in `auth.ts beforeDelete`; unit + legacy integration tests pass.

## Important Decisions

- `APIError` import in `hooks.ts` kept — still used by `validateBeforeCreateInvitation` and `validateBeforeDeleteOrganization`. Only the throws inside `validateUserBeforeDelete` switched to `BadRequestError`.
- Adapter mirrors ADR-009 snippet exactly: `try/catch` around `validateUserBeforeDelete`, re-throw `AppError` as `APIError("BAD_REQUEST", { code, message })`, propagate other errors.

## Learnings

- Unit tests for `validateUserBeforeDelete` use real factories (`UserFactory`, `OrganizationFactory`, `SubscriptionFactory`) because the helper queries the DB. Pure mocking is not the project pattern.

## Files / Surfaces

- `src/lib/auth/hooks.ts` — refactored `validateUserBeforeDelete`, added `BadRequestError` import.
- `src/lib/auth.ts` — added `AppError → APIError` adapter inside `beforeDelete`; imported `AppError`.
- `src/lib/auth/__tests__/validate-user-before-delete.test.ts` — new unit test file (7 tests).

## Errors / Corrections

## Ready for Next Run

- Task 05 (`AnonymizeService`) can call `validateUserBeforeDelete` directly and catch `AppError`/`BadRequestError` natively — no APIError translation needed in the service.
- Adapter is transient — task_08 (PR 2 cleanup) removes it together with the whole `user.deleteUser` block.
