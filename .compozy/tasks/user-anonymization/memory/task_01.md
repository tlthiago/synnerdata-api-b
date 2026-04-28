# Task Memory: task_01.md

## Objective Snapshot

Lay additive lib infrastructure for the anonymization flow: `BadRequestError`, `users.anonymized_at`, and `AuditAction.anonymize`. PR 1 dependency for tasks 02–07.

## Important Decisions

- **Manual migration 0041 instead of `drizzle-kit generate`**: drizzle-kit fails with a pre-existing snapshot-chain collision (35–38 share the same `prevId`). The most recent precedent in `46803d6 feat(db): schema updates for better-auth 1.6 (CP-47)` documented the same workaround for migrations 0039 and 0040. Followed the precedent: hand-wrote `0041_add_users_anonymized_at.sql` + appended journal entry; no `0041_snapshot.json` produced. Snapshot chain repair is out of scope for this low-complexity additive task.
- **`BadRequestError` constructor signature**: `(message, options?: { code?; details? })`. Reassigns `this.code` only when `options.code !== undefined`, to keep the four anonymize-flow codes selectable on a single class without a subclass per code.

## Learnings

- The worktree had no `.env`/`.env.test` files; copied them from the parent repo to make `drizzle-kit migrate` runnable. (worktrees don't inherit untracked files.)
- `bunx tsc --noEmit` on the full project completes silently (no errors) — a useful broad type-check gate.

## Files / Surfaces

- `src/lib/errors/http-errors.ts` — added `BadRequestError`.
- `src/lib/errors/__tests__/http-errors.test.ts` — new file, 5 unit tests.
- `src/db/schema/auth.ts` — added `anonymizedAt` column to `users`.
- `src/db/migrations/0041_add_users_anonymized_at.sql` — new migration (manual).
- `src/db/migrations/meta/_journal.json` — appended idx 41 entry.
- `src/modules/audit/audit.model.ts` — appended `"anonymize"` to `auditActionSchema`.
- `src/modules/audit/CLAUDE.md` — documented the new action in the enums section.

## Errors / Corrections

- First `bun run db:generate` attempt failed with the snapshot-collision error documented in CP-47. Switched to manual migration after confirming the precedent.

## Ready for Next Run

- Task 02 can extend `AuditService.log(entry, tx?)`; the new `"anonymize"` value is already present.
- Task 03 can throw `new BadRequestError(message, { code })` with `ADMIN_ACCOUNT_DELETE_FORBIDDEN` / `ACTIVE_SUBSCRIPTION` / `ORGANIZATION_HAS_MEMBERS`.
- Task 05 can read/write `users.anonymizedAt` and pass `"anonymize"` as a typed `AuditAction`.
- Migration 0041 is already applied to the local test DB; no need to re-run before task 02.
