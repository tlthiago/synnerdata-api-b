# Auth Module

Autenticação via Email/Password e lifecycle de usuários/organizações.

## Authentication Flow

- Email/password com verificação de email obrigatória
- `appName: "Synnerdata"` — exibido em authenticator apps (TOTP)
- Criação automática de usuário no sign-up
- Rate limits: 5 tentativas/60s (sign-in), 3/60s (sign-up), 3/60s (two-factor), 3/300s (forgot-password)
- Implementação real em `src/lib/auth.ts` e `src/lib/auth-plugin.ts` — este módulo contém apenas testes

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
- `beforeDeleteOrganization` impede deleção se houver assinatura ativa (`ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION`)

## Session

- `activeOrganizationId` — org ativa do usuário (null para admins)
- Cookie cache: 5 min max age
- Definido automaticamente no primeiro membership

## Advanced Config

- `useSecureCookies` — ativado em produção, desabilitado em teste
- `ipAddressHeaders` — `["x-forwarded-for", "x-real-ip"]` para reverse proxy (Coolify)

## Auth Plugin (`src/lib/auth-plugin.ts`) — Macro Checks

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

## Account Deletion

- Enabled via Better Auth's native `user.deleteUser`
- Frontend calls `authClient.deleteUser({ password })` → `POST /api/auth/delete-user`
- `beforeDelete` hook runs validations and org cleanup before Better Auth deletes the user
- `afterDelete` hook creates audit log

### Deletion Rules

| Condition | Result |
|---|---|
| User without org | Delete user directly |
| Owner of trial org (active or expired), no other members | Delete org + user |
| Owner with active paid subscription (`active`, `past_due`) | **Blocked** — cancel subscription first |
| Owner with other active members | **Blocked** — remove members first |
| Non-owner member (edge case) | Delete user, CASCADE removes membership |

### Cascade (DB-level)

- Deleting organization → CASCADE: members, subscriptions, billing profiles, employees, all occurrences, org profile, pending checkouts, price adjustments
- Deleting user → CASCADE: sessions, accounts, twoFactors, apikeys, invitations (as inviter)

### Future: Robust Version

Simple hard delete will be replaced with soft delete + grace period. See memory notes.

## Melhorias Futuras

- 2FA obrigatório para admin/super_admin
- Admin poder criar organizações para owners
