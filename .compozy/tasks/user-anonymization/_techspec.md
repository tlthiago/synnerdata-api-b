# TechSpec — PRD #2 User Anonymization

## Executive Summary

The implementation introduces a single self-service endpoint, `POST /v1/account/anonymize`, that replaces Better Auth's native `deleteUser` flow with an irreversible anonymization of the `users` row. The endpoint lives in a new submodule `src/modules/auth/anonymize/`. The flow runs in a single PostgreSQL transaction: validate preconditions, verify password, overwrite PII fields, set `anonymized_at`, delete dependent auth artifacts, optionally cascade-delete a sole-owned trial organization, and insert one `audit_logs` row with `action="anonymize"`. A confirmation email is sent best-effort post-commit.

The delivery is split across **two coordinated PRs** (per ADR-009): PR 1 ships the new endpoint and migrates `validateUserBeforeDelete` to the project's `AppError` hierarchy (with a temporary adapter inside `src/lib/auth.ts` so the legacy `deleteUser` block keeps working during the transition); the frontend deploys consuming the new endpoint; PR 2 then removes the legacy `user.deleteUser` block and `auditUserDelete`. A new `anonymize` value joins the `AuditAction` enum in PR 1. `AuditService.log` is extended with an optional transaction parameter (per ADR-008) so the audit-log insert can participate in the anonymization transaction.

**Primary trade-off:** atomicity is enforced at the cost of operator-driven retry on transient infra failures. Best-effort recovery paths and partial-state machines are explicitly rejected (ADR-002) because the operation is auth-critical and rare. Email delivery is the one tolerated post-commit best-effort step, with the audit-log row as the authoritative event record. Two-PR sequencing is the secondary trade-off: it adds one cycle but eliminates the risk window in which the frontend could call a removed legacy endpoint.

## System Architecture

### Component Overview

| Component | Responsibility | Boundary |
|---|---|---|
| `AnonymizeController` (Elysia) | HTTP entry point. Validates Zod schemas, delegates to service, applies response envelope. | `src/modules/auth/anonymize/anonymize.controller.ts` |
| `AnonymizeService` | Orchestrates the flow: password verification, validation, transaction, post-commit email send. | `src/modules/auth/anonymize/anonymize.service.ts` |
| `validateUserBeforeDelete` (refactored) | Shared invariant: admin/super_admin block, owner-with-paid-subscription block, owner-with-active-members block, returns optional `organizationId` for cascade. Throws `AppError`. | `src/lib/auth/hooks.ts` |
| `AuditService.log` | Inserts the `audit_logs` row with `action="anonymize"`. Called inside the transaction. | `src/modules/audit/audit.service.ts` (existing) |
| `sendEmail` + new `AccountAnonymizedEmail` template | Sends best-effort confirmation post-commit. | `src/lib/emails/mailer.ts` (existing) + new template |
| `auth.api.verifyPassword` | Server-side password verification using Better Auth's official helper. | Better Auth library API |
| `users` schema (modified) | New `anonymized_at: timestamp` column. | `src/db/schema/auth.ts` |
| `AuditAction` enum (modified) | Adds `"anonymize"` literal. | `src/modules/audit/audit.model.ts` |

### Data Flow

```
client → POST /v1/account/anonymize { password }
  ↓
AnonymizeController (auth-guard: session-only)
  ↓
AnonymizeService.anonymize(userId, password, request.headers)
  ├─ verifyPassword(password, headers)                    // pre-transaction
  ├─ validateUserBeforeDelete(user)                       // pre-transaction
  ├─ db.transaction(async tx => {
  │     ├─ overwrite PII on users (name/email/image/email_verified/anonymized_at)
  │     ├─ delete sessions, accounts, twoFactors, apikeys, invitations
  │     ├─ if organizationCascade: delete organization (cascades members/etc)
  │     └─ insert audit_logs row (action="anonymize")
  │   })
  └─ post-commit best-effort: sendEmail({ to: originalEmail, ... })
  ↓
wrapSuccessWithMessage(null, "Conta anonimizada com sucesso") → 200
```

### External System Interactions

- **Better Auth library** — `auth.api.verifyPassword` for password check; no other Better Auth API calls in the success path.
- **PostgreSQL** — single transaction across `users`, Better Auth tables, `organizations` (when cascade applies), and `audit_logs`.
- **SMTP (Nodemailer)** — fire-and-forget after commit via `sendEmail`.

