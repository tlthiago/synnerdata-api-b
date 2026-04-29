# Auth Module

Autenticação via Email/Password e lifecycle de usuários/organizações.

## Authentication Flow

- Email/password com verificação de email obrigatória
- `appName: "Synnerdata"` — exibido em authenticator apps (TOTP)
- Criação automática de usuário no sign-up
- Rate limits: 5 tentativas/60s (sign-in), 3/60s (sign-up), 3/60s (two-factor), 3/300s (forgot-password)
- Implementação real em `src/lib/auth.ts` e `src/plugins/auth-guard/auth-plugin.ts` — este módulo contém apenas testes

## User Roles (system-level)

- **super_admin** — email em `SUPER_ADMIN_EMAILS` env var. Sem org membership, sem trial. Bypass total.
- **admin** — email em `ADMIN_EMAILS` env var. Sem org membership, sem trial. Bypass total.
- **user** — qualquer outro email. Auto-owner da primeira org. Trial criado automaticamente.

## Organization & Trial Lifecycle

1. Sign-up → user criado, email de verificação enviado
2. Verificação de email → welcome email enviado. Na prática apenas `role === "user"` passa por esse fluxo, pois admin/super_admin já nascem com `emailVerified: true`
3. Primeira organização → user vira owner, trial de **14 dias** criado via `SubscriptionService.createTrial()`
4. Trial state derivado dinamicamente: `isTrial && trialEnd > now` → "trial"; `trialEnd <= now` → "trial_expired"
5. `hasAccess: false` + `requiresPayment: true` após expiração

## Organization Limits

- `organizationLimit: 1` — cada usuário pode criar no máximo 1 organização
- `membershipLimit: 4` — máximo de 4 membros por organização (1 owner, 1 manager, 1 supervisor, 1 viewer)
- `allowUserToCreateOrganization` — async, verifica 3 condições: `role === "user"`, sem membership existente, sem convite pendente

## Organization Member Roles

- `owner` | `manager` | `supervisor` | `viewer`
- Validados antes da criação de convite (400 se inválido)
- Convite para email existente retorna `USER_ALREADY_EXISTS` (sem multi-tenancy)

## Organization Deletion Protection

- `beforeDeleteOrganization` impede deleção se houver membros ativos além do owner (`ORGANIZATION_HAS_ACTIVE_MEMBERS`)
- `beforeDeleteOrganization` impede deleção se houver assinatura **paga** ativa com acesso (`hasAccess && status in ["active", "past_due"]`). Trials (ativos ou expirados) são permitidos

## Session

- `activeOrganizationId` — org ativa do usuário (null para admins)
- Cookie cache: 5 min max age
- Definido automaticamente no primeiro membership

## Advanced Config

- `useSecureCookies` — ativado em produção, desabilitado em teste
- `ipAddressHeaders` — `["x-forwarded-for", "x-real-ip"]` para reverse proxy (Coolify)

## Auth Plugin (`src/plugins/auth-guard/auth-plugin.ts`) — Macro Checks

- `requireAdmin` → exige admin ou super_admin
- `requireSuperAdmin` → exige super_admin
- `requireOrganization` → `activeOrganizationId` deve existir
- `requireActiveSubscription` → valida via `SubscriptionService.checkAccess()`
- `requireFeature` / `requireFeatures` → valida features do plano via `LimitsService`
- `permissions: { resource: ["action"] }` → delegado a `auth.api.hasPermission()`
- `allowAdminBypass` → admins e API keys podem bypassar checks de subscription

## Emails

- **Verificação**: enviado no sign-up para usuários sem convite pendente. Convidados são auto-verificados (`emailVerified: true`) pois o convite prova posse do email
- **Welcome**: enviado após verificação de email (`afterEmailVerification`), sem guard de role. Admin/super_admin não recebem na prática porque já nascem com `emailVerified: true` e nunca passam pelo fluxo de verificação
- **OTP (2FA)**: 6 dígitos, 5 min expiração, armazenamento encrypted
- **Convite**: template com inviter, org name, link (`{APP_URL}/convite/{invitationId}?email={encoded}`), role
- **Password reset**: link com expiração, revoga todas as sessions

