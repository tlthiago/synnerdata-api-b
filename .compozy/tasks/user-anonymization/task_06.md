---
status: completed
title: AnonymizeController + integration tests + app mount + legacy test cleanup
type: backend
complexity: high
dependencies:
  - task_05
---

# Task 06: AnonymizeController + integration tests + app mount + legacy test cleanup

## Overview
Expose the anonymization service over HTTP via an Elysia controller mounted at `POST /v1/account/anonymize`, register it in the v1 router, write the integration test suite covering 11-12 scenarios end-to-end (golden path + every guard + email reuse + audit-log shape + atomic rollback as optional), and remove the legacy `delete-account.test.ts` file. This task ships the user-facing contract; everything before it was infrastructure.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `src/modules/auth/anonymize/anonymize.controller.ts` exporting `anonymizeController` as an Elysia instance with `name: "anonymize"`, `prefix: "/account"`, `detail: { tags: ["Account"] }`, mounting `betterAuthPlugin` and defining a `POST /anonymize` route.
- MUST configure the route's auth as session-only (no `requireOrganization`, no permissions, no `requireAdmin`). The macro at `src/plugins/auth-guard/options.ts:3-14` supports this by omitting the `requireOrganization` field.
- MUST validate the request body with `anonymizeRequestSchema` from `anonymize.model.ts` (task_05) and the response with `anonymizeResponseSchema`.
- MUST register the controller in `src/routes/v1/index.ts` via `.use(anonymizeController)`. The combined prefix yields `/v1/account/anonymize`.
- MUST return `wrapSuccessWithMessage(null, "Conta anonimizada com sucesso.")` with HTTP 200 on success.
- MUST declare typed error responses in OpenAPI: `400` (`validationErrorSchema` for invalid password / guard blocks), `401` (`unauthorizedErrorSchema` for missing or revoked session), `422` (`validationErrorSchema` for Zod parse failures).
- MUST create `src/modules/auth/anonymize/__tests__/anonymize.test.ts` covering ALL of the following scenarios end-to-end via `app.handle(new Request(...))`:
  1. Authenticated user with no organization — 200; row preserved with PII overwritten and `anonymizedAt` set; sessions/accounts/twoFactors/apikeys/invitations removed.
  2. Anonymized user's email is immediately reusable — re-register with the original email succeeds.
  3. Anonymized email can be invited to another org by a different user.
  4. Owner of active trial org (no other members) — 200; org is deleted; PII overwritten on `users` row.
  5. Owner of expired trial org — 200; same outcome as #4.
  6. Owner with `past_due` subscription outside grace (`hasAccess=false`) — 200; org deleted.
  7. Owner with active paid subscription (`hasAccess=true`, `status="active"`) — 400 / `ACTIVE_SUBSCRIPTION`; row unchanged.
  8. Owner with other active members — 400 / `ORGANIZATION_HAS_MEMBERS`; row unchanged.
  9. Admin or super_admin role — 400 / `ADMIN_ACCOUNT_DELETE_FORBIDDEN`; row unchanged.
  10. Wrong password — 400 / `INVALID_PASSWORD`; row unchanged; no `audit_logs` row inserted.
  11. Audit-log assertion: after a successful anonymization, exactly one `audit_logs` row exists with `action="anonymize"`, `resource="user"`, `resourceId=<userId>`, and `changes.before = { wasOwnerOfTrialOrg, organizationCascade }`.
  12. **OPTIONAL — Atomic rollback**: include this scenario only if a test-only seam to inject a failure mid-transaction is cheap to add (e.g., via a flag-based override of one mutation step). If the seam would be invasive, document the omission in the test file's setup and rely on manual homolog validation as fallback. The fallback is acceptable per the TechSpec.
