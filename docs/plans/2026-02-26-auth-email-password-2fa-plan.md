# Auth Email+Password & 2FA Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Email OTP (passwordless) login with email-and-password authentication and add optional 2FA via email OTP.

**Architecture:** Remove `emailOTP` plugin from Better Auth config, enable `emailAndPassword` with required email verification, add `twoFactor` plugin with email OTP. Update email templates, database schema, and rewrite all auth tests.

**Tech Stack:** Better Auth v1.4.5, Elysia.js, Drizzle ORM, PostgreSQL, Nodemailer, Bun test runner

**Design doc:** `docs/plans/2026-02-26-auth-email-password-2fa-design.md`

---

### Task 1: Add Email Templates for Verification, Password Reset, and 2FA

**Files:**
- Modify: `src/lib/email.ts:25-64` (replace `sendOTPEmail` with new functions)

**Step 1: Replace `sendOTPEmail` with three new email functions**

Remove the existing `sendOTPEmail` function (lines 25-64) and add three new functions in its place:

```ts
type SendVerificationEmailParams = {
  email: string;
  url: string;
};

export async function sendVerificationEmail({
  email,
  url,
}: SendVerificationEmailParams) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Verifique seu email</h2>
      <p style="color: #666;">Clique no botão abaixo para verificar seu endereço de email:</p>
      <p>
        <a href="${url}"
           style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Verificar Email
        </a>
      </p>
      <p style="color: #999; font-size: 12px;">
        Se o botão não funcionar, copie e cole este link: ${url}
      </p>
      <p style="color: #999; font-size: 12px;">
        Se você não criou uma conta, ignore este email.
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "Verifique seu email - Synnerdata",
    html,
  });
}

type SendPasswordResetEmailParams = {
  email: string;
  url: string;
};

export async function sendPasswordResetEmail({
  email,
  url,
}: SendPasswordResetEmailParams) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Redefinir sua senha</h2>
      <p style="color: #666;">Você solicitou a redefinição da sua senha. Clique no botão abaixo:</p>
      <p>
        <a href="${url}"
           style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
          Redefinir Senha
        </a>
      </p>
      <p style="color: #999; font-size: 12px;">
        Se o botão não funcionar, copie e cole este link: ${url}
      </p>
      <p style="color: #999; font-size: 12px;">
        Este link expira em 1 hora. Se você não solicitou a redefinição, ignore este email.
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "Redefinir sua senha - Synnerdata",
    html,
  });
}

type SendTwoFactorOTPEmailParams = {
  email: string;
  otp: string;
};

export async function sendTwoFactorOTPEmail({
  email,
  otp,
}: SendTwoFactorOTPEmailParams) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Código de verificação</h2>
      <p style="color: #666;">Use o código abaixo para completar seu login:</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">
          ${otp}
        </span>
      </div>
      <p style="color: #999; font-size: 12px;">
        Este código expira em 5 minutos. Se você não solicitou este código, ignore este email.
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "Código de verificação - Synnerdata",
    html,
  });
}
```

**Step 2: Run lint check**

Run: `npx ultracite check`
Expected: No errors related to email.ts

**Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat(auth): replace OTP email with verification, password reset, and 2FA templates"
```

---

### Task 2: Update Auth Configuration (Core Change)

**Files:**
- Modify: `src/lib/auth.ts:1-443` (replace emailOTP with emailAndPassword + twoFactor)

**Step 1: Update imports in `src/lib/auth.ts`**

Replace lines 1-25 (imports section):

Old imports:
```ts
import {
  admin,
  apiKey,
  emailOTP,
  openAPI,
  organization,
} from "better-auth/plugins";
```

New imports:
```ts
import {
  admin,
  apiKey,
  openAPI,
  organization,
  twoFactor,
} from "better-auth/plugins";
```

Old email imports:
```ts
import {
  sendOrganizationInvitationEmail,
  sendOTPEmail,
  sendWelcomeEmail,
} from "./email";
```

New email imports:
```ts
import {
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendTwoFactorOTPEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "./email";
```

**Step 2: Add `emailAndPassword` and `emailVerification` config**

After the `trustedOrigins` line (line 199), add `emailAndPassword` and `emailVerification` blocks inside the `betterAuth()` call:

```ts
export const auth = betterAuth({
  basePath: "/api/auth",
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: fullSchema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    async sendResetPassword({ user, url }) {
      await sendPasswordResetEmail({ email: user.email, url });
    },
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    async sendVerificationEmail({ user, url }) {
      await sendVerificationEmail({ email: user.email, url });
    },
    sendOnSignUp: true,
  },
  // ... rest of config unchanged
```

**Step 3: Replace `emailOTP` plugin with `twoFactor` plugin**

Remove lines 416-423 (the emailOTP plugin):

```ts
// REMOVE THIS:
emailOTP({
  otpLength: 6,
  expiresIn: 300,
  disableSignUp: false,
  async sendVerificationOTP({ email, otp, type }) {
    await sendOTPEmail({ email, otp, type });
  },
}),
```

Add `twoFactor` plugin in its place:

```ts
twoFactor({
  otpOptions: {
    async sendOTP({ user, otp }) {
      await sendTwoFactorOTPEmail({ email: user.email, otp });
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
}),
```

**Step 4: Update rate limit rules**

Remove the `/email-otp/*` rule from `customRules` (line 230):

```ts
// REMOVE THIS LINE:
"/email-otp/*": { window: 60, max: 5 },
```

The remaining rules already cover the new endpoints:
- `/sign-in/*` → covers `POST /sign-in/email`
- `/sign-up/*` → covers `POST /sign-up/email`
- `/two-factor/*` → covers all 2FA endpoints
- `/forgot-password/*` → covers password reset

**Step 5: Rename `emailVerification` param to avoid conflict**

Note: The Better Auth config option `emailVerification` uses `sendVerificationEmail` as a method name. Our local import `sendVerificationEmail` from `./email` has the same name. To avoid the naming collision, rename the import:

In the email imports:
```ts
import {
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendTwoFactorOTPEmail,
  sendVerificationEmail as sendVerificationEmailFn,
  sendWelcomeEmail,
} from "./email";
```

Then in the config:
```ts
emailVerification: {
  async sendVerificationEmail({ user, url }) {
    await sendVerificationEmailFn({ email: user.email, url });
  },
  sendOnSignUp: true,
},
```

**Step 6: Run type check**

Run: `bunx tsc --noEmit`
Expected: No type errors

**Step 7: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): replace emailOTP with emailAndPassword and twoFactor plugins"
```

---

### Task 3: Generate and Apply Database Schema Changes

**Files:**
- Modify: `src/db/schema/auth.ts` (add `twoFactors` table after CLI generation)
- Modify: `src/db/schema/index.ts` (export new table and relations)

**Step 1: Run Better Auth CLI to generate schema**

Run: `npx @better-auth/cli generate --output src/db/schema/auth-generated.ts`

This will generate the schema diff needed for the `twoFactor` plugin. Review the generated file to identify the new `twoFactors` table definition.

**Step 2: Add `twoFactors` table to `src/db/schema/auth.ts`**

After the `verifications` table (line 101), add:

```ts
export const twoFactors = pgTable(
  "two_factors",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("twoFactors_userId_idx").on(table.userId)]
);
```

**Important:** The exact column names may differ from what Better Auth CLI generates. Compare with the generated file and use the exact column names from the CLI output. The table above is an approximation based on the `twoFactor` plugin docs.

**Step 3: Add relations for `twoFactors`**

```ts
export const twoFactorRelations = relations(twoFactors, ({ one }) => ({
  user: one(users, {
    fields: [twoFactors.userId],
    references: [users.id],
  }),
}));
```

Update `userRelations` to include `twoFactors`:

```ts
export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  members: many(members),
  invitations: many(invitations),
  subscriptions: many(subscriptions),
  twoFactors: many(twoFactors),
}));
```

**Step 4: Export from `src/db/schema/index.ts`**

Add to the imports from `./auth`:
```ts
twoFactorRelations,
twoFactors,
```

Add to `schema` object:
```ts
twoFactors,
```

Add to `fullSchema` object:
```ts
twoFactorRelations,
```

**Step 5: Run Drizzle migration**

Run: `bunx drizzle-kit generate`
Run: `bunx drizzle-kit migrate`

Expected: New migration file with `CREATE TABLE two_factors`

**Step 6: Delete the generated CLI file**

Run: `rm src/db/schema/auth-generated.ts` (if it was created in step 1)

**Step 7: Run type check**

Run: `bunx tsc --noEmit`
Expected: No type errors

**Step 8: Commit**

```bash
git add src/db/schema/auth.ts src/db/schema/index.ts drizzle/
git commit -m "feat(auth): add twoFactors table and run database migration"
```

---

### Task 4: Update Test Helpers

**Files:**
- Modify: `src/test/support/mailhog.ts` (add `waitForVerificationEmail`, `waitForPasswordResetEmail`)
- Modify: `src/test/support/auth.ts` (no changes needed, it only handles cookies)

**Step 1: Add `waitForVerificationEmail` to `src/test/support/mailhog.ts`**

After the existing `waitForOTP` function, add:

```ts
// ============================================================
// VERIFICATION EMAIL
// ============================================================

export type VerificationEmailData = {
  subject: string;
  verificationUrl: string;
  body: string;
};

const VERIFICATION_SUBJECT_PATTERN = "Verifique seu email";
const VERIFICATION_URL_REGEX = /href=["']([^"']*verify-email[^"']*)["']/i;
// Fallback: match any URL in the verification button
const VERIFICATION_URL_FALLBACK_REGEX =
  /href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?Verificar Email/i;

function isVerificationEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return subject.includes(VERIFICATION_SUBJECT_PATTERN);
}

function extractVerificationUrl(htmlBody: string): string | null {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");
  const match =
    decodedBody.match(VERIFICATION_URL_REGEX) ??
    decodedBody.match(VERIFICATION_URL_FALLBACK_REGEX);
  return match?.[1] ?? null;
}

async function tryGetVerificationEmail(
  email: string
): Promise<VerificationEmailData | null> {
  const messages = await searchEmailsByRecipient(email);
  const verificationEmail = messages.find(isVerificationEmail);

  if (!verificationEmail) {
    return null;
  }

  const subject = verificationEmail.Content.Headers.Subject?.[0] ?? "";
  const body = verificationEmail.Content.Body;
  const verificationUrl = extractVerificationUrl(body);

  if (!verificationUrl) {
    throw new Error(
      `Found verification email for ${email} but could not extract URL from body.`
    );
  }

  return { subject, verificationUrl, body };
}

export async function waitForVerificationEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<VerificationEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetVerificationEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No verification email found for ${email} after ${maxRetries} attempts.`
        );
      }

      await delay(delayMs);
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throwMailHogUnavailableError();
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      await delay(delayMs);
    }
  }

  throw new Error(
    `Verification email not found for ${email} after ${maxRetries} retries`
  );
}

// ============================================================
// PASSWORD RESET EMAIL
// ============================================================

export type PasswordResetEmailData = {
  subject: string;
  resetUrl: string;
  body: string;
};

const RESET_SUBJECT_PATTERN = "Redefinir sua senha";
const RESET_URL_REGEX = /href=["']([^"']*reset-password[^"']*)["']/i;
const RESET_URL_FALLBACK_REGEX =
  /href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?Redefinir Senha/i;

function isPasswordResetEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return subject.includes(RESET_SUBJECT_PATTERN);
}

function extractResetUrl(htmlBody: string): string | null {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");
  const match =
    decodedBody.match(RESET_URL_REGEX) ??
    decodedBody.match(RESET_URL_FALLBACK_REGEX);
  return match?.[1] ?? null;
}

async function tryGetPasswordResetEmail(
  email: string
): Promise<PasswordResetEmailData | null> {
  const messages = await searchEmailsByRecipient(email);
  const resetEmail = messages.find(isPasswordResetEmail);

  if (!resetEmail) {
    return null;
  }

  const subject = resetEmail.Content.Headers.Subject?.[0] ?? "";
  const body = resetEmail.Content.Body;
  const resetUrl = extractResetUrl(body);

  if (!resetUrl) {
    throw new Error(
      `Found password reset email for ${email} but could not extract URL from body.`
    );
  }

  return { subject, resetUrl, body };
}

export async function waitForPasswordResetEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<PasswordResetEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetPasswordResetEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No password reset email found for ${email} after ${maxRetries} attempts.`
        );
      }

      await delay(delayMs);
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throwMailHogUnavailableError();
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      await delay(delayMs);
    }
  }

  throw new Error(
    `Password reset email not found for ${email} after ${maxRetries} retries`
  );
}
```

**Step 2: Add `clearMailbox` utility**

Add a utility to clear emails for a specific recipient (useful between test runs):

```ts
export async function clearMailbox(email: string): Promise<void> {
  const messages = await searchEmailsByRecipient(email);
  for (const message of messages) {
    await fetch(`${MAILHOG_API_URL}/api/v1/messages/${message.ID}`, {
      method: "DELETE",
    });
  }
}
```

**Step 3: Run lint check**

Run: `npx ultracite check`
Expected: No errors

**Step 4: Commit**

```bash
git add src/test/support/mailhog.ts
git commit -m "feat(test): add verification and password reset email helpers"
```

---

### Task 5: Rewrite Signup Flow Test

**Files:**
- Modify: `src/modules/auth/signup-flow.test.ts` (complete rewrite)

**Step 1: Write the new signup flow test**

Replace the entire file content. The new flow is:
1. Sign up with email + password → receives verification email
2. Verify email via token/URL
3. Sign in with email + password → gets session
4. Continue with organization creation + trial (same as before)

```ts
import { beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import {
  clearMailbox,
  waitForVerificationEmail,
} from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "TestPassword123!";

describe("Signup Use Case: Novo Usuário até Trial Ativo", () => {
  let app: TestApp;
  let testEmail: string;
  let sessionCookies: string;
  let userId: string;
  let organizationId: string;

  let emailModule: typeof import("@/lib/email");
  let sendWelcomeEmailSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    app = createTestApp();
    testEmail = `test-${crypto.randomUUID()}@example.com`;
    emailModule = await import("@/lib/email");

    await PlanFactory.createTrial();
  });

  beforeEach(() => {
    sendWelcomeEmailSpy = spyOn(
      emailModule,
      "sendWelcomeEmail"
    ).mockResolvedValue(undefined);
  });

  describe("Fase 1: Autenticação com Email e Senha", () => {
    test("should sign up with email and password", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
            name: "Test User",
          }),
        })
      );

      expect(response.status).toBe(200);
    });

    test("should send verification email on sign up", async () => {
      const emailData = await waitForVerificationEmail(testEmail);
      expect(emailData.subject).toContain("Verifique seu email");
      expect(emailData.verificationUrl).toBeTruthy();
    });

    test("should reject sign-in before email verification", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      // Better Auth returns error when email not verified
      expect(response.status).not.toBe(200);
    });

    test("should verify email via verification URL", async () => {
      const { verificationUrl } = await waitForVerificationEmail(testEmail);

      // Better Auth verification URLs are GET requests
      const response = await app.handle(
        new Request(verificationUrl, { method: "GET", redirect: "manual" })
      );

      // Verification endpoint typically redirects or returns 200
      expect([200, 302]).toContain(response.status);
    });

    test("should sign in with verified email and password", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(response.status).toBe(200);

      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeTruthy();
      sessionCookies = setCookieHeader ?? "";
    });

    test("should create new user with correct data", async () => {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, testEmail))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.name).toBe("Test User");
      expect(user.emailVerified).toBe(true);
      userId = user.id;
    });

    test("should return session cookies", () => {
      expect(sessionCookies).toContain("better-auth.session_token");
    });

    test("should send welcome email on sign up", () => {
      expect(sendWelcomeEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendWelcomeEmailSpy).toHaveBeenCalledWith({
        to: testEmail,
        userName: "Test User",
      });
    });

    test("should reject sign up with short password", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `short-pass-${crypto.randomUUID()}@example.com`,
            password: "short",
            name: "Short Pass User",
          }),
        })
      );

      expect(response.status).not.toBe(200);
    });

    test("should reject sign up with duplicate email", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
            name: "Duplicate User",
          }),
        })
      );

      expect(response.status).not.toBe(200);
    });

    test("should reject sign in with wrong password", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: "WrongPassword123!",
          }),
        })
      );

      expect(response.status).not.toBe(200);
    });

    test("should not fail user creation if welcome email fails", async () => {
      const failEmail = `fail-email-${crypto.randomUUID()}@example.com`;

      sendWelcomeEmailSpy.mockRejectedValueOnce(new Error("SMTP error"));

      const signUpResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: failEmail,
            password: TEST_PASSWORD,
            name: "Fail Email User",
          }),
        })
      );

      expect(signUpResponse.status).toBe(200);

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, failEmail))
        .limit(1);

      expect(user).toBeDefined();

      // Cleanup
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));
      await db.delete(schema.users).where(eq(schema.users.id, user.id));
    });
  });

  describe("Fase 2: Onboarding", () => {
    test("should create organization", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({
            name: "Test Organization",
            slug: `test-org-${crypto.randomUUID().slice(0, 8)}`,
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.id).toBeDefined();
      organizationId = body.id;
    });

    test("should add user as owner", async () => {
      const [member] = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.organizationId, organizationId))
        .limit(1);

      expect(member).toBeDefined();
      expect(member.userId).toBe(userId);
      expect(member.role).toBe("owner");
    });

    test("should set activeOrganizationId in session", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/get-session`, {
          method: "GET",
          headers: {
            Cookie: sessionCookies,
          },
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.session.activeOrganizationId).toBe(organizationId);
    });
  });

  describe("Fase 3: Trial Subscription", () => {
    test("should create trial subscription on org creation", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription).toBeDefined();
    });

    test("should have 14 days trial period", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.trialStart).toBeDefined();
      expect(subscription.trialEnd).toBeDefined();

      if (!(subscription.trialStart && subscription.trialEnd)) {
        throw new Error("Trial dates not set");
      }

      const trialStart = new Date(subscription.trialStart);
      const trialEnd = new Date(subscription.trialEnd);
      const daysDiff = Math.round(
        (trialEnd.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBe(14);
    });

    test("should have status active", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("active");
    });

    test("should set trialUsed flag to true", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.trialUsed).toBe(true);
    });
  });

  describe("Fase 4: Validação Final", () => {
    test("should list user as member of organization", async () => {
      const response = await app.handle(
        new Request(
          `${BASE_URL}/api/auth/organization/list-members?organizationId=${organizationId}`,
          {
            method: "GET",
            headers: {
              Cookie: sessionCookies,
            },
          }
        )
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.members).toBeArray();
      expect(body.members.length).toBeGreaterThan(0);

      const userMember = body.members.find(
        (m: { userId: string }) => m.userId === userId
      );
      expect(userMember).toBeDefined();
    });

    test("should return correct session data", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/get-session`, {
          method: "GET",
          headers: {
            Cookie: sessionCookies,
          },
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.user.id).toBe(userId);
      expect(body.user.email).toBe(testEmail);
      expect(body.session.activeOrganizationId).toBe(organizationId);
    });

    test("should allow re-login with email and password", async () => {
      sendWelcomeEmailSpy.mockClear();

      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(signInResponse.status).toBe(200);

      const body = await signInResponse.json();
      expect(body.user.id).toBe(userId);
    });

    test("should NOT send welcome email on re-login", () => {
      expect(sendWelcomeEmailSpy).toHaveBeenCalledTimes(0);
    });
  });
});
```

**Step 2: Run the test**

Run: `bun test src/modules/auth/signup-flow.test.ts`
Expected: All tests pass (adjust assertions if Better Auth response format differs)

**Step 3: Commit**

```bash
git add src/modules/auth/signup-flow.test.ts
git commit -m "test(auth): rewrite signup flow test for email+password authentication"
```

---

### Task 6: Rewrite Admin Signup Test

**Files:**
- Modify: `src/modules/auth/admin-signup-use-case.test.ts` (replace OTP with email+password)

**Step 1: Rewrite the test**

The core logic is the same (admin role auto-assignment) but the auth flow changes from OTP to email+password. Key changes:

1. Replace `POST /api/auth/email-otp/send-verification-otp` → `POST /api/auth/sign-up/email`
2. Replace `POST /api/auth/sign-in/email-otp` → `POST /api/auth/sign-in/email`
3. Remove `waitForOTP`, use `waitForVerificationEmail` for email verification step
4. Admin emails have `emailVerified: true` set in the database hook, so they may skip verification

**Helper function** to add at the top of the test file (used by all three describe blocks):

```ts
async function signUpAndVerify(
  app: TestApp,
  email: string,
  password: string,
  name: string
): Promise<string> {
  // Sign up
  await app.handle(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    })
  );

  // Admin emails get emailVerified=true via database hook,
  // so they can sign in directly. For regular users, verify email first.
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user.emailVerified) {
    const { verificationUrl } = await waitForVerificationEmail(email);
    await app.handle(
      new Request(verificationUrl, { method: "GET", redirect: "manual" })
    );
  }

  // Sign in
  const signInResponse = await app.handle(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );

  return signInResponse.headers.get("set-cookie") ?? "";
}
```

Replace all OTP-based sign-in patterns with calls to `signUpAndVerify()`.

Update the `afterAll` cleanup to remove `verifications` cleanup for OTP identifiers (they no longer use `sign-in-otp-*` identifiers).

**Step 2: Run the test**

Run: `bun test src/modules/auth/admin-signup-use-case.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/modules/auth/admin-signup-use-case.test.ts
git commit -m "test(auth): rewrite admin signup test for email+password authentication"
```

---

### Task 7: Rewrite Trial Expired Test

**Files:**
- Modify: `src/modules/auth/trial-expired-use-case.test.ts` (replace OTP with email+password)

**Step 1: Update the setup phase**

Replace the OTP sign-in flow in "Setup: Criar usuário com trial ativo" with email+password:

```ts
test("should create user via email+password sign-up", async () => {
  // Sign up
  const signUpResponse = await app.handle(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "TestPassword123!",
        name: "Trial User",
      }),
    })
  );
  expect(signUpResponse.status).toBe(200);

  // Verify email
  const { verificationUrl } = await waitForVerificationEmail(testEmail);
  await app.handle(
    new Request(verificationUrl, { method: "GET", redirect: "manual" })
  );

  // Sign in
  const signInResponse = await app.handle(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "TestPassword123!",
      }),
    })
  );

  expect(signInResponse.status).toBe(200);
  sessionCookies = signInResponse.headers.get("set-cookie") ?? "";
});
```

Update imports: replace `waitForOTP` with `waitForVerificationEmail`.

Update `afterAll` cleanup: remove OTP verification identifier cleanup.

**Step 2: Run the test**

Run: `bun test src/modules/auth/trial-expired-use-case.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/modules/auth/trial-expired-use-case.test.ts
git commit -m "test(auth): rewrite trial expired test for email+password authentication"
```

---

### Task 8: Add Password Reset Flow Test

**Files:**
- Create: `src/modules/auth/password-reset-flow.test.ts`

**Step 1: Write the password reset test**

```ts
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";
import {
  waitForPasswordResetEmail,
  waitForVerificationEmail,
} from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const ORIGINAL_PASSWORD = "OriginalPassword123!";
const NEW_PASSWORD = "NewPassword456!";

describe("Password Reset Flow", () => {
  let app: TestApp;
  let testEmail: string;

  beforeAll(async () => {
    app = createTestApp();
    testEmail = `reset-${crypto.randomUUID()}@example.com`;

    // Create and verify user
    await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: ORIGINAL_PASSWORD,
          name: "Reset Test User",
        }),
      })
    );

    const { verificationUrl } = await waitForVerificationEmail(testEmail);
    await app.handle(
      new Request(verificationUrl, { method: "GET", redirect: "manual" })
    );
  });

  test("should request password reset", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/forget-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          redirectTo: `${env.APP_URL}/reset-password`,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should send password reset email", async () => {
    const emailData = await waitForPasswordResetEmail(testEmail);
    expect(emailData.subject).toContain("Redefinir sua senha");
    expect(emailData.resetUrl).toBeTruthy();
  });

  test("should reset password with valid token", async () => {
    const { resetUrl } = await waitForPasswordResetEmail(testEmail);

    // Extract token from URL
    const url = new URL(resetUrl);
    const token = url.searchParams.get("token");
    expect(token).toBeTruthy();

    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: NEW_PASSWORD,
          token,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should reject old password after reset", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: ORIGINAL_PASSWORD,
        }),
      })
    );

    expect(response.status).not.toBe(200);
  });

  test("should sign in with new password", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: NEW_PASSWORD,
        }),
      })
    );

    expect(response.status).toBe(200);

    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).toContain("better-auth.session_token");
  });

  test("should return consistent message for non-existent email", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/forget-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@example.com",
          redirectTo: `${env.APP_URL}/reset-password`,
        }),
      })
    );

    // Should still return 200 to prevent email enumeration
    expect(response.status).toBe(200);
  });
});
```

**Step 2: Run the test**

Run: `bun test src/modules/auth/password-reset-flow.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/modules/auth/password-reset-flow.test.ts
git commit -m "test(auth): add password reset flow integration test"
```

---

### Task 9: Add Two-Factor Authentication Flow Test

**Files:**
- Create: `src/modules/auth/two-factor-flow.test.ts`

**Step 1: Write the 2FA test**

```ts
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";
import {
  waitForOTP,
  waitForVerificationEmail,
} from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "TwoFactor123!";

describe("Two-Factor Authentication Flow", () => {
  let app: TestApp;
  let testEmail: string;
  let sessionCookies: string;
  let backupCodes: string[];

  beforeAll(async () => {
    app = createTestApp();
    testEmail = `2fa-${crypto.randomUUID()}@example.com`;

    // Create, verify, and sign in user
    await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: TEST_PASSWORD,
          name: "2FA Test User",
        }),
      })
    );

    const { verificationUrl } = await waitForVerificationEmail(testEmail);
    await app.handle(
      new Request(verificationUrl, { method: "GET", redirect: "manual" })
    );

    const signInResponse = await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: TEST_PASSWORD,
        }),
      })
    );

    sessionCookies = signInResponse.headers.get("set-cookie") ?? "";
  });

  describe("Enable 2FA", () => {
    test("should enable 2FA with password", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/enable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.backupCodes).toBeDefined();
      expect(body.backupCodes).toBeArray();
      expect(body.backupCodes.length).toBe(10);
      backupCodes = body.backupCodes;
    });
  });

  describe("Sign in with 2FA", () => {
    test("should require 2FA on sign in", async () => {
      // Sign out first
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: { Cookie: sessionCookies },
        })
      );

      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(signInResponse.status).toBe(200);

      const body = await signInResponse.json();
      expect(body.twoFactorRedirect).toBe(true);

      // Save the temporary 2FA cookie
      sessionCookies = signInResponse.headers.get("set-cookie") ?? "";
    });

    test("should send OTP email for 2FA", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/send-otp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
        })
      );

      expect(response.status).toBe(200);
    });

    test("should verify OTP and complete sign-in", async () => {
      const otp = await waitForOTP(testEmail);

      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/verify-otp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({ code: otp }),
        })
      );

      expect(response.status).toBe(200);

      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toContain("better-auth.session_token");
      sessionCookies = setCookieHeader ?? "";
    });

    test("should have active session after 2FA", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/get-session`, {
          method: "GET",
          headers: { Cookie: sessionCookies },
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.user.email).toBe(testEmail);
    });
  });

  describe("Backup Codes", () => {
    test("should sign in with backup code", async () => {
      // Sign out
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: { Cookie: sessionCookies },
        })
      );

      // Sign in (triggers 2FA)
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      const tempCookies = signInResponse.headers.get("set-cookie") ?? "";

      // Use backup code
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/verify-backup-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: tempCookies,
          },
          body: JSON.stringify({ code: backupCodes[0] }),
        })
      );

      expect(response.status).toBe(200);

      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toContain("better-auth.session_token");
      sessionCookies = setCookieHeader ?? "";
    });

    test("should reject already-used backup code", async () => {
      // Sign out
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: { Cookie: sessionCookies },
        })
      );

      // Sign in (triggers 2FA)
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      const tempCookies = signInResponse.headers.get("set-cookie") ?? "";

      // Try to reuse the same backup code
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/verify-backup-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: tempCookies,
          },
          body: JSON.stringify({ code: backupCodes[0] }),
        })
      );

      expect(response.status).not.toBe(200);
    });
  });

  describe("Disable 2FA", () => {
    test("should disable 2FA with password", async () => {
      // First complete 2FA sign-in to get a valid session
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      const tempCookies = signInResponse.headers.get("set-cookie") ?? "";

      // Use backup code to complete 2FA
      const verifyResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/verify-backup-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: tempCookies,
          },
          body: JSON.stringify({ code: backupCodes[1] }),
        })
      );

      sessionCookies = verifyResponse.headers.get("set-cookie") ?? "";

      // Disable 2FA
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/disable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(response.status).toBe(200);
    });

    test("should sign in without 2FA after disabling", async () => {
      // Sign out
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: { Cookie: sessionCookies },
        })
      );

      // Sign in should succeed without 2FA
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.twoFactorRedirect).toBeFalsy();
    });
  });
});
```

**Step 2: Run the test**

Run: `bun test src/modules/auth/two-factor-flow.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/modules/auth/two-factor-flow.test.ts
git commit -m "test(auth): add two-factor authentication flow integration test"
```

---

### Task 10: Update All Other Tests That Use OTP Authentication

**Files:**
- Search all test files for `email-otp` or `waitForOTP` patterns used for login

**Step 1: Find all affected test files**

Run: `grep -r "email-otp\|waitForOTP\|sign-in/email-otp\|send-verification-otp" src/ --include="*.test.ts" -l`

Expected: List of test files still using old OTP patterns (besides the ones already updated in Tasks 5-7).

**Step 2: Update each file**

For each file found, apply the same pattern:
1. Replace `POST /api/auth/email-otp/send-verification-otp` → `POST /api/auth/sign-up/email`
2. Replace `POST /api/auth/sign-in/email-otp` → `POST /api/auth/sign-in/email`
3. Replace `waitForOTP` import → `waitForVerificationEmail`
4. Add email verification step between sign-up and sign-in

**Step 3: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "test(auth): update remaining tests to use email+password authentication"
```

---

### Task 11: Run Full Test Suite and Fix Issues

**Step 1: Run all tests**

Run: `bun test`

**Step 2: Fix any failures**

Common issues to watch for:
- Better Auth endpoint paths may differ slightly (check `auth.api.generateOpenAPISchema()`)
- Email verification URL format may need adjustment in test helpers
- `twoFactor` table columns may differ from what was estimated in Task 3
- Cookie handling during 2FA flow may need adjustments

**Step 3: Run lint**

Run: `npx ultracite check`

**Step 4: Fix any lint issues**

Run: `npx ultracite fix`

**Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix(auth): resolve test failures and lint issues from auth migration"
```

---

### Task 12: Final Verification and Cleanup

**Step 1: Verify no references to emailOTP remain**

Run: `grep -r "emailOTP\|email-otp\|sendOTPEmail\|sendVerificationOTP" src/ --include="*.ts" -l`

Expected: No results (or only mailhog.ts which may keep `waitForOTP` for 2FA tests).

**Step 2: Run full test suite one final time**

Run: `bun test`
Expected: All tests pass

**Step 3: Run type check**

Run: `bunx tsc --noEmit`
Expected: No type errors

**Step 4: Run lint**

Run: `npx ultracite check`
Expected: No issues

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore(auth): cleanup remaining emailOTP references"
```

---

## Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/email.ts` | Modify | Replace `sendOTPEmail` with `sendVerificationEmail`, `sendPasswordResetEmail`, `sendTwoFactorOTPEmail` |
| `src/lib/auth.ts` | Modify | Replace `emailOTP` plugin with `emailAndPassword` config + `twoFactor` plugin |
| `src/db/schema/auth.ts` | Modify | Add `twoFactors` table |
| `src/db/schema/index.ts` | Modify | Export new table and relations |
| `src/test/support/mailhog.ts` | Modify | Add `waitForVerificationEmail`, `waitForPasswordResetEmail`, `clearMailbox` |
| `src/modules/auth/signup-flow.test.ts` | Rewrite | Email+password sign-up flow |
| `src/modules/auth/admin-signup-use-case.test.ts` | Rewrite | Admin role assignment with email+password |
| `src/modules/auth/trial-expired-use-case.test.ts` | Rewrite | Trial expiration with email+password |
| `src/modules/auth/password-reset-flow.test.ts` | Create | Password reset integration test |
| `src/modules/auth/two-factor-flow.test.ts` | Create | 2FA enable/disable/verify integration test |
| `drizzle/` | Generated | Database migration for `twoFactors` table |
