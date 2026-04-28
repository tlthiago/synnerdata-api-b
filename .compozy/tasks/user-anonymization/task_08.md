---
status: completed
title: PR 2 cleanup — remove legacy user.deleteUser block + auditUserDelete + CLAUDE.md final
type: refactor
complexity: low
dependencies:
  - task_07
---

# Task 08: PR 2 cleanup — remove legacy user.deleteUser block + auditUserDelete + CLAUDE.md final

> ⚠️ **STATUS PLACEHOLDER ATIVO — TASK NÃO ESTÁ CONCLUÍDA**
>
> Este task está com `status: completed` no frontmatter **exclusivamente** para impedir execução prematura pelo `compozy start` antes do gate calendário (frontend em produção) ser satisfeito. O trabalho descrito abaixo NÃO foi executado.
>
> **Quando reverter para `pending`:** após confirmar manualmente os 4 critérios listados na seção "Calendar Precondition (out of code scope)" no final deste arquivo:
> 1. PR 1 (tasks 01-07) mergeada e deployada em **produção**
> 2. Release do frontend consumindo `POST /v1/account/anonymize` deployado em **produção**
> 3. Fluxo novo validado end-to-end em prod (incluindo SQL invariant check + ao menos 1 anonimização real)
> 4. Nenhum incidente / regressão / rollback aberto sobre o fluxo de anonimização
>
> Quando os 4 critérios estiverem confirmados, editar este frontmatter trocando `status: completed` → `status: pending` e remover este aviso. Re-rodar `compozy start --name user-anonymization --ide claude` para executar a task.

