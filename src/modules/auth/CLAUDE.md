# Auth Module

Autenticação via Email OTP (passwordless) e lifecycle de usuários/organizações.

## Authentication Flow

- Email OTP: código de 6 dígitos, expira em 5 minutos
- Criação automática de usuário no primeiro sign-in
- Rate limits: 5 tentativas/15min (sign-in), 3/60s (sign-up)
- Implementação real em `src/lib/auth.ts` e `src/lib/auth-plugin.ts` — este módulo contém apenas testes

## User Roles (system-level)

- **super_admin** — email em `SUPER_ADMIN_EMAILS` env var. Sem org membership, sem trial. Bypass total.
- **admin** — email em `ADMIN_EMAILS` env var. Sem org membership, sem trial. Bypass total.
- **user** — qualquer outro email. Auto-owner da primeira org. Trial criado automaticamente.

## Organization & Trial Lifecycle

1. Primeiro sign-in → user criado com `emailVerified: true`
2. Primeira organização → user vira owner, trial de **14 dias** criado via `SubscriptionService.createTrial()`
3. Trial state derivado dinamicamente: `isTrial && trialEnd > now` → "trial"; `trialEnd <= now` → "trial_expired"
4. `hasAccess: false` + `requiresPayment: true` após expiração

## Organization Member Roles

- `owner` | `admin` | `manager` | `editor` | `viewer`
- Validados antes da criação de convite (400 se inválido)

## Session

- `activeOrganizationId` — org ativa do usuário (null para admins)
- Cookie cache: 5 min max age
- Definido automaticamente no primeiro membership

## Auth Plugin (`src/lib/auth-plugin.ts`) — Macro Checks

- `requireAdmin` → exige admin ou super_admin
- `requireSuperAdmin` → exige super_admin
- `requireOrganization` → `activeOrganizationId` deve existir
- `requireActiveSubscription` → valida via `SubscriptionService.checkAccess()`
- `requireFeature` / `requireFeatures` → valida features do plano via `LimitsService`
- `permissions: { resource: ["action"] }` → delegado a `auth.api.hasPermission()`
- `allowAdminBypass` → admins e API keys podem bypassar checks de subscription

## Emails

- **Welcome**: enviado após verificação de email via `afterEmailVerification` (falha silenciosa). Para admins (emailVerified=true no cadastro), enviado imediatamente no `create.after`
- **OTP**: 6 dígitos, 300s expiração
- **Convite**: template com inviter, org name, link (`{APP_URL}/convite/{invitationId}`), role
