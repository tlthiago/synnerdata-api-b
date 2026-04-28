# PRD #2 — User Anonymization (replacing hard delete)

## Overview

Better Auth's native `deleteUser` flow physically removes a user's row from the database, severing the audit chain that links historical domain-resource events to the person who created or modified them. For an HR/payroll SaaS subject to LGPD and labor-prescrição (5 years), losing authorship of historical events compromises the probative value of records during audits, fiscal inspections, and legal disputes.

This PRD replaces hard delete with **anonymization**: the user row stays in place, but personally identifiable fields are irreversibly overwritten and authentication credentials are revoked. The user can no longer log in or be identified by data in the row, yet foreign-key references to the row remain valid — preserving authorship attribution everywhere it appears.

The change is the second of five PRDs in the [user attribution roadmap](../../../docs/improvements/2026-04-27-user-attribution-roadmap-design.md). It runs in parallel with PRD #1 (audit-log coverage) and is a prerequisite for PRD #3 (schema FK + NOT NULL on `createdBy`/`updatedBy`).

**Affected users:** end-users requesting account deletion (primary), the DPO/jurídico function (compliance owner), engineering operating the auth-critical path (secondary).

## Goals

- Replace `authClient.deleteUser({ password })` with a project-owned endpoint that anonymizes the user instead of deleting the row.
- Preserve every business-rule guard currently enforced before deletion (admin block, owner-with-paid-subscription block, owner-with-members block, trial-org cascade).
- Make every anonymization event traceable in `audit_logs` with a dedicated `anonymize` action.
- Free the original email for immediate reuse on a new account.
- Achieve ≥99% transactional success rate on anonymizations in production.
- Achieve 100% audit-log coverage: every user with `anonymized_at IS NOT NULL` has a corresponding `audit_logs` row with `action=anonymize, resource=user`.
- Validate the LGPD posture with DPO/jurídico sign-off before prod deploy.

**Target timeline:** 1-2 weeks end-to-end (backend + frontend coordination + DPO sign-off + deploy).

## User Stories

**End-user (account holder)**

- As an end-user, I want to delete my account so that my personal data is removed from the platform and I am no longer identifiable in the system.
- As an end-user, I want to confirm the deletion with my password so that I am protected against accidental clicks or compromised sessions.
- As an end-user, I want to receive a confirmation email after the deletion so that I have proof the action was executed.
- As an end-user, I want to be able to register a new account with the same email later so that I can return to the platform without using a different address.

**Owner of an empty trial organization**

- As the sole owner of an empty trial organization, I want my organization to be cleaned up alongside my account so that I do not leave a dangling tenant when I leave.

**Blocked actors**

- As an admin or super_admin, I expect to be blocked from self-anonymizing so that an accidental action does not orphan the platform's administration. The block must explain why, so I know to delegate the task.
- As an owner with an active paid subscription, I expect to be blocked so that I cannot abandon a paying tenant. The block must tell me to cancel the subscription first.
- As an owner with other active members, I expect to be blocked so that I cannot remove myself while others depend on the org. The block must tell me to transfer ownership or remove members first.

**DPO / Compliance owner**

- As the DPO, I want every anonymization to be recorded in `audit_logs` with a dedicated action so that I can produce evidence of compliance during an ANPD inquiry.
- As the DPO, I want the anonymization to be irreversible so that the resulting row is no longer "personal data" under LGPD Art. 16.

**Engineering / SRE**

- As an SRE, I want the anonymization to be atomic so that there is no window where PII is replaced but credentials remain.
- As an SRE, I want a post-deploy SQL invariant I can run against production so that I can verify zero orphan credentials for anonymized users.

## Core Features

### 1. Anonymization endpoint

A project-owned endpoint that replaces Better Auth's `/api/auth/delete-user`. Accepts the authenticated user's password, validates business rules, performs the anonymization in a single transaction, sends a confirmation email, and returns success.

### 2. PII overwrite on the `users` row

The user row is preserved; the following fields are overwritten:

- `name` → fixed sentinel string (`"Usuário removido"`).
- `email` → deterministic placeholder derived from the user ID (`anon-${user_id}@deleted.synnerdata.local`), preserving the UNIQUE constraint and freeing the original address.
- `image` → null.
- `email_verified` → false.
- A new `anonymized_at` timestamp records when the operation occurred.

The original PII is **not** retained anywhere after the transaction commits. The operation is irreversible.

### 3. Credential revocation

All authentication artifacts for the user are deleted in the same transaction: sessions, accounts (OAuth/credentials), two-factor records, API keys, pending invitations. Login becomes immediately impossible.

### 4. Trial-organization cascade (preserved from current flow)

When the anonymizing user is the **sole owner** of an organization with **no other active members** and **no active paid subscription**, the organization is deleted along with the user (current `beforeDelete` behavior).

