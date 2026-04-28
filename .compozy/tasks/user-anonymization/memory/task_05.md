# Task Memory: task_05.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Build `src/modules/auth/anonymize/{anonymize.model.ts, anonymize.service.ts}` and the integration test file. Verified locally via `bun test` (14 anonymize cases + zero regressions in delete-account / validate-user-before-delete / audit.service).

## Important Decisions

- **Use `isAPIError` from `better-auth/api` instead of `instanceof APIError`** in `verifyPasswordOrThrow`. The thrown APIError can be a different runtime instance (better-call vs `@better-auth/core/error`) so `instanceof` returns false. `isAPIError` checks both classes plus `error?.name === "APIError"`. Type-narrowing then casts to `{ body?: { code?: string } }`.
- **Test seam for atomic rollback** is `spyOn(AuditService, "log").mockImplementation(() => Promise.reject(...))`. Strict-mode `tx`-aware insert (task_02) propagates the rejection and Drizzle rolls back. No service-side seam needed.
- **Email failure mock** uses `spyOn(authSenders, "sendAccountAnonymizedEmail")` against the namespace import (`import * as authSenders from "@/lib/emails/senders/auth"`). Required `// biome-ignore lint/performance/noNamespaceImport` comment because biome forbids namespace imports.

## Learnings

- `spy.mockRestore()` clears `spy.mock.calls` history. Snapshot the calls to a local variable BEFORE the `finally { mockRestore() }` block, then assert against the snapshot.
- ESM namespace imports in bun are read-only at runtime (`Object.getOwnPropertyDescriptor` reports `writable: true, configurable: false`, but direct `mod.x = ...` throws `Attempted to assign to readonly property`). However, `spyOn(mod, "x")` succeeds and propagates to BOTH namespace consumers (`mod.x()`) AND named-import consumers (`import { x } from ...`). Live bindings work in bun.
- Postgres in this dev environment occasionally enters a state where bun's `pg` client cannot connect ("Connection terminated unexpectedly") even though `psql` and raw TCP succeed. `docker restart synnerdata-api-b` (the postgres container) resolves it. Tests then run normally.

## Files / Surfaces

- `src/modules/auth/anonymize/anonymize.model.ts` — new
- `src/modules/auth/anonymize/anonymize.service.ts` — new (`AnonymizeService.anonymize`, `verifyPasswordOrThrow`, `buildAnonymizeAuditEntry`, `getUserOrThrow`, anonymized values)
- `src/modules/auth/anonymize/__tests__/anonymize.test.ts` — new (14 cases: helpers + service integration)

## Errors / Corrections

- First lint pass tagged `noStaticOnlyClass` suppression as having no effect; biome's threshold for the rule treats single-static-method abstract classes like `AnonymizeService` (and `AuditService`) as fine without suppression. Removed the `biome-ignore` comment.

## Ready for Next Run

- task_06 (controller + integration tests + app mount + legacy test cleanup) can now consume `AnonymizeService.anonymize` and `anonymizeRequestSchema`/`anonymizeResponseSchema` directly.
- Auto-commit was disabled for this run; the diff is staged for the user to review and commit manually.
