---
status: completed
title: AnonymizeService + Zod model
type: backend
complexity: high
dependencies:
  - task_01
  - task_02
  - task_03
  - task_04
---

# Task 05: AnonymizeService + Zod model

## Overview
Implement the heart of the user-anonymization feature: a service that orchestrates password verification (via Better Auth), business-rule validation (via the refactored `validateUserBeforeDelete`), an atomic transaction that overwrites PII / deletes auth artifacts / cascades the empty trial org / records an audit-log row, and a best-effort post-commit confirmation email. Also create the Zod request/response schemas for the endpoint contract. This is the single most complex task in the PRD because it integrates four subsystems (Better Auth, Drizzle transactions, audit logging, email delivery) under strict atomicity semantics.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `src/modules/auth/anonymize/anonymize.model.ts` exporting Zod schemas: `anonymizeRequestSchema` (`{ password: string }` with `min(1)`) and `anonymizeResponseSchema` reusing `successResponseSchema(z.null())` from `src/lib/responses/response.types.ts`.
- MUST create `src/modules/auth/anonymize/anonymize.service.ts` with a static class `AnonymizeService.anonymize({ userId, password, requestHeaders })`.
- MUST verify the password by calling `auth.api.verifyPassword({ body: { password }, headers: requestHeaders })` BEFORE entering the database transaction. The call's success is signaled by absence of a thrown error (the response body `{ status: true }` is ignored). On wrong password, the call throws `APIError("BAD_REQUEST", "INVALID_PASSWORD")`; the service MUST catch it and re-throw as `BadRequestError("Senha incorreta.", { code: "INVALID_PASSWORD" })`. Other `APIError`s and unexpected errors MUST propagate untouched (5xx).
- MUST capture the original email from the user row BEFORE the transaction starts (used after commit by the email sender).
- MUST run all DB mutations inside a single `db.transaction(async (tx) => { ... })`:
  - Overwrite PII on the `users` row: `name = "Usuário removido"`, `email = "anon-${user.id}@deleted.synnerdata.local"`, `image = null`, `email_verified = false`, `anonymized_at = now()`.
  - Delete dependent rows in **all five Better Auth tables**: `sessions`, `accounts`, `twoFactors`, `apikeys`, `invitations` (matching by `userId` / `inviterId` as appropriate — see schema for exact column names).
  - If `validateUserBeforeDelete` returned an `organizationId`, delete that organization (existing FK cascades remove members/subscriptions/profiles/etc).
  - Insert one `audit_logs` row via `AuditService.log(buildAnonymizeAuditEntry(user, orgIdToCascade), tx)` — passing `tx` enables the strict path from task_02 so an insert failure rolls back the transaction.
- MUST construct the audit-log payload with **no PII**: `changes.before = { wasOwnerOfTrialOrg: orgIdToCascade !== null, organizationCascade: orgIdToCascade }`, `changes.after = undefined`. `resource = "user"`, `resourceId = user.id`, `userId = user.id` (self-attributed), `action = "anonymize"`.
- MUST send the confirmation email AFTER the transaction commits, wrapped in `sendBestEffort` so a delivery failure does not throw. Use the captured original email, not a re-read of the `users` row (which now contains the placeholder).
- MUST emit the four structured log events at the appropriate points:
  - `auth:anonymize:started` `{ userId, hasOrgCascade }` — at service entry, after validation but before transaction.
  - `auth:anonymize:completed` `{ userId, organizationCascade }` — after successful commit.
  - `auth:anonymize:rejected` `{ userId, reason }` — on guard rejection (`INVALID_PASSWORD` or any code from `validateUserBeforeDelete`).
  - `auth:anonymize:failed` `{ userId, error }` — on transaction failure.
  - `email:account-anonymized:failed` `{ userId, error }` — emitted by the `sendBestEffort` wrapper when email delivery fails.
- MUST NOT add a separate `accountCreatedAt` or `role` field to the audit-log payload (per ADR-006, only `wasOwnerOfTrialOrg` and `organizationCascade` are recorded).
- MUST NOT write any PII to any log line (specifically: original email, original name, password) anywhere in the service.
</requirements>

## Subtasks
- [x] 5.1 Create `anonymize.model.ts` with the Zod request/response schemas.
- [x] 5.2 Implement `verifyPasswordOrThrow(password, headers)` helper that wraps `auth.api.verifyPassword` and translates `APIError("INVALID_PASSWORD")` to `BadRequestError`.
- [x] 5.3 Implement `buildAnonymizeAuditEntry(user, orgIdCascade)` helper that produces the minimal non-PII audit entry.
- [x] 5.4 Implement the transactional core: PII overwrite, deletion of all five Better Auth tables, optional org delete, audit-log insert via `AuditService.log(entry, tx)`.
- [x] 5.5 Wire in the four structured log events at the documented positions; ensure no PII appears in any log payload.
- [x] 5.6 Implement the post-commit `sendBestEffort` invocation of `sendAccountAnonymizedEmail` using the captured original email.
- [x] 5.7 Add tests covering the happy path, password rejection, each guard rejection, atomic rollback (PII restored on failure), and the audit-log shape assertion.

## Implementation Details
See TechSpec sections "Implementation Design > Core Interfaces" (`AnonymizeService` skeleton), "Integration Points > Better Auth password verification" (verified contract), and "Data Models > Audit-log payload" (`buildAnonymizeAuditEntry` shape).

The five Better Auth tables enumerated in the requirements are the complete credential surface as of better-auth 1.6.9. Future Better Auth plugins (e.g., passkeys) might add additional tables — see Known Risks below.