## Overview
Once PR 1 is in production AND the frontend has fully migrated to the new `POST /v1/account/anonymize` endpoint AND that migration has been validated in production, ship PR 2: delete the now-unused Better Auth `user.deleteUser` block (including the temporary adapter from task_03) from `src/lib/auth.ts`, delete the orphaned `auditUserDelete` helper from `src/lib/auth/audit-helpers.ts`, and remove the transitional subsection from `src/modules/auth/CLAUDE.md`. Net effect: `POST /api/auth/delete-user` returns 404 and the codebase has a single canonical account-removal path.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST NOT start this task until the PR 1 calendar gate is satisfied: PR 1 is merged and deployed to production, the frontend deploy consuming `POST /v1/account/anonymize` has reached production, AND the new flow has been validated in production (including the post-deploy SQL invariant check from the operational runbook). This precondition is a calendar/coordination gate, not a code dependency on task_07. Verify the gate explicitly before starting.
- MUST remove the entire `user: { deleteUser: { ... } }` block from `src/lib/auth.ts:101-115` (in the post-task_03 codebase: lines may shift). The block includes both `beforeDelete` (with the `AppError` → `APIError` adapter from task_03) and `afterDelete` (calling `auditUserDelete`). Both go.
- MUST NOT remove `buildAuditEntry` from `src/lib/auth/audit-helpers.ts` — it is reused by `AnonymizeService` (task_05). Only `auditUserDelete` is deleted.
- MUST search the codebase for any remaining references to `auditUserDelete` and confirm zero callers before deletion. The expected only caller is the `afterDelete` hook being removed in the same task.
- MUST search the codebase for any test, runbook, or doc that hits `POST /api/auth/delete-user` and update or remove it. The task_06 deletion of `delete-account.test.ts` should have removed the test; this requirement is a defensive search.
- MUST update `src/modules/auth/CLAUDE.md` to remove the transitional subsection added in task_07 (the one explaining PR 1 → PR 2 sequencing and the legacy adapter). The "Account Anonymization" section becomes the only documented flow.
- MUST verify that the integration tests from task_06 (`src/modules/auth/anonymize/__tests__/anonymize.test.ts`) still pass without any modification — anonymization behavior is unchanged.
- MUST add or update an integration test confirming that `POST /api/auth/delete-user` now returns 404 (or the equivalent "route not found" status), proving the legacy endpoint is gone. If adding a positive 404 test is fragile (depends on Better Auth's internal routing), document the manual verification step in the PR description instead.
- MUST run the post-deploy SQL invariant check (operational runbook) once after this PR is deployed to production. This is documented as the deploy step, not an automated test in the codebase.
</requirements>

## Subtasks
- [ ] 8.1 Verify the PR 1 calendar gate: PR 1 in production, frontend in production, manual validation completed. Document the verification in the PR description.
- [ ] 8.2 Delete the entire `user: { deleteUser: { ... } }` block in `src/lib/auth.ts`, including the `beforeDelete` adapter and the `afterDelete` hook.
- [ ] 8.3 Delete `auditUserDelete` from `src/lib/auth/audit-helpers.ts`. Keep `buildAuditEntry` intact.
- [ ] 8.4 Run a codebase search for `auditUserDelete` and confirm zero callers remain before deletion.
- [ ] 8.5 Run a codebase search for `delete-user` (the legacy URL path) and update or remove any remaining references.
- [ ] 8.6 Remove the transitional subsection in `src/modules/auth/CLAUDE.md` so the file documents only the canonical anonymization flow.
- [ ] 8.7 Re-run the test suite for the anonymize submodule and confirm all integration scenarios still pass.
- [ ] 8.8 Add or document the verification that `POST /api/auth/delete-user` returns 404 post-deploy.

## Implementation Details
See ADR-009 for the rationale of the two-PR split, ADR-005 for the cleanup scope, and `_techspec.md` "Impact Analysis" PR 2 column for the file-level change list.

Deletion is mechanical: cut the block, clean up imports left orphaned (e.g., `APIError` from `better-auth/api` may no longer be needed in `auth.ts`; `auditUserDelete` import in `auth.ts`).

### Relevant Files
- `src/lib/auth.ts` — `user.deleteUser` block deletion site.
- `src/lib/auth/audit-helpers.ts` — `auditUserDelete` deletion site (keep `buildAuditEntry`).
- `src/modules/auth/CLAUDE.md` — transitional subsection removal.
- `src/modules/auth/anonymize/__tests__/anonymize.test.ts` — regression check; must continue to pass.

### Dependent Files
- None — this is the final task.

### Related ADRs
- [ADR-005: Refactor validateUserBeforeDelete to AppError and remove Better Auth deleteUser block](adrs/adr-005.md) — cleanup scope.
- [ADR-009: Two-PR rollout sequencing](adrs/adr-009.md) — the trigger for this task is the calendar gate this ADR describes.

## Deliverables
- Deletion of the `user.deleteUser` block from `src/lib/auth.ts`.
- Deletion of `auditUserDelete` from `src/lib/auth/audit-helpers.ts`.
- Updated `src/modules/auth/CLAUDE.md` without the transitional subsection.
- Regression-passing integration test suite from task_06.
- Either an integration test asserting `POST /api/auth/delete-user` returns 404, OR a documented manual verification in the PR description **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] No new unit tests are needed; this task is deletion-only.
  - [ ] Compilation succeeds after deletion (no orphaned imports, no dangling references to `auditUserDelete`).
- Integration tests:
  - [ ] All existing scenarios in `src/modules/auth/anonymize/__tests__/anonymize.test.ts` continue to pass without modification.
  - [ ] EITHER an integration test confirming `POST /api/auth/delete-user` returns 404 / route-not-found AFTER this task's changes, OR a manual verification step recorded in the PR description with a screenshot/log excerpt.
- Test coverage target: N/A (deletion-only)
- All tests must pass

## Success Criteria
- All existing tests passing
- `POST /api/auth/delete-user` returns 404 (verified by automated test or by manual deploy-time check, recorded in PR)
- Zero remaining references to `auditUserDelete` or the `user.deleteUser` block in the codebase
- The `CLAUDE.md` describes only the canonical anonymization flow (no transitional notes)
- `npx ultracite check` passes
- Post-deploy SQL invariant check (operational runbook) passes against production after this PR's deploy

## Calendar Precondition (out of code scope)

This task is a **calendar gate**, not a code dependency. Before starting, confirm:

1. PR 1 (tasks 01-07) is merged and deployed to **production**.
2. The frontend release consuming `POST /v1/account/anonymize` is deployed to **production**.
3. The new flow has been validated end-to-end in production (the post-deploy SQL invariant check passed and at least one real anonymization completed without incident).
4. There is no open incident, regression, or rollback under consideration for the anonymization flow.

The dependency declared in YAML (`task_07`) is the code dependency only — `task_07` updates the file that this task edits. The four conditions above are the calendar preconditions and must be verified independently of the dependency graph.