## Implementation Design

### Core Interfaces

**`AnonymizeService` shape:**

```typescript
type AnonymizeInput = {
  userId: string;
  password: string;
  requestHeaders: Headers;
};

export abstract class AnonymizeService {
  static async anonymize(input: AnonymizeInput): Promise<void> {
    const user = await getUserOrThrow(input.userId);
    await verifyPasswordOrThrow(input.password, input.requestHeaders);
    const orgIdToCascade = await validateUserBeforeDelete(user);

    await db.transaction(async (tx) => {
      await overwritePii(tx, user);
      await deleteAuthArtifacts(tx, user.id);
      if (orgIdToCascade) await tx.delete(schema.organizations)
        .where(eq(schema.organizations.id, orgIdToCascade));
      await AuditService.log(buildAnonymizeAuditEntry(user, orgIdToCascade), tx);
    });

    void sendBestEffort(
      () => sendAccountAnonymizedEmail({ email: user.email }),
      { type: "email:account-anonymized", userId: user.id },
    );
  }
}
```

`AuditService.log(entry, tx)` runs the insert on the transaction connection and propagates errors (per ADR-008): a failure rolls back the whole transaction. `verifyPasswordOrThrow` wraps `auth.api.verifyPassword` and maps Better Auth's `APIError("INVALID_PASSWORD")` to the project's `BadRequestError("INVALID_PASSWORD")`; see "Integration Points" below for the exact contract.

**Refactored `validateUserBeforeDelete` signature (return type unchanged):**

```typescript
import type { BadRequestError } from "@/lib/errors/http-errors";

// throws BadRequestError({ code: "ADMIN_ACCOUNT_DELETE_FORBIDDEN" |
//                                 "ACTIVE_SUBSCRIPTION" |
//                                 "ORGANIZATION_HAS_MEMBERS" })
export async function validateUserBeforeDelete(user: {
  id: string;
  email: string;
  role?: string;
}): Promise<string | null>;
```

**Controller route definition:**

```typescript
export const anonymizeController = new Elysia({
  name: "anonymize",
  prefix: "/account",
  detail: { tags: ["Account"] },
})
  .use(betterAuthPlugin)
  .post("/anonymize", async ({ session, user, body, request }) => {
    await AnonymizeService.anonymize({
      userId: user.id, password: body.password, requestHeaders: request.headers,
    });
    return wrapSuccessWithMessage(null, "Conta anonimizada com sucesso.");
  }, {
    auth: { /* session only; no permissions, no requireOrganization */ },
    body: anonymizeRequestSchema,
    response: {
      200: anonymizeResponseSchema,
      400: validationErrorSchema, 401: unauthorizedErrorSchema,
    },
    detail: { summary: "Anonymize current user account",
              description: "Irreversibly anonymizes the authenticated user." },
  });
```

### Data Models

**Migration — add `anonymized_at` to `users`:**

```typescript
// src/db/schema/auth.ts (excerpt — edit existing users table)
export const users = pgTable("users", {
  // ... existing columns ...
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
});
```

`bun run db:generate` produces `src/db/migrations/00NN_<slug>.sql`. The generated SQL is `ALTER TABLE users ADD COLUMN anonymized_at TIMESTAMP WITH TIME ZONE` — additive, nullable, default `NULL`. No backfill required; existing rows remain `NULL`.

**Request schema — `anonymizeRequestSchema`:**

```typescript
import { z } from "zod";

export const anonymizeRequestSchema = z.object({
  password: z.string().min(1, "Senha obrigatória."),
});

export type AnonymizeRequest = z.infer<typeof anonymizeRequestSchema>;
```

**Response schema — `anonymizeResponseSchema`:**

Use the project's `successResponseSchema(z.null())` from `src/lib/responses/response.types.ts`. The endpoint returns `{ success: true, data: null, message: "Conta anonimizada com sucesso." }`.

**Anonymized PII values:**

```typescript
const ANONYMIZED_NAME = "Usuário removido";
const anonymizedEmail = (userId: string) => `anon-${userId}@deleted.synnerdata.local`;
```

**Audit-log payload (per ADR-006):**