### Relevant Files
- `src/lib/auth.ts` — `auth` singleton; `auth.api.verifyPassword` is invoked from here.
- `src/lib/auth/hooks.ts` — refactored `validateUserBeforeDelete` (task_03 dependency).
- `src/lib/auth/audit-helpers.ts:18-30` — `buildAuditEntry` reused for shape consistency.
- `src/db/schema/auth.ts` — `users`, `sessions`, `accounts`, `twoFactors`, `apikeys`, `invitations` table definitions; the new `anonymized_at` column lives here.
- `src/db/schema/audit.ts:11-50` — `auditLogs` table.
- `src/db/schema/organizations.ts` (or equivalent) — `organizations` table for the cascade delete.
- `src/modules/audit/audit.service.ts` — `AuditService.log(entry, tx?)` extended in task_02.
- `src/lib/emails/senders/auth.tsx` — `sendAccountAnonymizedEmail` from task_04.
- `src/lib/errors/http-errors.ts` — `BadRequestError` from task_01.
- `src/lib/responses/response.types.ts` — `successResponseSchema` for the response Zod.

### Dependent Files
- `src/modules/auth/anonymize/anonymize.controller.ts` (task_06) — sole consumer of `AnonymizeService.anonymize`.

### Related ADRs
- [ADR-002: Atomic single-transaction semantics](adrs/adr-002.md) — atomicity contract.
- [ADR-006: Minimal non-PII payload for the audit-log entry](adrs/adr-006.md) — audit payload shape.
- [ADR-007: Password verification via Better Auth verifyPassword](adrs/adr-007.md) — verified API contract.
- [ADR-008: Extend AuditService.log with optional transaction parameter](adrs/adr-008.md) — strict-mode call.
- [ADR-001: Self-service-only scope](adrs/adr-001.md) — self-anonymization only; userId is always the session user.

## Deliverables
- New `src/modules/auth/anonymize/anonymize.model.ts` with request and response Zod schemas.
- New `src/modules/auth/anonymize/anonymize.service.ts` with `AnonymizeService.anonymize` and helpers.
- Five Better Auth tables (`sessions`, `accounts`, `twoFactors`, `apikeys`, `invitations`) deleted in the same transaction as the PII overwrite.
- Audit-log row written via `AuditService.log(entry, tx)` with the minimal non-PII payload.
- Confirmation email sent best-effort post-commit via `sendBestEffort(() => sendAccountAnonymizedEmail(...))`.
- Four structured log events emitted: `auth:anonymize:started`, `auth:anonymize:completed`, `auth:anonymize:rejected`, `auth:anonymize:failed`. Plus `email:account-anonymized:failed` from the best-effort wrapper.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `verifyPasswordOrThrow` resolves silently on a valid password.
  - [ ] `verifyPasswordOrThrow` re-throws `BadRequestError({ code: "INVALID_PASSWORD" })` when Better Auth throws `APIError("INVALID_PASSWORD")`.
  - [ ] `verifyPasswordOrThrow` lets unrelated `APIError`s and infra errors propagate.
  - [ ] `buildAnonymizeAuditEntry(user, null)` produces `changes.before = { wasOwnerOfTrialOrg: false, organizationCascade: null }`.
  - [ ] `buildAnonymizeAuditEntry(user, "org-xyz")` produces `changes.before = { wasOwnerOfTrialOrg: true, organizationCascade: "org-xyz" }`.
  - [ ] The audit entry contains no `name`, `email`, `image`, `role`, or any other PII field.
- Integration tests:
  - [ ] Happy path (no org): user row's PII is overwritten, `anonymized_at` is set, all five Better Auth tables have zero rows for the user, one `audit_logs` row exists with `action = "anonymize"`, and the original email is freed for re-registration.
  - [ ] Owner of empty trial org: same as above + the org is deleted (cascade).
  - [ ] Wrong password: service throws `BadRequestError({ code: "INVALID_PASSWORD" })`; user row and dependent tables are unchanged.
  - [ ] Admin role: service propagates `BadRequestError({ code: "ADMIN_ACCOUNT_DELETE_FORBIDDEN" })` from `validateUserBeforeDelete`; no mutations occur.
  - [ ] Owner with active paid subscription: service propagates `BadRequestError({ code: "ACTIVE_SUBSCRIPTION" })`; no mutations occur.
  - [ ] Owner with other members: service propagates `BadRequestError({ code: "ORGANIZATION_HAS_MEMBERS" })`; no mutations occur.
  - [ ] Atomic rollback: simulating a failure at the org-delete step (via a test-only seam) leaves the user row intact, all dependent rows present, and zero `audit_logs` rows for the action.
  - [ ] Email send failure (mocked transporter rejection) does NOT roll back the transaction — the user is still anonymized and the audit-log row still exists; only `email:account-anonymized:failed` is logged.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- The five Better Auth tables are explicitly enumerated and each has a confirming test asserting zero rows for the anonymized user post-commit
- No PII appears in any log line, audit-log row, or post-commit artifact (verified by inspection of test output)
- `npx ultracite check` passes

## Known Risks

- **Future Better Auth plugins introducing new credential tables.** The five tables enumerated above are the complete credential surface for better-auth 1.6.9. If a future Better Auth plugin (e.g., a passkeys plugin) adds a new `passkeys`, `webauthn_credentials`, or similar table tied to `userId`, the anonymization flow would leak credentials for that table type. Mitigation: at implementation time, grep `node_modules/better-auth` for any tables holding `userId` as a foreign key beyond the five above and update accordingly. Add a code comment listing the enumerated tables so future plugin upgrades are forced to re-evaluate.