### 5. Validation guards (preserved from current flow)

Anonymization is rejected with a clear error code if any of the following holds:

- The user has role `admin` or `super_admin`.
- The user is an owner with an active paid subscription (`status in ["active", "past_due"]`).
- The user is an owner with other active members in the organization.

### 6. Audit-log entry

A new `AuditAction` value `anonymize` is introduced. Every successful anonymization inserts one `audit_logs` row with `resource=user`, `resourceId=<user_id>`, `userId=<self>`, and a payload that records the event without re-leaking the original PII.

### 7. Confirmation email

After the transaction commits, the system sends a confirmation email to the **original** address (captured before overwrite). Email delivery is best-effort and does not affect the success of the operation; failures are logged.

### 8. Better Auth deleteUser disabled

`user.deleteUser.enabled` is flipped to `false` in `src/lib/auth.ts`. The native `/api/auth/delete-user` route ceases to be exposed.

### 9. Frontend client swap

Coordination with the frontend team to replace `authClient.deleteUser({ password })` with the new endpoint contract. The end-user-visible flow (settings page → confirmation modal → password input → result) is preserved as-is from a UX perspective.

## User Experience

### Primary flow — self-service anonymization

1. User opens **Account settings** in the web app.
2. User clicks **Delete account**.
3. A confirmation modal opens warning that the action is **irreversible** and explaining what will happen (account is removed, audit history is preserved anonymously, the email becomes available for new registration).
4. User types their **password** and submits.
5. Backend validates the password, applies the validation guards (Core Feature 5), and runs the anonymization transaction (Core Features 2-6).
6. On success, the UI logs the user out and shows a confirmation page. A confirmation email is delivered to the original address.
7. The user can immediately re-register with the same email if they choose.

### Failure flow — guard-blocked

If a guard blocks the operation, the modal shows the corresponding error message:

- **Admin/super_admin**: "Administradores não podem excluir a conta por aqui. Solicite ao time interno."
- **Active subscription**: "Cancele a assinatura ativa antes de excluir a conta."
- **Active members**: "Transfira a propriedade ou remova os outros membros antes de excluir a conta."

The exact copy is finalized during implementation in coordination with product/copy review.

### Failure flow — transactional error

If the transaction fails (rare, transient infra issue), the UI displays a generic retry message and the account remains intact. No partial state is possible.

### UI/UX considerations

- The irreversibility warning must be prominent in the modal copy (Frontend coordination point).
- Error responses from the endpoint use standard error codes consumable by the existing UI error-handling layer.
- No new screens, no onboarding changes, no discoverability work — the entry point and modal already exist.

## High-Level Technical Constraints

- **LGPD compliance**: anonymization values must satisfy the company's interpretation of LGPD Art. 16 (anonymized data) and Art. 18 (right to erasure). DPO sign-off is a hard release gate.
- **Auth schema integrity**: the `users.email` UNIQUE NOT NULL constraint must remain satisfied at all times; the deterministic `anon-${user_id}@deleted.synnerdata.local` template guarantees uniqueness via the user ID.
- **Audit-log integrity**: exactly one `audit_logs` row per successful anonymization, with the new `anonymize` action; absence of this row indicates a failed anonymization.
- **Frontend coordination**: the contract change requires a coordinated deploy with the web app; the legacy SDK call must be replaced in the same release cycle.
- **No retention of original PII**: the audit-log row, application logs, and any post-commit derivative artifacts must not carry the original `name` or `email` after the transaction commits.

## Non-Goals (Out of Scope)

- **Grace period before anonymization** — deferred to a future roadmap PRD.
- **Admin-initiated anonymization "on behalf of" a user** — deferred to a future PRD; off-channel LGPD requests are handled manually until then (ADR-001).
- **System-initiated anonymization** (e.g., long-inactive accounts) — deferred to a future retention PRD (ADR-001).
- **Domain-table FK / NOT NULL changes** on `createdBy`/`updatedBy` — covered by PRD #3 of the roadmap.
- **API-response shape changes** for domain resources (`{ id, name }` exposure) — covered by PRD #4+.
- **Frontend redesign** of the deletion confirmation modal beyond updating the SDK call and copy.
- **Bulk anonymization** of multiple users in one request.
- **Reversal of anonymization** — irreversible by design.
- **Soft-delete grace window** with a "restore" affordance — incompatible with the LGPD posture chosen here.

## Phased Rollout Plan

This PRD is single-phase by design: anonymization is binary (enabled or not) and feature-flag coexistence was rejected (ADR-003).

### MVP (Phase 1) — single phase

**Included:**

