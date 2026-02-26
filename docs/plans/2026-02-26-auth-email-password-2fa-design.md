# Auth Refactoring: Email+Password & Two-Factor Authentication

**Date:** 2026-02-26
**Status:** Approved
**Approach:** Big-Bang Migration

## Context

The current authentication system uses **Email OTP** (passwordless) as the sole login method via Better Auth's `emailOTP` plugin. This design replaces it with **email-and-password** authentication as the primary method and adds **two-factor authentication (2FA)** via email OTP as an optional security layer.

### Current State

- **Framework:** Elysia.js (Bun)
- **Auth library:** Better Auth v1.4.5
- **Database:** Drizzle ORM + PostgreSQL
- **Login method:** Email OTP only (passwordless)
- **Active plugins:** OpenAPI, Admin, Organization, Email OTP, API Key
- **Frontend:** In development (no production users)

### Target State

- **Primary login:** Email + Password
- **Email verification:** Required before login
- **Password reset:** Email-based flow with secure tokens
- **2FA:** Optional per user, email OTP as second factor
- **Backup codes:** Encrypted, for 2FA account recovery

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Email OTP fate | Becomes 2FA only | Reuses existing email infra; OTP no longer a login method |
| 2FA methods | Email OTP + Backup codes | Simplicity; reuses Nodemailer infrastructure |
| TOTP (authenticator apps) | Not included | Not needed for current scope |
| Email verification | Required (`requireEmailVerification: true`) | Prevents fake accounts |
| 2FA policy | Optional (user choice) | Reduces onboarding friction |
| Migration approach | Big-bang | No production users; clean codebase preferred |
| Password hashing | scrypt (Better Auth default) | OWASP recommended, no external deps |

## Architecture

### Auth Configuration (`src/lib/auth.ts`)

**Remove:**
- `emailOTP` plugin import and configuration

**Add:**
```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  minPasswordLength: 8,
  maxPasswordLength: 128,
  sendResetPassword: async ({ user, url, token }, request) => {
    await sendPasswordResetEmail(user.email, url)
  },
  revokeSessionsOnPasswordReset: true,
},
emailVerification: {
  sendVerificationEmail: async ({ user, url, token }, request) => {
    await sendVerificationEmail(user.email, url)
  },
  sendOnSignUp: true,
},
```

**Add plugin:**
```ts
twoFactor({
  otpOptions: {
    sendOTP: async ({ user, otp }) => {
      await sendTwoFactorOTPEmail(user.email, otp)
    },
    period: 5,
    digits: 6,
    allowedAttempts: 5,
    storeOTP: "encrypted",
  },
  backupCodeOptions: {
    amount: 10,
    length: 10,
    storeBackupCodes: "encrypted",
  },
})
```

**Rate limit changes:**
- Remove: `/email-otp/*` rule
- Keep: `/sign-in/*` (5 per 15min), `/sign-up/*` (3 per 1min), `/two-factor/*` (3 per 1min), `/forgot-password/*` (3 per 5min)

### Email Templates (`src/lib/email.ts`)

**New templates:**
1. `sendVerificationEmail(email, url)` - Email verification link after sign-up
2. `sendPasswordResetEmail(email, url)` - Password reset link
3. `sendTwoFactorOTPEmail(email, otp)` - 2FA verification code

**Remove:**
- `sendOTPEmail` (login OTP) - no longer used as login method

**Unchanged:**
- Welcome email, organization invitation, payment emails

### Database Schema (`src/db/schema/auth.ts`)

Migration is additive. Run `npx @better-auth/cli generate` after config changes.

**New table `twoFactors`:**
- `id` - Primary key
- `userId` - FK to users
- `secret` - Encrypted (required by plugin even for OTP-only)
- `backupCodes` - Encrypted backup codes
- `enabled` - Boolean

**Existing tables (no structural changes):**
- `accounts` - `password` field already exists, now stores scrypt hash
- `users` - `emailVerified` field already exists, now enforced
- `verifications` - Reused for email verification and password reset tokens

### Auth Plugin (`src/lib/auth-plugin.ts`)

No changes needed to the Elysia auth macro. The session structure remains the same.

### Permissions (`src/lib/permissions.ts`)

No changes. Role assignment hooks remain the same.

## Testing Strategy

### Tests to Rewrite

| Test File | Change |
|-----------|--------|
| `src/modules/auth/signup-flow.test.ts` | Sign-up with email+password, email verification, then login |
| `src/modules/auth/admin-signup-use-case.test.ts` | Sign-up with email+password, verify admin role auto-assignment |
| `src/modules/auth/trial-expired-use-case.test.ts` | Login with email+password instead of OTP |

### Test Helpers to Update

| Helper | Change |
|--------|--------|
| `src/test/support/auth.ts` | `createAuthHeaders()` uses email+password sign-up/sign-in |
| `src/test/support/mailhog.ts` | Add `waitForVerificationEmail()`, `waitForPasswordResetEmail()`; adapt `waitForOTP()` for 2FA context |

### New Tests to Create

1. **Complete sign-up flow** - email+password -> verify email -> login
2. **Password reset flow** - request reset -> email -> reset password -> login with new password
3. **2FA activation flow** - enable 2FA -> login -> receive OTP email -> verify -> access
4. **Backup codes flow** - enable 2FA -> login -> use backup code -> access
5. **2FA disable flow** - disable 2FA with password -> login without 2FA

### Approach

TDD: Write/adapt tests first, then implement changes.

## API Changes

### Removed Endpoints (via emailOTP removal)
- `POST /api/auth/email-otp/send-verification-otp`
- `POST /api/auth/sign-in/email-otp`

### New Endpoints (via emailAndPassword + twoFactor)
- `POST /api/auth/sign-up/email` - Sign up with email+password
- `POST /api/auth/sign-in/email` - Sign in with email+password
- `POST /api/auth/forget-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/verify-email` - Verify email with token
- `POST /api/auth/two-factor/enable` - Enable 2FA (requires password)
- `POST /api/auth/two-factor/disable` - Disable 2FA (requires password)
- `POST /api/auth/two-factor/send-otp` - Send 2FA OTP email
- `POST /api/auth/two-factor/verify-otp` - Verify 2FA OTP
- `POST /api/auth/two-factor/verify-backup-code` - Verify backup code
- `POST /api/auth/two-factor/generate-backup-codes` - Regenerate backup codes

### Unchanged Endpoints
- All organization endpoints
- All API key endpoints
- `GET /api/auth/get-session`
- `POST /api/auth/sign-out`
- `POST /api/auth/update-user`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing test data with OTP-only accounts | Clean migration; tests reset DB between runs |
| Frontend needs to adapt sign-in/sign-up UI | Frontend in dev; coordinate with frontend team |
| Email delivery for verification/reset | Already have working Nodemailer + MailHog for dev |
| Password storage security | scrypt (Better Auth default) is OWASP recommended |
