# Task Memory: task_08.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

PR 2 cleanup: removed legacy `user.deleteUser` block + adapter from `src/lib/auth.ts`; removed `auditUserDelete` from `audit-helpers.ts`; removed transitional subsection from `src/modules/auth/CLAUDE.md`; refreshed `src/lib/auth/CLAUDE.md` to drop the `auditUserDelete` entry and the now-stale `auth.api.deleteOrganization` inline note. Added 1 integration test asserting `POST /api/auth/delete-user` → 404.

## Important Decisions

- Chose the automated 404 test path (over PR-only manual verification): Better Auth returns a clean 404 when the `user.deleteUser` block is fully omitted; a single `app.handle(...)` call exercises this without depending on internal routing structure.

## Learnings

- Better Auth still emits an `ERROR [Better Auth]: Delete user is disabled. Enable it in the options` log on the disabled route — the route handler is reached and short-circuits with 404 (matched the test expectation; not a regression).

## Files / Surfaces

- `src/lib/auth.ts` — `user.deleteUser` block removed; orphaned imports stripped by formatter (`auditUserDelete`, `validateUserBeforeDelete`, `AppError`). `APIError` retained (used by `beforeRemoveMember`).
- `src/lib/auth/audit-helpers.ts` — `auditUserDelete` deleted; `buildAuditEntry` and 9 remaining wrappers intact.
- `src/modules/auth/CLAUDE.md` — transitional subsection deleted; "Account Anonymization" is the only documented flow.
- `src/lib/auth/CLAUDE.md` — `audit-helpers.ts` description updated (10 wrappers → 9, mentions `buildAuditEntry` reuse by `AnonymizeService`); `validateUserBeforeDelete` description rewritten to reflect `BadRequestError` codes and direct call from `AnonymizeService`; "auth closure" rule re-worded (no longer cites the removed `beforeDelete → deleteOrganization` example).
- `src/modules/auth/anonymize/__tests__/anonymize.test.ts` — new top-level `describe("legacy POST /api/auth/delete-user")` with one test asserting 404.

## Errors / Corrections

## Ready for Next Run

- Task 08 is the final code task of the user-anonymization PRD. With this PR merged + deployed, run the post-deploy SQL invariant from `_techspec.md` "Release-time invariant" section once against production to confirm zero orphan rows.