- Backend: `anonymized_at` migration, `POST /v1/account/anonymize` endpoint, `AuditAction.anonymize`, transactional anonymization with validation guards and trial-org cascade, confirmation email.
- Better Auth: `user.deleteUser.enabled: false`.
- Frontend: SDK call swap, copy update for irreversibility warning.
- Tests: integration coverage adapted from the existing `delete-account.test.ts` matrix (9 scenarios) plus the new email-reuse and audit-log assertions.
- Docs: update `src/modules/auth/CLAUDE.md` to reflect anonymization semantics.

**Success criteria to consider Phase 1 done:**

1. All adapted integration tests pass locally.
2. Manual end-to-end validation of all 9 scenarios in homolog (golden path + every guard + cascade + email-reuse).
3. DPO/jurídico written sign-off on the anonymized values and audit-log shape.
4. Frontend confirmed integrated against homolog.
5. Post-deploy SQL invariant returns zero orphans across `sessions`, `accounts`, `twoFactors`, `apikeys`, `invitations` for users with `anonymized_at IS NOT NULL`.

There is no Phase 2 or Phase 3 in this PRD. Subsequent concerns (admin path, grace period, retention triggers) are independent future PRDs.

## Success Metrics

**Operational health (continuous):**

- **Anonymization success rate ≥ 99%** of `POST /v1/account/anonymize` calls return 2xx (excluding legitimate guard-blocks, which are 4xx). Tracked via standard request-success monitoring.
- **Audit-log coverage = 100%**: for every `users.anonymized_at IS NOT NULL`, exactly one `audit_logs` row exists with `action=anonymize, resource=user, resourceId=<user_id>`. Validated by a periodic invariant query.

**Release invariant (one-shot, post-deploy verification):**

- **Zero orphans**: for every user with `anonymized_at IS NOT NULL`, no rows remain in `sessions`, `accounts`, `twoFactors`, `apikeys`, or `invitations` referencing them. SQL check is run immediately after the prod deploy.

**Quality attributes (validated in homolog before deploy):**

- All 9 integration scenarios pass.
- DPO sign-off received in writing.
- Frontend integration verified against the new contract.

## Risks and Mitigations

- **DPO/jurídico does not approve the anonymization values or audit-log shape**: engage DPO early, during PRD review; iterate on the values if needed before TechSpec is finalized. The deploy gate is non-negotiable.
- **Frontend cycle slips behind backend**: backend keeps `user.deleteUser.enabled: true` until the frontend is ready; the disable lands in the final deploy. Cycles are coordinated calendar-explicitly.
- **Email delivery failure after commit**: confirmation email is best-effort post-commit. Failures are logged separately; the `audit_logs` row is authoritative proof of the event. User can re-request confirmation via support if the email is missing.
- **User confusion about irreversibility**: front-end modal copy must state the action is irreversible and what is preserved (audit history, anonymously). Copy review by product/UX before deploy.
- **Off-channel LGPD requests during the period before an admin path exists**: support team executes via direct DB script with manual `audit_logs` entry. Volume tracked; if non-trivial, the admin-anonymize PRD is escalated. (See ADR-001.)
- **Adoption risk**: anonymization is a rare end-of-relationship action — there is no adoption KPI to optimize. Success here is operational integrity, not engagement.

## Architecture Decision Records

- [ADR-001: Self-service-only anonymization scope for PRD #2](adrs/adr-001.md) — rejects admin path and system-initiated framework as out of scope.
- [ADR-002: Atomic single-transaction semantics for anonymization](adrs/adr-002.md) — all DB mutations roll back together on failure; email is best-effort post-commit.
- [ADR-003: Direct rollout (homolog → prod) over feature-flag coexistence](adrs/adr-003.md) — single canonical path post-deploy; no flag debt.

## Open Questions

- **Final endpoint path** — `POST /v1/account/anonymize` is the working name. The TechSpec confirms the path against existing module conventions.
- **Audit-log payload shape** — the new `audit_logs` row must record the event without re-leaking the original PII. Whether the `changes` field carries any payload (e.g., `{ before: { hadPaidSubscription: false, wasOwnerOfTrialOrg: true } }`) or is left null is a TechSpec call. Default lean: minimal payload, no original PII anywhere.
- **Confirmation email copy** — final subject and body wording, DPO and product/copy review pending.
- **Frontend modal copy** — irreversibility warning final wording, product/copy review pending.
- **Localization** — assumed Portuguese-only at this stage; confirm whether other locales are in scope for the email and modal copy.
- **Telemetry granularity** — whether to emit a structured log event (separate from `audit_logs`) for anonymization failures to feed SRE dashboards. Default lean: yes, leveraging existing log infrastructure.
- **Behavior when `anonymized_at` is already set** — the endpoint should reject re-anonymization with a clear error; TechSpec confirms the error code.
