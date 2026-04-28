# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Ship the `AccountAnonymizedEmail` React Email template + `sendAccountAnonymizedEmail` exporter for the post-commit confirmation email used by task_05.

## Important Decisions

- Subject line: `Sua conta foi anonimizada no Synnerdata` (matches the spec's suggested default).
- Template prop is `{ email: string }` so the body confirms which address was anonymized; this matches subtask 4.4's "contain the recipient's address".
- Body explicitly states irreversibility, audit history preserved anonymously, and that the email is free for a new registration.
- Sender does NOT wrap with `sendBestEffort`; caller (task_05) decides — sender propagates errors.

## Learnings

- The repo's biome/ultracite formatter strips imports it considers unused **between** Edit calls. When adding an import that is only referenced by a separate function block, add the function and the import in the same Write/Edit operation; otherwise the formatter wipes the import before the next Edit lands.
- `bun:test` `mock.module(...)` with a top-level `await import(...)` works to intercept `@/lib/emails/mailer` for sender tests; assertions read `mock.calls[0]` directly with a typed cast.

## Files / Surfaces

- `src/lib/emails/templates/auth/account-anonymized.tsx` (new)
- `src/lib/emails/senders/auth.tsx` (added `sendAccountAnonymizedEmail`)
- `src/lib/emails/__tests__/auth-templates.test.tsx` (4 new template tests)
- `src/lib/emails/__tests__/auth-senders.test.tsx` (new — 2 sender tests)

## Errors / Corrections

## Ready for Next Run

- task_05 can import `sendAccountAnonymizedEmail` from `@/lib/emails/senders/auth` and wrap with `sendBestEffort` post-commit. The original email must be captured pre-transaction and passed in.
