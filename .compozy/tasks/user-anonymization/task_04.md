---
status: completed
title: AccountAnonymized email template + sender wrapper
type: backend
complexity: low
dependencies: []
---

# Task 04: AccountAnonymized email template + sender wrapper

## Overview
Create the React Email template that confirms an account anonymization to the user, plus the sender wrapper that the anonymization service invokes after the transaction commits. Both follow the existing pattern under `src/lib/emails/templates/auth/` and `src/lib/emails/senders/auth.tsx`. The email is best-effort post-commit; delivery failure is logged but does not roll back the anonymization.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create a React Email template at `src/lib/emails/templates/auth/account-anonymized.tsx` confirming that the recipient's account has been anonymized.
- MUST follow the existing template style (see `welcome.tsx`, `account-activation.tsx`) — same component structure, layout, branding, Portuguese language.
- MUST state plainly that the action is irreversible, that the email address is now free for re-registration if the user wishes, and that audit history was preserved anonymously.
- MUST add `sendAccountAnonymizedEmail({ email })` exporter to `src/lib/emails/senders/auth.tsx` following the existing `sendWelcomeEmail` / `sendVerificationEmail` pattern: render the JSX template via `renderEmail`, then call `sendEmail({ to, subject, html, text })`.
- MUST NOT collect or persist any PII beyond the recipient address (which is captured pre-commit in the anonymization service).
- The subject line MUST be in Portuguese, concise, and avoid the word "deletada"/"removida" alone — use "Sua conta foi anonimizada no Synnerdata" or equivalent.
- MUST NOT call `sendBestEffort`-style wrappers inside this sender; the caller (task_05) decides whether to wrap the call best-effort.
</requirements>

## Subtasks
- [x] 4.1 Create `src/lib/emails/templates/auth/account-anonymized.tsx` with the React Email JSX following the existing template idioms.
- [x] 4.2 Decide and document the final subject line and body copy in Portuguese (DPO/copy review can adjust later; ship a defensible default now).
- [x] 4.3 Add `sendAccountAnonymizedEmail` exporter to `src/lib/emails/senders/auth.tsx`.
- [x] 4.4 Add a unit test for the template rendering (HTML and text outputs are non-empty and contain the recipient's address).
- [x] 4.5 Add a unit test for `sendAccountAnonymizedEmail` covering invocation of `sendEmail` with the expected `to`, `subject`, and rendered body.

## Implementation Details
See TechSpec section "Integration Points > Email send (best-effort post-commit)" for the integration semantics. The pattern reference is `src/lib/emails/senders/auth.tsx` (sender) and `src/lib/emails/templates/auth/welcome.tsx` or `account-activation.tsx` (template).

The anonymization service in task_05 will invoke this sender via `sendBestEffort(() => sendAccountAnonymizedEmail({ email: capturedOriginalEmail }), ...)` after the transaction commits. The original email is captured before the transaction starts and passed in by the caller.

### Relevant Files
- `src/lib/emails/templates/auth/welcome.tsx` — template style reference.
- `src/lib/emails/templates/auth/account-activation.tsx` — closest "account-action confirmation" pattern.
- `src/lib/emails/senders/auth.tsx` — destination of the new sender exporter.
- `src/lib/emails/mailer.ts:37-45` — `sendEmail` signature.

### Dependent Files
- `src/modules/auth/anonymize/anonymize.service.ts` (task_05) — sole consumer.

### Related ADRs
- [ADR-002: Atomic single-transaction semantics](adrs/adr-002.md) — informs the best-effort post-commit pattern (the email is intentionally outside the transaction).

## Deliverables
- New `src/lib/emails/templates/auth/account-anonymized.tsx` template.
- New `sendAccountAnonymizedEmail` exporter in `src/lib/emails/senders/auth.tsx`.
- Unit tests for the template render and the sender invocation **(REQUIRED)**.
- Test coverage >=80% on the new files.

## Tests
- Unit tests:
  - [x] Rendering `<AccountAnonymizedEmail />` produces non-empty `html` and `text` outputs.
  - [x] The rendered `text` and `html` mention that the action is irreversible.
  - [x] The rendered `text` and `html` mention that the email address can be reused for a new registration.
  - [x] `sendAccountAnonymizedEmail({ email: "user@example.com" })` calls `sendEmail` with `to: "user@example.com"`, the expected subject, and non-empty `html`/`text`.
  - [x] `sendAccountAnonymizedEmail` propagates errors from `sendEmail` (so callers can choose to wrap with `sendBestEffort`).
- Integration tests:
  - [ ] The integration coverage for end-to-end email delivery happens in task_06 via a mocked transporter; this task does not own those.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- The new template renders successfully in isolation (no runtime errors, no missing components)
- `npx ultracite check` passes on the modified files
