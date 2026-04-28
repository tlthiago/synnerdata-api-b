# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

- Task 01 done: `BadRequestError`, `users.anonymized_at` column (migration 0041 applied to local test DB), and `AuditAction.anonymize` are live.
- Task 03 done: `validateUserBeforeDelete` throws `BadRequestError` with stable codes. PR-1 adapter installed in `auth.ts beforeDelete` translating `AppError → APIError` so legacy `/api/auth/delete-user` still works. Adapter is transient — gone in task_08 (PR 2).
- Task 04 done: `AccountAnonymizedEmail` template + `sendAccountAnonymizedEmail({ email })` exporter live. Sender propagates errors; caller (task_05) wraps with `sendBestEffort` post-commit.
- Task 05 done: `AnonymizeService.anonymize` orchestrates verify-password → guard validation → atomic transaction (PII overwrite, 5 BA-table deletes, optional org cascade, strict audit-log insert) → best-effort email. `verifyPasswordOrThrow` uses `isAPIError` from `better-auth/api` (not `instanceof APIError`). Service exports `verifyPasswordOrThrow` and `buildAnonymizeAuditEntry` for direct testing.
- Task 06 done: `anonymizeController` mounted at `POST /v1/account/anonymize` (session-only auth, no `requireOrganization`/permissions). Integration test file at `src/modules/auth/anonymize/__tests__/anonymize.test.ts` covers all 11 mandatory HTTP scenarios; scenario #12 (atomic rollback) covered by the pre-existing service-level test in the same file via `spyOn(AuditService, "log")` seam. Legacy `src/modules/auth/__tests__/delete-account.test.ts` deleted.
- Task 07 done: `src/modules/auth/CLAUDE.md` rewritten — "Account Deletion" replaced by "Account Anonymization" as primary flow (endpoint, error codes, business rules, credential cleanup list, cascade, audit-log shape). Transitional subsection documents the PR 1 legacy `user.deleteUser` adapter; explicitly states task_08 / PR 2 will remove the block, the adapter, `auditUserDelete`, and the transitional subsection.
- Task 08 done (PR 2): `user.deleteUser` block + `AppError → APIError` adapter removed from `src/lib/auth.ts`; `auditUserDelete` deleted from `audit-helpers.ts`; transitional subsection removed from `src/modules/auth/CLAUDE.md`; `src/lib/auth/CLAUDE.md` refreshed (helper count, `validateUserBeforeDelete` description, auth-closure rule). Added integration test asserting `POST /api/auth/delete-user` returns 404.

## Shared Decisions

- `drizzle-kit generate` is blocked by a pre-existing snapshot-chain collision (snapshots 35-38 share the same `prevId`). Precedent (`46803d6`, CP-47) ships migrations manually with only an SQL file + journal entry. **Follow the same pattern in this PRD: hand-craft any further migration files, append journal entries, do not produce snapshots.** Repairing the chain is out of scope for this PRD.

## Shared Learnings

- The worktree starts without `.env` / `.env.test`. Copy them from the parent repo before running drizzle-kit or bun test commands that need DB credentials.
- Ultracite/biome formatter runs as a PostToolUse hook and strips imports it considers unused between Edit calls. When adding a new import whose first usage is in a separate code block, add both the import and the using code in the **same** Write/Edit operation — otherwise the formatter removes the import before the next Edit lands.
- **Better Auth APIError instanceof drift**: `instanceof APIError` (from `better-auth/api`) does not reliably match thrown errors because better-call and `@better-auth/core/error` ship distinct APIError classes. Use `isAPIError` from `better-auth/api` for the type guard (it covers both classes plus name-based fallback) and cast for `body?.code` access.
- **bun:test `spyOn` quirks**: ESM namespace imports are read-only at runtime, but `spyOn(mod, "fn")` succeeds and propagates to named-import consumers (live bindings work). However, `spy.mockRestore()` **clears `spy.mock.calls`** — snapshot the calls before restoring. Biome forbids namespace imports (`lint/performance/noNamespaceImport`); test files that need them require an inline ignore comment.
- **Postgres in dev sometimes hangs bun's pg client** with "Connection terminated unexpectedly" while `psql` keeps working. `docker restart` of the postgres container clears it; not a code problem.

## Open Risks

## Handoffs

- Migration 0041 already applied locally. Subsequent tasks do not need to re-run `db:migrate` unless they introduce another migration.
- Task_06 wires `anonymizeController` mounting `POST /v1/account/anonymize` on top of `AnonymizeService.anonymize`, the existing `anonymizeRequestSchema`, and `anonymizeResponseSchema`. No additional service work required.
