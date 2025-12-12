import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  members,
  orgSubscriptions,
  subscriptionPlans,
  users,
} from "@/db/schema";
import { env } from "@/env";
import { starterPlan } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { waitForOTP } from "@/test/helpers/otp";

const BASE_URL = env.API_URL;

describe("Signup Use Case: Novo Usuário até Trial Ativo", () => {
  let app: TestApp;
  let testEmail: string;
  let sessionCookies: string;
  let userId: string;
  let organizationId: string;

  beforeAll(async () => {
    app = createTestApp();
    testEmail = `test-${crypto.randomUUID()}@example.com`;

    if (starterPlan) {
      await db
        .insert(subscriptionPlans)
        .values(starterPlan)
        .onConflictDoNothing();
    }
  });

  describe("Fase 1: Autenticação Passwordless", () => {
    test("should send OTP to new email", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/auth/api/email-otp/send-verification-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            type: "sign-in",
          }),
        })
      );

      expect(response.status).toBe(200);
    });

    test("should reject invalid OTP", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/auth/api/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            otp: "000000",
          }),
        })
      );

      expect(response.status).toBe(400);
    });

    test("should sign in with valid OTP", async () => {
      const otp = await waitForOTP(testEmail);

      const response = await app.handle(
        new Request(`${BASE_URL}/auth/api/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            otp,
          }),
        })
      );

      expect(response.status).toBe(200);

      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeTruthy();
      sessionCookies = setCookieHeader ?? "";
    });

    test("should create new user automatically", async () => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, testEmail))
        .limit(1);

      expect(user).toBeDefined();
      userId = user.id;
    });

    test("should set emailVerified to true", async () => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      expect(user.emailVerified).toBe(true);
    });

    test("should return session cookies", () => {
      expect(sessionCookies).toContain("better-auth.session_token");
    });
  });

  describe("Fase 2: Onboarding", () => {
    test("should allow updating user name", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/auth/api/update-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({
            name: "Test User",
          }),
        })
      );

      expect(response.status).toBe(200);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      expect(user.name).toBe("Test User");
    });

    test("should create organization", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/auth/api/organization/create`, {
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
        .from(members)
        .where(eq(members.organizationId, organizationId))
        .limit(1);

      expect(member).toBeDefined();
      expect(member.userId).toBe(userId);
      expect(member.role).toBe("owner");
    });

    test("should set activeOrganizationId in session", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/auth/api/get-session`, {
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
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription).toBeDefined();
    });

    test("should have 14 days trial period", async () => {
      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
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

    test("should have status trial", async () => {
      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("trial");
    });

    test("should set trialUsed flag to true", async () => {
      const [subscription] = await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.trialUsed).toBe(true);
    });
  });

  describe("Fase 4: Validação Final", () => {
    test("should list user as member of organization", async () => {
      const response = await app.handle(
        new Request(
          `${BASE_URL}/auth/api/organization/list-members?organizationId=${organizationId}`,
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
        new Request(`${BASE_URL}/auth/api/get-session`, {
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

    test("should allow re-login with same email", async () => {
      // Send new OTP
      const sendResponse = await app.handle(
        new Request(`${BASE_URL}/auth/api/email-otp/send-verification-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            type: "sign-in",
          }),
        })
      );
      expect(sendResponse.status).toBe(200);

      // Get OTP and sign in
      const otp = await waitForOTP(testEmail);
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/auth/api/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            otp,
          }),
        })
      );

      expect(signInResponse.status).toBe(200);

      const body = await signInResponse.json();
      expect(body.user.id).toBe(userId);
    });
  });
});