## Account Anonymization

- Project-owned endpoint `POST /v1/account/anonymize` (session-only auth, requires the user's password in the body)
- LGPD-aligned: `users` row is preserved so authorship FKs (`createdBy`/`updatedBy`) on historical records stay intact; PII fields are irreversibly overwritten and credentials revoked in the same transaction
- Implementation lives in `src/modules/auth/anonymize/` — see `anonymize.service.ts` for orchestration, `anonymize.controller.ts` for HTTP wiring
- After commit, sends a best-effort confirmation email to the **original** address (captured pre-overwrite); email failures do not roll back the operation

### Anonymization Semantics

- Overwrites on `users`: `name = "Usuário removido"`, `email = "anon-${userId}@deleted.synnerdata.local"`, `image = null`, `emailVerified = false`, `anonymizedAt = now()`
- The deterministic email placeholder preserves the UNIQUE constraint and **frees the original address** for re-registration
- Operation is irreversible — no original PII is retained anywhere after commit (audit-log payload is non-PII by design)

### Error Codes

| Status | Code | Trigger |
|---|---|---|
| 400 | `INVALID_PASSWORD` | Password verification via `auth.api.verifyPassword` failed |
| 400 | `ADMIN_ACCOUNT_DELETE_FORBIDDEN` | User has role `admin` or `super_admin` |
| 400 | `ACTIVE_SUBSCRIPTION` | Owner with `hasAccess` and `status in ["active", "past_due"]` |
| 400 | `ORGANIZATION_HAS_MEMBERS` | Owner with at least one other active member |

### Business Rules

| Condition | Result |
|---|---|
| Admin or super_admin | **Blocked** — `ADMIN_ACCOUNT_DELETE_FORBIDDEN`. Admin accounts cannot self-anonymize |
| User without org | Anonymize user directly |
| Owner of trial org (active or expired), no other members | Anonymize user + cascade-delete org |
| Owner with active paid subscription (`hasAccess` + `active`/`past_due`) | **Blocked** — `ACTIVE_SUBSCRIPTION`; cancel subscription first |
| Owner with `past_due` outside grace period (`hasAccess=false`) | Anonymize user + cascade-delete org (no active access) |
| Owner with other active members | **Blocked** — `ORGANIZATION_HAS_MEMBERS`; remove members first |
| Non-owner member (edge case) | Anonymize user; membership row removed by the credential cleanup if applicable |

### Credential Cleanup (in-transaction)

Five Better Auth credential tables are deleted in the same transaction as the PII overwrite. Because the `users` row is preserved, FK cascades do **not** fire — these explicit deletes are the primary cleanup mechanism:

- `sessions`
- `accounts`
- `twoFactors`
- `apikeys`
- `invitations` (as inviter)

### Cascade (DB-level, when org-cascade applies)

When the trial-org cascade triggers, the organization is deleted inside the same transaction:

- Deleting organization → CASCADE: members, subscriptions, billing profiles, employees, all occurrences, org profile, pending checkouts, price adjustments

### Audit Log

Every successful anonymization inserts exactly one `audit_logs` row (in-transaction, strict — failure rolls the operation back):

- `action = "anonymize"`, `resource = "user"`, `resourceId = <userId>`, `userId = <self>`
- Non-PII payload: `changes.before = { wasOwnerOfTrialOrg, organizationCascade }`
- The audit-log row is the authoritative event record; the post-commit email is informational only

### Future Work

Grace period before anonymization (cooling-off window with restore affordance) is a separate future PRD. Other deferred items: admin-initiated anonymization on behalf of a user, system-initiated anonymization for long-inactive accounts, and bulk anonymization.

## Melhorias Futuras

- 2FA obrigatório para admin/super_admin
- Admin poder criar organizações para owners