```typescript
function buildAnonymizeAuditEntry(
  user: { id: string }, orgIdCascade: string | null
): AuditLogEntry {
  return buildAuditEntry({
    action: "anonymize",
    resource: "user",
    resourceId: user.id,
    userId: user.id,
    before: { wasOwnerOfTrialOrg: orgIdCascade !== null,
              organizationCascade: orgIdCascade },
    after: undefined,
  });
}
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/v1/account/anonymize` | Irreversibly anonymizes the authenticated user. Requires session + password. |

**Request body:** `{ "password": string }`.
**Success response (200):** `{ success: true, data: null, message: "Conta anonimizada com sucesso." }`. The session is invalidated as a side effect (the user's session row is deleted in the transaction). The frontend logs the user out client-side after receiving the success response.

**Error responses:**

| Status | Code | Trigger |
|---|---|---|
| 400 | `INVALID_PASSWORD` | `auth.api.verifyPassword` threw `APIError("BAD_REQUEST", "INVALID_PASSWORD")`. |
| 400 | `ADMIN_ACCOUNT_DELETE_FORBIDDEN` | User has role `admin` or `super_admin`. |
| 400 | `ACTIVE_SUBSCRIPTION` | User is owner of an org with `hasAccess && status in ["active","past_due"]`. |
| 400 | `ORGANIZATION_HAS_MEMBERS` | User is owner of an org with at least one other active member. |
| 401 | `UNAUTHORIZED` | No valid session (rejected by `betterAuthPlugin` macro before reaching the service). |
| 422 | `VALIDATION` | Request body fails Zod parse (missing/empty `password`). |
| 5xx | — | Transactional failure (rare); user retries. |

**Note on already-anonymized users:** an anonymized user has no valid session (sessions/accounts/twoFactors/apikeys are deleted in the same transaction; password hash is invalidated by overwrite). The auth guard rejects with 401 before the service runs. No explicit "already anonymized" code path is needed (covered in ADR-006/PRD Open Questions resolution).

## Integration Points

### Better Auth password verification

**API contract verified directly against `node_modules/better-auth/dist/api/routes/password.mjs:167-193` (better-auth 1.6.9), not the published docs (which diverge):**

- **Endpoint shape:** `POST /verify-password`. Body `{ password: string }`. Headers must carry the session cookie. Project call: `auth.api.verifyPassword({ body: { password }, headers: request.headers })`.
- **Success:** the call resolves; the response body is `{ status: true }`. The service ignores the body — absence of a thrown error is the success signal.
- **Wrong password:** the call **throws** `APIError("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD)` (where `BASE_ERROR_CODES.INVALID_PASSWORD === "INVALID_PASSWORD"`). The service catches it, identifies the code, and re-throws as `BadRequestError("Senha incorreta.", { code: "INVALID_PASSWORD" })`.
- **Other errors** (infra, DB unreachable, etc.): propagate untouched as 5xx.
- **Middleware:** `sensitiveSessionMiddleware` (`node_modules/better-auth/dist/api/routes/session.mjs:307-314`) — re-fetches the session from DB with `disableCookieCache: true` so that a session revoked elsewhere cannot pass via cached cookie. **Does NOT require a "fresh" session.** No special UX trigger needed; the existing modal-prompts-for-password flow satisfies it.
- **Rate-limiting:** governed by Better Auth's internal config; the project does not add a second layer here.

Service-side wrapper (call site referenced in Core Interfaces):

```typescript
import { APIError } from "better-auth/api";

async function verifyPasswordOrThrow(password: string, headers: Headers): Promise<void> {
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
  } catch (error) {
    if (error instanceof APIError && error.body?.code === "INVALID_PASSWORD") {
      throw new BadRequestError("Senha incorreta.", { code: "INVALID_PASSWORD" });
    }
    throw error;
  }
}
```

### Email send (best-effort post-commit)

- **API:** `sendEmail({ to, subject, html, text })` from `src/lib/emails/mailer.ts`.
- **Wrapper:** `sendBestEffort(() => sendAccountAnonymizedEmail(...), context)` — existing helper that catches and logs send failures without throwing.
- **Template:** new `AccountAnonymizedEmail` (React Email JSX) under `src/lib/emails/templates/auth/account-anonymized.tsx`. Sender wrapper at `src/lib/emails/senders/auth.tsx` exposes `sendAccountAnonymizedEmail({ email })`.
- **Captured pre-commit:** the original email is captured in the service before the transaction starts (the `user` object loaded for validation already holds it). After commit, the sender uses this captured value, not a re-read of the row (which would have the `anon-...` placeholder).

## Impact Analysis

| Component | Impact Type | Description and Risk | Required Action |
|---|---|---|---|
| `src/modules/auth/anonymize/` | new (PR 1) | Submodule with controller, service, model, tests. Low risk — net-new code. | Create files. |
| `src/db/schema/auth.ts` (`users` table) | modified (PR 1) | Add `anonymizedAt` column. Additive, nullable. Low migration risk. | Edit schema, run `bun run db:generate`. |
| `src/db/migrations/` | new (PR 1) | New migration file generated. Zero-row impact at apply time. | Commit generated SQL. |
| `src/lib/auth.ts` | modified (PR 1, then PR 2) | PR 1: keep `user.deleteUser` block; add adapter that catches `AppError` from `validateUserBeforeDelete` and re-throws as `APIError`. PR 2: remove the entire block (and the adapter). | PR 1 edit + PR 2 deletion. |
| `src/lib/auth/hooks.ts` | modified (PR 1) | Refactor `validateUserBeforeDelete` from `APIError` to `AppError`. Risk: behavioral parity must be preserved. | Update throws; tests confirm codes are stable. |
| `src/lib/auth/audit-helpers.ts` | modified (PR 2) | Remove `auditUserDelete`. `buildAuditEntry` retained. Risk: orphan callers. | Search-confirm only `auth.ts` (legacy block) calls it; delete with the deleteUser block in PR 2. |
| `src/lib/errors/http-errors.ts` | modified (PR 1, likely) | Add `BadRequestError` if not present, supporting custom `code` field. Low risk — additive. | Add class following existing pattern. |
| `src/modules/audit/audit.model.ts` | modified (PR 1) | Append `"anonymize"` to `AuditAction` literal union. Low risk — additive. | Edit enum + tests. |
| `src/modules/audit/audit.service.ts` | modified (PR 1) | Extend `log(entry, tx?)` per ADR-008. Default behavior preserved when `tx` absent. | Add optional parameter; tests confirm both paths. |
| `src/lib/emails/templates/auth/account-anonymized.tsx` | new (PR 1) | New React Email template. Low risk. | Create template + sender wrapper. |
| `src/lib/emails/senders/auth.tsx` | modified (PR 1) | Add `sendAccountAnonymizedEmail` exporter. | Add function. |
| `src/modules/auth/__tests__/delete-account.test.ts` | deleted (PR 1) | Replaced by new test file under the anonymize submodule. The legacy `deleteUser` flow is exercised through PR 1's adapter; integration test parity for the legacy path is dropped because the path is going away in PR 2 anyway. | Delete file. |
| `src/modules/auth/anonymize/__tests__/anonymize.test.ts` | new (PR 1) | All 9 scenarios from the legacy test, adapted to the new endpoint and assertions, plus INVALID_PASSWORD and audit-log shape assertions. | Create file. |
| `src/modules/auth/CLAUDE.md` | modified (PR 1, again PR 2) | PR 1: document the new flow as primary, note the legacy `deleteUser` block is on borrowed time. PR 2: remove the legacy section. | Rewrite section. |
| App router wiring (where modules are mounted) | modified (PR 1) | Register `anonymizeController` under `/v1`. | Add one line. |

## Testing Approach

### Unit Tests

Service-level coverage is implicit in integration tests; no isolated unit tests planned for `AnonymizeService` because the orchestration value is in the transaction + side-effects, which require a real DB.

The refactored `validateUserBeforeDelete` keeps its current implicit coverage in `delete-account.test.ts` adapted; explicit unit tests are not added — the integration tests assert all three guard codes against real DB state.

### Integration Tests

Single test file `src/modules/auth/anonymize/__tests__/anonymize.test.ts`. Setup follows project convention: `createTestApp()`, factories (`UserFactory`, `OrganizationFactory`, `SubscriptionFactory.*`), `app.handle(new Request(...))`.

Scenarios (replicating the 9 from `delete-account.test.ts` plus the new assertions):

1. Authenticated user with no organization — anonymizes; row preserved with PII overwritten and `anonymizedAt` set; sessions/accounts/twoFactors/apikeys/invitations removed.
2. Anonymized user's email is immediately reusable — re-register with the original email succeeds.
3. Anonymized email can be invited to another org.
4. Owner of active trial org (no other members) — anonymizes; org is deleted; PII overwritten on `users` row.
5. Owner of expired trial org — same as #4.
6. Owner of paid subscription in `past_due` outside grace (`hasAccess=false`) — anonymizes; org deleted.
7. Owner of active paid subscription (`hasAccess=true`) — blocked with 400 / `ACTIVE_SUBSCRIPTION`; row unchanged.
8. Owner with other active members — blocked with 400 / `ORGANIZATION_HAS_MEMBERS`; row unchanged.
9. Admin or super_admin role — blocked with 400 / `ADMIN_ACCOUNT_DELETE_FORBIDDEN`; row unchanged.
10. Wrong password — blocked with 400 / `INVALID_PASSWORD`; row unchanged; no audit-log row inserted.
11. Audit-log row created with `action="anonymize"`, `resource="user"`, `resourceId=<userId>`, `changes.before.wasOwnerOfTrialOrg`, `changes.before.organizationCascade`.
12. Atomicity rollback — simulate failure mid-transaction (e.g., by injecting an error into the org-delete step via test-only seam) and verify the user row is intact and no audit-log row exists. *(Optional; included if test seam is cheap to add.)*

Email-delivery is asserted at the level of "send was invoked with the original email" using the existing project pattern (likely a mocked transporter; if absent, this assertion is skipped and replaced by a manual homolog check).

### Environment

- Tests run via `NODE_ENV=test bun test --env-file .env.test src/modules/auth/anonymize/__tests__/anonymize.test.ts`.
- Real PostgreSQL (per project convention; no DB mocking).
- Better Auth's `verifyPassword` runs against the test DB's credentials account, set up by `UserFactory.create({ password })`.

## Development Sequencing

### Build Order

The work is split across two PRs per ADR-009.

#### PR 1 — coexistence (new endpoint live; legacy still wired)

1. **Add `BadRequestError`** to `src/lib/errors/http-errors.ts` (if not present). No dependencies.
2. **Add `anonymizedAt` column** to `users` schema (`src/db/schema/auth.ts`) and run `bun run db:generate`. No dependencies.
3. **Add `"anonymize"`** to `AuditAction` enum (`src/modules/audit/audit.model.ts`). No dependencies.
4. **Extend `AuditService.log`** with optional `tx` parameter per ADR-008 (`src/modules/audit/audit.service.ts`). No dependencies.
5. **Refactor `validateUserBeforeDelete`** (`src/lib/auth/hooks.ts`) to throw `BadRequestError` with stable codes (`ADMIN_ACCOUNT_DELETE_FORBIDDEN`, `ACTIVE_SUBSCRIPTION`, `ORGANIZATION_HAS_MEMBERS`). Depends on step 1.
6. **Add adapter inside `src/lib/auth.ts` `beforeDelete` hook** that catches `AppError` and re-throws as Better Auth's `APIError`. Depends on step 5. The legacy `user.deleteUser` block stays wired and functional.
7. **Create `AccountAnonymizedEmail` React template** (`src/lib/emails/templates/auth/account-anonymized.tsx`) and **sender wrapper** in `src/lib/emails/senders/auth.tsx`. No dependencies.
8. **Create `src/modules/auth/anonymize/anonymize.model.ts`** (Zod schemas + types). No dependencies.
9. **Create `src/modules/auth/anonymize/anonymize.service.ts`** with `AnonymizeService.anonymize` and the `verifyPasswordOrThrow` helper. Depends on steps 2, 3, 4, 5, 7, 8.
10. **Create `src/modules/auth/anonymize/anonymize.controller.ts`** wiring the route. Depends on steps 8 and 9.
11. **Mount `anonymizeController`** in the app router under `/v1`. Depends on step 10.
12. **Create `src/modules/auth/anonymize/__tests__/anonymize.test.ts`** with all scenarios (12 cases, see Testing). Depends on step 11.
13. **Delete `src/modules/auth/__tests__/delete-account.test.ts`**. Depends on step 12 (parity confirmed in new tests).
14. **Update `src/modules/auth/CLAUDE.md`** to document the new flow as primary, with a note that the legacy `deleteUser` block is on borrowed time. Depends on step 13.

PR 1 ships, deploys to homolog, deploys to prod. **Frontend deploys** consuming `POST /v1/account/anonymize`. Validation in homolog, then prod canary.

#### PR 2 — cleanup (legacy disabled)

1. **Remove `user: { deleteUser: { ... } }` block** from `src/lib/auth.ts` (including the adapter from PR 1). Depends on frontend rollout being complete in production.
2. **Delete `auditUserDelete`** from `src/lib/auth/audit-helpers.ts` (orphan after step 1). `buildAuditEntry` is retained.
3. **Update `src/modules/auth/CLAUDE.md`** to remove the legacy `deleteUser` references. Depends on step 1.

PR 2 ships and deploys. Post-deploy SQL invariant check (zero orphans across `sessions`/`accounts`/`twoFactors`/`apikeys`/`invitations` for users with `anonymized_at IS NOT NULL`) is run after PR 2.

### Technical Dependencies

- Better Auth installed version (verified: 1.6.9 at `node_modules/better-auth/package.json`) exposes `auth.api.verifyPassword` with the contract documented in ADR-007. A version bump after this PRD must re-verify the contract.
- Project must have an SMTP transport configured for the test/homolog environment for the email-send integration test to pass meaningfully (manual homolog validation acceptable as a fallback).
- DB migration is applied as part of the deploy pipeline; no special tooling required.
- Frontend ship gating PR 2 is calendar-coordinated with the frontend team (not a code dependency).

## Monitoring and Observability

### Metrics

- **`POST /v1/account/anonymize` success rate ≥ 99%** — derived from request-success monitoring already in place for project endpoints. Excludes legitimate 4xx (guard blocks, invalid password). Tracks 5xx failures.
- **Audit-log coverage = 100%** — periodic invariant query: `SELECT COUNT(*) FROM users WHERE anonymized_at IS NOT NULL` must equal `SELECT COUNT(*) FROM audit_logs WHERE action='anonymize' AND resource='user'`. Run weekly via existing reporting; mismatch is a P1.

### Log events (structured)

- `auth:anonymize:started` — `{ userId, hasOrgCascade: boolean }` — emitted at service entry.
- `auth:anonymize:rejected` — `{ userId, reason: code }` — emitted when a guard rejects.
- `auth:anonymize:completed` — `{ userId, organizationCascade: orgId|null }` — emitted after commit.
- `auth:anonymize:failed` — `{ userId, error: message }` — emitted on transaction failure.
- `email:account-anonymized:failed` — `{ userId, error: message }` — emitted by `sendBestEffort` on email send failure (audit-log row remains authoritative).

### Release-time invariant (one-shot SQL)

```sql
SELECT u.id
FROM users u
WHERE u.anonymized_at IS NOT NULL
  AND (
    EXISTS (SELECT 1 FROM sessions   s WHERE s.user_id = u.id) OR
    EXISTS (SELECT 1 FROM accounts   a WHERE a.user_id = u.id) OR
    EXISTS (SELECT 1 FROM two_factors tf WHERE tf.user_id = u.id) OR
    EXISTS (SELECT 1 FROM apikeys    k WHERE k.user_id = u.id) OR
    EXISTS (SELECT 1 FROM invitations i WHERE i.inviter_id = u.id)
  );
```

Expected result post-deploy: zero rows. Run in homolog after the new endpoint is live and tested, and again in prod immediately after the deploy that disables Better Auth's `deleteUser`. Non-zero rows is a P1 incident.

## Technical Considerations

### Key Decisions

1. **Module placement: `src/modules/auth/anonymize/` submodule.** Chosen over a new top-level `account` module because no second account-scoped operation exists today. Trade-off: URL-to-filesystem alignment is implicit, documented at the controller's `prefix`. (See ADR-004.)
2. **Validator refactor to AppError; legacy `deleteUser` block retired across two PRs.** PR 1 refactors the validator and adds an adapter in `auth.ts` so the legacy flow keeps working; PR 2 removes the legacy block after the frontend has shipped. Trade-off: an extra cycle for clean coordination with the frontend. (See ADR-005, ADR-009.)
3. **Audit-log payload: minimal non-PII metadata** (`wasOwnerOfTrialOrg`, `organizationCascade`). Trade-off: less forensic detail than a maximalist payload, but zero PII risk and stable schema. (See ADR-006.)
4. **Password verification via `auth.api.verifyPassword`** (verified contract, throws on failure, `sensitiveSessionMiddleware` re-fetches session). Chosen over direct hash comparison. Trade-off: dependency on Better Auth's API surface for an operation we could implement ourselves; pays off in inheriting future hardening. (See ADR-007.)
5. **Atomic single transaction across all DB mutations.** Audit-log insert participates in the transaction (rolls back if anything fails) via the `tx`-aware `AuditService.log` extension. Email send is the only step outside the transaction, best-effort. (See ADR-002, ADR-008.)
6. **`AuditService.log` extended with optional `tx` parameter.** Strict semantics (errors propagate) when `tx` is passed; existing fire-and-forget preserved when absent. Trade-off: adds one optional parameter to a shared service for substantial reuse benefit. (See ADR-008.)
7. **Two-PR rollout sequencing.** PR 1 ships coexistence; PR 2 removes the legacy after frontend rolls out. Trade-off: two cycles instead of one; eliminates the risk window where the frontend could call a removed endpoint. (See ADR-009.)

### Known Risks

- **Better Auth API drift** — a future Better Auth version could rename or restructure `auth.api.verifyPassword`. Mitigation: lock-file pinned; a version bump that touches this API is a known change to handle in scope.
- **Test seam for atomicity-rollback assertion** — depending on how mocks/spies are wired, scenario #12 may require a thin test-only seam (e.g., a service method that the test can substitute to throw mid-transaction). If the seam is invasive, drop the scenario and rely on the homolog manual validation.
- **Email delivery in homolog** — homolog SMTP setup may be missing or differ from prod. Mitigation: fallback to logging-only validation in homolog; assert real delivery in the prod canary window with a pilot internal account.
- **Better Auth tables' FK cascade on user delete** — the explicit deletes in the transaction are belt-and-suspenders against the FK cascades that already fire when a user row is deleted. Since this PRD does NOT delete the `users` row, the cascades do not fire, and the explicit deletes are the **primary** mechanism for credential cleanup. Confirm at implementation time that all five table deletions cover every Better Auth credential surface; missing one (e.g., a passkeys table introduced by a future plugin) would leak a credential. Mitigation: enumerate Better Auth tables once at implementation; add a comment listing them.
- **Org cascade transitively reaches large datasets** — for a sole-owner trial org with many cascadable rows (employees, occurrences), the transaction grows. Trial orgs are typically small; if a large trial appears, the transaction may exceed time limits. Mitigation: trial-org cascade has been working in the current Better Auth flow; behavior parity is preserved.

## Architecture Decision Records

- [ADR-001: Self-service-only anonymization scope for PRD #2](adrs/adr-001.md) — rejects admin-initiated and system-initiated paths.
- [ADR-002: Atomic single-transaction semantics](adrs/adr-002.md) — all DB mutations roll back together; email is best-effort post-commit.
- [ADR-003: Direct rollout (homolog → prod)](adrs/adr-003.md) — single canonical path post-deploy; no feature-flag debt.
- [ADR-004: Module placement under `src/modules/auth/anonymize/`](adrs/adr-004.md) — submodule chosen over a new top-level `account` module.
- [ADR-005: Refactor `validateUserBeforeDelete` to AppError and remove Better Auth `deleteUser` block](adrs/adr-005.md) — single error hierarchy across the project; sequencing per ADR-009.
- [ADR-006: Minimal non-PII payload for the anonymization audit-log entry](adrs/adr-006.md) — `{ wasOwnerOfTrialOrg, organizationCascade }`.
- [ADR-007: Password verification via Better Auth `auth.api.verifyPassword`](adrs/adr-007.md) — official helper; verified contract throws on failure; `sensitiveSessionMiddleware` requires only valid (non-revoked) session.
- [ADR-008: Extend `AuditService.log` with optional transaction parameter](adrs/adr-008.md) — strict semantics when `tx` is passed; existing fire-and-forget preserved otherwise.
- [ADR-009: Two-PR rollout sequencing — coexistence first, then disable](adrs/adr-009.md) — PR 1 ships everything plus an adapter; PR 2 removes the legacy block after frontend rolls out.
