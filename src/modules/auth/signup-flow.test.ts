import { beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { clearMailbox, waitForVerificationEmail } from "@/test/support/mailhog";

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
      await db
        .delete(schema.accounts)
        .where(eq(schema.accounts.userId, user.id));
      await db.delete(schema.users).where(eq(schema.users.id, user.id));
      await clearMailbox(failEmail);
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
