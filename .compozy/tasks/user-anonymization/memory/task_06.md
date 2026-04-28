# Task Memory: task_06.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Mount `POST /v1/account/anonymize` (session-only auth) on top of `AnonymizeService.anonymize`, replicate the 11 mandatory integration scenarios from `delete-account.test.ts` against the new endpoint, delete the legacy test file. Done.

## Important Decisions

- Kept the existing service-level test suite from task_05 in `src/modules/auth/anonymize/__tests__/anonymize.test.ts` and **appended** a second top-level `describe("POST /v1/account/anonymize (HTTP integration)")` block with the 11 mandatory scenarios. Single file path required by the task spec; service-level coverage is non-redundant (covers `verifyPasswordOrThrow`, `buildAnonymizeAuditEntry`, and the atomic rollback seam) so deleting it would lose coverage.
- Scenario #12 (atomic rollback) is satisfied by the pre-existing service-level test `audit-log insert failure inside the transaction rolls back all mutations` (uses `spyOn(AuditService, "log")` as the seam). The cheapest seam is at the AuditService boundary — adding an HTTP-level duplicate would require the same spy and tell us nothing new. A code comment in the new HTTP describe block points at the existing test for traceability.
- Auth on the route is `auth: true` (boolean shortcut from the macro), which validates session only. No `requireOrganization`, no permissions — matches the PRD which permits anonymization for users without orgs.
- Used `badRequestErrorSchema` (generic 400) in the route's response map because the codes vary (`INVALID_PASSWORD`, `ADMIN_ACCOUNT_DELETE_FORBIDDEN`, `ACTIVE_SUBSCRIPTION`, `ORGANIZATION_HAS_MEMBERS`). `validationErrorSchema` is reserved for 422 (Zod-parse failures via Elysia).

## Learnings

- The error response shape on the new endpoint is `{ success: false, error: { code, message, requestId } }` (per `errorPlugin`). The legacy `delete-account.test.ts` read `body.code` directly — that worked because Better Auth's `APIError` response is flat. The new HTTP tests assert `body.error.code`.
- `mockSpy.mockRestore()` clears `spy.mock.calls` (already documented in shared workflow memory). For Scenario 1's email-send assertion, snapshot the calls into a local array **inside `finally`** before calling `mockRestore`.
- Bun's biome formatter is aggressive about stripping unused imports between Edits. Adding an import + first usage in the same Write/Edit (atomically) is the only reliable path. Multiple consecutive Edits that try to add the import first and then the using code lose the import. Confirmed with both `afterEach` and `createTestApp` in this run.

## Files / Surfaces

- New: `src/modules/auth/anonymize/anonymize.controller.ts` — Elysia instance, `name: "anonymize"`, `prefix: "/account"`, `tags: ["Account"]`, mounts `betterAuthPlugin`, single `POST /anonymize` route.
- Modified: `src/routes/v1/index.ts` — `.use(anonymizeController)` added to the chain. Final URL is `/v1/account/anonymize`.
- Modified: `src/modules/auth/anonymize/__tests__/anonymize.test.ts` — appended HTTP integration block (12 tests across 11 scenarios + the audit-log payload assertion).
- Deleted: `src/modules/auth/__tests__/delete-account.test.ts`.

## Errors / Corrections

- None blocking. SMTP errors during signup (`Unexpected socket close`) are noise — Better Auth's background-task runner catches them. Verified existing tests already exhibit the same noise and pass. No SMTP mocking needed for HTTP-level tests because the email path on the happy path is spied via `authSenders.sendAccountAnonymizedEmail`.

## Ready for Next Run

- Task 07 documents the new flow in `src/modules/auth/CLAUDE.md` (PR 1). The existing CLAUDE.md still describes the legacy `deleteUser` flow as primary; task_07 should rewrite the "Account Deletion" section to point at `POST /v1/account/anonymize` as primary while noting the legacy `deleteUser` block is on borrowed time until PR 2.
- No additional service or controller work needed for task_07 or task_08 from this surface.