- MUST delete `src/modules/auth/__tests__/delete-account.test.ts` after the new test file is in place and all 11 mandatory scenarios pass.
- MUST NOT implement the post-deploy SQL invariant check as an automated test in this file. The release-time invariant query is an operational runbook concern (see TechSpec "Monitoring and Observability > Release-time invariant"), executed manually in homolog after PR 1 deploy and in prod after PR 2 deploy. The runbook lives outside this codebase or alongside the deploy pipeline; this task does not own it.
- MUST keep test setup aligned with the project pattern: `createTestApp()` from `src/test/support/app.ts`, factories from `src/test/factories/*` (`UserFactory`, `OrganizationFactory`, `PlanFactory`, `SubscriptionFactory.*`), and request building via `app.handle(new Request(\`${BASE_URL}/v1/account/anonymize\`, ...))`.
- MUST mock the email transporter (or use the project's existing mock pattern from `delete-account.test.ts`) so test assertions can verify `sendEmail` invocation without actually delivering.
</requirements>

## Subtasks
- [x] 6.1 Create `anonymize.controller.ts` with the Elysia route definition, session-only auth, request/response Zod schemas, and OpenAPI metadata.
- [x] 6.2 Register the controller in `src/routes/v1/index.ts` via `.use(anonymizeController)`.
- [x] 6.3 Create `__tests__/anonymize.test.ts` with all 11 mandatory scenarios.
- [x] 6.4 Evaluate test-seam cost for scenario #12; include if cheap, otherwise document the deferral to manual homolog validation.
- [x] 6.5 Mock the email transporter (mirror the pattern used in `delete-account.test.ts`); assert that `sendEmail` is called with the original (pre-anonymization) address on the happy path.
- [x] 6.6 Run the new test file against the test database; iterate until all mandatory scenarios pass.
- [x] 6.7 Delete `src/modules/auth/__tests__/delete-account.test.ts` after parity is established.

## Implementation Details
See TechSpec section "Implementation Design > API Endpoints" for the route contract, "Testing Approach > Integration Tests" for the scenario list, and "Monitoring and Observability" for the runbook scope (which this task does NOT implement).

The route mount pattern is documented in `src/routes/v1/index.ts:10-19`. The new line is `.use(anonymizeController)` added to the chain. The auth-guard macro options live at `src/plugins/auth-guard/options.ts:3-14`.

### Relevant Files
- `src/modules/organizations/cost-centers/index.ts:24-59` — controller pattern reference (Elysia macro auth, Zod request/response, OpenAPI metadata).
- `src/routes/v1/index.ts:10-19` — controller registration site.
- `src/plugins/auth-guard/auth-plugin.ts` and `src/plugins/auth-guard/options.ts:3-14` — `betterAuthPlugin` macro and options.
- `src/lib/responses/envelope.ts` — `wrapSuccessWithMessage`.
- `src/lib/responses/response.types.ts` — `validationErrorSchema`, `unauthorizedErrorSchema`, `successResponseSchema`.
- `src/test/support/app.ts:17` — `createTestApp()`.
- `src/test/factories/user.factory.ts:43` — `UserFactory.create()` (uses hardcoded `TEST_PASSWORD = "TestPassword123!"` which is the password the integration tests use for the happy path; a different string triggers `INVALID_PASSWORD`).
- `src/test/factories/organization.factory.ts:51` — `OrganizationFactory.create()`.
- `src/test/factories/payments/subscription.factory.ts:54-199` — `SubscriptionFactory.createTrial / createActive / createPastDue / createExpired`.
- `src/modules/auth/__tests__/delete-account.test.ts` — legacy test file (deleted at the end of this task; its setup pattern is the reference for the new file).
- `src/modules/auth/anonymize/anonymize.service.ts` (task_05) — service consumed by the controller.
- `src/modules/auth/anonymize/anonymize.model.ts` (task_05) — Zod schemas referenced by the controller.

### Dependent Files
- `src/modules/auth/CLAUDE.md` (task_07) — documentation update consumes the new endpoint contract documented here.

### Related ADRs
- [ADR-001: Self-service-only anonymization scope](adrs/adr-001.md) — the route enforces self-service (no admin path).
- [ADR-002: Atomic single-transaction semantics](adrs/adr-002.md) — assertions in scenario #12 (if included).
- [ADR-004: Module placement under src/modules/auth/anonymize/](adrs/adr-004.md) — controller location.
- [ADR-006: Minimal non-PII payload for the audit-log entry](adrs/adr-006.md) — assertion in scenario #11.

## Deliverables
- New `src/modules/auth/anonymize/anonymize.controller.ts` with the route definition.
- Controller registered in `src/routes/v1/index.ts`.
- New `src/modules/auth/anonymize/__tests__/anonymize.test.ts` with all 11 mandatory scenarios passing (and scenario #12 if test seam was added).
- `src/modules/auth/__tests__/delete-account.test.ts` deleted.
- Test coverage >=80% on the new endpoint surface **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] No isolated unit tests for the controller — the controller is thin glue and its behavior is exercised entirely by the integration tests below (per TechSpec "Testing Approach > Unit Tests").
- Integration tests (in `src/modules/auth/anonymize/__tests__/anonymize.test.ts`):
  - [ ] Scenario 1: Authenticated user with no org — request returns 200; `users.anonymized_at IS NOT NULL`; `users.email` matches `anon-${userId}@deleted.synnerdata.local`; `users.name === "Usuário removido"`; zero rows in `sessions`/`accounts`/`twoFactors`/`apikeys`/`invitations` for the user.
  - [ ] Scenario 2: After scenario 1, registering a new account with the original email succeeds.
  - [ ] Scenario 3: After scenario 1, the original email can be invited to a different organization.
  - [ ] Scenario 4: Owner of active trial org (no other members) — 200; org row is gone (`SELECT 1 FROM organizations WHERE id = orgId` returns no row).
  - [ ] Scenario 5: Owner of expired trial org — 200; org row is gone.
  - [ ] Scenario 6: Owner with `past_due` subscription outside grace — 200; org row is gone.
  - [ ] Scenario 7: Owner with `status="active"` paid subscription — 400 with `error.code === "ACTIVE_SUBSCRIPTION"`; user row unchanged; `audit_logs` has no `anonymize` row.
  - [ ] Scenario 8: Owner with other active members — 400 with `error.code === "ORGANIZATION_HAS_MEMBERS"`; user row unchanged.
  - [ ] Scenario 9: Admin role — 400 with `error.code === "ADMIN_ACCOUNT_DELETE_FORBIDDEN"`; user row unchanged.
  - [ ] Scenario 10: Wrong password (any string ≠ `"TestPassword123!"`) — 400 with `error.code === "INVALID_PASSWORD"`; user row unchanged; no `audit_logs` row.
  - [ ] Scenario 11: After a successful anonymization, exactly one `audit_logs` row exists for the user with `action="anonymize"`, `resource="user"`, `resourceId=<userId>`, `userId=<userId>`, and `changes.before` matching `{ wasOwnerOfTrialOrg, organizationCascade }`.
  - [ ] Email-send assertion: on the happy path, the mocked transporter is called with `to` = the user's original email (captured pre-commit), not the placeholder.
  - [ ] OPTIONAL Scenario 12: Atomic rollback — if a test seam is implemented, asserts that a forced mid-transaction failure leaves the user row intact, all dependent rows present, and zero `audit_logs` rows.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- The 11 mandatory integration scenarios pass; scenario #12 either passes (if seam was cheap) or its omission is justified in a comment in the test file
- The legacy `delete-account.test.ts` file is deleted
- `POST /v1/account/anonymize` is reachable and listed in the OpenAPI output (manual spot-check)
- `npx ultracite check` passes

## Operational Note (out of scope for this task)

The post-deploy SQL invariant check (zero orphans across `sessions`/`accounts`/`twoFactors`/`apikeys`/`invitations` for users with `anonymized_at IS NOT NULL`) documented in the TechSpec's "Monitoring and Observability > Release-time invariant" section is **NOT an automated test**. It is a manual operational runbook executed against homolog after the PR 1 deploy and against prod after the PR 2 deploy. This task does not add it to CI; document it in the deploy runbook owned by DevOps.
