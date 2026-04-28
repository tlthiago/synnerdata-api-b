---
status: completed
title: Update src/modules/auth/CLAUDE.md (PR 1 documentation)
type: docs
complexity: low
dependencies:
  - task_06
---

# Task 07: Update src/modules/auth/CLAUDE.md (PR 1 documentation)

## Overview
Update the auth module's CLAUDE.md so that future maintainers (including LLM agents reading the file) understand the new anonymization flow as the primary, project-owned account-removal mechanism. The file currently describes hard delete via Better Auth's native `deleteUser`; after this task it documents anonymization as the first-class flow and notes that the legacy Better Auth `deleteUser` block is wired but on borrowed time (deleted in PR 2 / task_08).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST replace the existing "Account Deletion" section in `src/modules/auth/CLAUDE.md` with an "Account Anonymization" section that documents:
  - The endpoint `POST /v1/account/anonymize` and that it requires the user's password.
  - The four error codes the endpoint can return (`ADMIN_ACCOUNT_DELETE_FORBIDDEN`, `ACTIVE_SUBSCRIPTION`, `ORGANIZATION_HAS_MEMBERS`, `INVALID_PASSWORD`).
  - The same business rules table (admin block, owner with paid subscription block, owner with members block, trial-org cascade) that existed before, framed against the new endpoint.
  - The DB-level cascade behavior already documented (organization deletion cascades to members/subscriptions/employees/etc).
  - The fact that anonymization preserves the `users` row, overwriting PII (`anonymized_at` is set to `now()`); the original email is freed for re-registration.
  - The five Better Auth credential tables that are deleted in the same transaction (sessions, accounts, twoFactors, apikeys, invitations).
  - That the audit_logs row uses the new `anonymize` action with a non-PII payload `{ wasOwnerOfTrialOrg, organizationCascade }`.
- MUST add a transitional subsection noting that during PR 1 → PR 2, the legacy `user.deleteUser` block in `src/lib/auth.ts` remains wired with an adapter (validator throws `AppError`, adapter translates to Better Auth's `APIError`) so the legacy `POST /api/auth/delete-user` endpoint continues to function until the frontend has fully migrated. State that PR 2 removes both the legacy block and this section.
- MUST NOT remove the existing references to organizations cascading on user deletion — the cascade behavior remains identical for the org-cascade flow; only the user-deletion mechanism changes (anonymize instead of hard delete).
- MUST update any pointer at the bottom of the file that says "future: hard delete will be replaced with soft delete + grace period" — replace with "anonymization is now the canonical account-removal flow; grace period remains a future PRD".
- MUST keep the file's overall heading structure, tone, and length comparable — this is a documentation refresh, not a rewrite.
</requirements>

## Subtasks
- [x] 7.1 Read the current `src/modules/auth/CLAUDE.md` end-to-end and identify every paragraph that references `deleteUser`, `delete-account`, or hard delete.
- [x] 7.2 Rewrite the "Account Deletion" section as "Account Anonymization" with the new endpoint, error codes, business rules table, cascade list, and irreversibility note.
- [x] 7.3 Add the transitional subsection explaining the PR 1 → PR 2 sequencing and the legacy adapter.
- [x] 7.4 Update the future-work pointer to mention grace period as a separate future PRD.
- [x] 7.5 Run `npx ultracite check` (which runs Biome) — even though it primarily handles code, confirm no linter or formatter complaints on the markdown if any are configured.

## Implementation Details
See PRD `_prd.md` (Core Features section) for the user-facing description and TechSpec "Impact Analysis" for the file change description.

The legacy section before this change reads (approximate excerpt for orientation): "Enabled via Better Auth's native `user.deleteUser`... Frontend calls `authClient.deleteUser({ password })`..." — this is the section to rewrite.

### Relevant Files
- `src/modules/auth/CLAUDE.md` — the file being updated.
- `_prd.md` (this PRD's `.compozy/tasks/user-anonymization/`) — source of business-rule and feature wording.
- `_techspec.md` (this PRD's `.compozy/tasks/user-anonymization/`) — source of technical details (transaction, audit shape, etc.).
- `adrs/adr-009.md` — explains why the legacy block lingers in PR 1.

### Dependent Files
- None at the code level; downstream tasks (task_08) update this file again to remove the transitional subsection, but task_08 is independent and does not block on this task's content beyond it being updated.

### Related ADRs
- [ADR-005: Refactor validateUserBeforeDelete to AppError and remove Better Auth deleteUser block](adrs/adr-005.md)
- [ADR-009: Two-PR rollout sequencing](adrs/adr-009.md)

## Deliverables
- Updated `src/modules/auth/CLAUDE.md` with the "Account Anonymization" section as the primary documentation.
- Transitional subsection covering the PR 1 → PR 2 sequencing.
- Future-work pointer updated to reference grace period as a future PRD.

## Tests
- Unit tests:
  - [ ] None — this is a documentation-only change. The "test" requirement is satisfied by code review and by the integration tests in task_06 confirming the documented behavior.
- Integration tests:
  - [ ] None directly. The accuracy of the documentation is implicitly verified against the integration tests that landed in task_06.
- Test coverage target: N/A (documentation)
- All tests must pass: re-running task_06 tests must still pass after this task lands (no behavior changed).

## Success Criteria
- The updated `CLAUDE.md` accurately describes the new endpoint, its error codes, and the LGPD-aligned anonymization semantics.
- The transitional subsection clearly states that the legacy block is removed in task_08 / PR 2.
- All tests passing (regression check from task_06)
- `npx ultracite check` passes
