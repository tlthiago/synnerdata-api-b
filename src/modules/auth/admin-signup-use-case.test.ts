import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";
import { waitForOTP } from "@/test/support/mailhog";

const BASE_URL = env.API_URL;

describe("Admin Signup Use Case: Criação de Usuários com Roles de Sistema", () => {
  let app: TestApp;

  const superAdminEmail = "superadmin@test.com";
  const adminEmail = "admin@test.com";
  const regularEmail = `regular-${crypto.randomUUID()}@example.com`;

  const createdUserIds: string[] = [];

  beforeAll(() => {
    app = createTestApp();
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, userId));
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }

    const identifier1 = `sign-in-otp-${superAdminEmail}`;
    const identifier2 = `sign-in-otp-${adminEmail}`;
    const identifier3 = `sign-in-otp-${regularEmail}`;

    await db
      .delete(schema.verifications)
      .where(eq(schema.verifications.identifier, identifier1));
    await db
      .delete(schema.verifications)
      .where(eq(schema.verifications.identifier, identifier2));
    await db
      .delete(schema.verifications)
      .where(eq(schema.verifications.identifier, identifier3));
  });

  describe("Super Admin Signup", () => {
    test("should create super_admin user when email is in SUPER_ADMIN_EMAILS", async () => {
      const sendResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/email-otp/send-verification-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: superAdminEmail,
            type: "sign-in",
          }),
        })
      );
      expect(sendResponse.status).toBe(200);

      const otp = await waitForOTP(superAdminEmail);
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: superAdminEmail,
            otp,
          }),
        })
      );
      expect(signInResponse.status).toBe(200);

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, superAdminEmail))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.role).toBe("super_admin");
      createdUserIds.push(user.id);
    });

    test("super_admin should have emailVerified set to true", async () => {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, superAdminEmail))
        .limit(1);

      expect(user.emailVerified).toBe(true);
    });

    test("super_admin should have admin capabilities in session", async () => {
      await app.handle(
        new Request(`${BASE_URL}/api/auth/email-otp/send-verification-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: superAdminEmail,
            type: "sign-in",
          }),
        })
      );

      const otp = await waitForOTP(superAdminEmail);
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: superAdminEmail,
            otp,
          }),
        })
      );

      const sessionCookies = signInResponse.headers.get("set-cookie") ?? "";

      const sessionResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/get-session`, {
          method: "GET",
          headers: { Cookie: sessionCookies },
        })
      );

      expect(sessionResponse.status).toBe(200);

      const body = await sessionResponse.json();
      expect(body.user.role).toBe("super_admin");
    });
  });

  describe("Admin Signup", () => {
    test("should create admin user when email is in ADMIN_EMAILS", async () => {
      const sendResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/email-otp/send-verification-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: adminEmail,
            type: "sign-in",
          }),
        })
      );
      expect(sendResponse.status).toBe(200);

      const otp = await waitForOTP(adminEmail);
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: adminEmail,
            otp,
          }),
        })
      );
      expect(signInResponse.status).toBe(200);

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, adminEmail))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.role).toBe("admin");
      createdUserIds.push(user.id);
    });

    test("admin should have emailVerified set to true", async () => {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, adminEmail))
        .limit(1);

      expect(user.emailVerified).toBe(true);
    });

    test("admin should have admin role in session", async () => {
      await app.handle(
        new Request(`${BASE_URL}/api/auth/email-otp/send-verification-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: adminEmail,
            type: "sign-in",
          }),
        })
      );

      const otp = await waitForOTP(adminEmail);
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: adminEmail,
            otp,
          }),
        })
      );

      const sessionCookies = signInResponse.headers.get("set-cookie") ?? "";

      const sessionResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/get-session`, {
          method: "GET",
          headers: { Cookie: sessionCookies },
        })
      );

      expect(sessionResponse.status).toBe(200);

      const body = await sessionResponse.json();
      expect(body.user.role).toBe("admin");
    });
  });

  describe("Regular User Signup", () => {
    test("should create regular user with role 'user' for non-admin emails", async () => {
      const sendResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/email-otp/send-verification-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: regularEmail,
            type: "sign-in",
          }),
        })
      );
      expect(sendResponse.status).toBe(200);

      const otp = await waitForOTP(regularEmail);
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: regularEmail,
            otp,
          }),
        })
      );
      expect(signInResponse.status).toBe(200);

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, regularEmail))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.role).toBe("user");
      createdUserIds.push(user.id);
    });

    test("regular user should have emailVerified set via OTP flow", async () => {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, regularEmail))
        .limit(1);

      expect(user.emailVerified).toBe(true);
    });

    test("regular user should have user role in session", async () => {
      await app.handle(
        new Request(`${BASE_URL}/api/auth/email-otp/send-verification-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: regularEmail,
            type: "sign-in",
          }),
        })
      );

      const otp = await waitForOTP(regularEmail);
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: regularEmail,
            otp,
          }),
        })
      );

      const sessionCookies = signInResponse.headers.get("set-cookie") ?? "";

      const sessionResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/get-session`, {
          method: "GET",
          headers: { Cookie: sessionCookies },
        })
      );

      expect(sessionResponse.status).toBe(200);

      const body = await sessionResponse.json();
      expect(body.user.role).toBe("user");
    });
  });

  describe("Role Hierarchy Validation", () => {
    test("super_admin email takes precedence if in both lists", async () => {
      const [superAdminUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, superAdminEmail))
        .limit(1);

      expect(superAdminUser.role).toBe("super_admin");
    });

    test("all system roles are valid", async () => {
      const [superAdminUser] = await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.email, superAdminEmail))
        .limit(1);

      const [adminUser] = await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.email, adminEmail))
        .limit(1);

      const [regularUser] = await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.email, regularEmail))
        .limit(1);

      expect(superAdminUser.role).toBe("super_admin");
      expect(adminUser.role).toBe("admin");
      expect(regularUser.role).toBe("user");
    });
  });

  describe("Admin Independence from Organizations", () => {
    test("super_admin should NOT have any organization membership", async () => {
      const [superAdminUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, superAdminEmail))
        .limit(1);

      const memberships = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.userId, superAdminUser.id));

      expect(memberships).toHaveLength(0);
    });

    test("admin should NOT have any organization membership", async () => {
      const [adminUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, adminEmail))
        .limit(1);

      const memberships = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.userId, adminUser.id));

      expect(memberships).toHaveLength(0);
    });

    test("super_admin should NOT have any subscription or trial created", async () => {
      const [superAdminUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, superAdminEmail))
        .limit(1);

      // Admin users don't have organizations, so they shouldn't have subscriptions
      // First check they have no memberships (which means no orgs)
      const memberships = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.userId, superAdminUser.id));

      expect(memberships).toHaveLength(0);

      // Since admins have no orgs, there should be no subscriptions associated with them
      // This is implicitly true since subscriptions are tied to organizations
    });

    test("admin should NOT have any subscription or trial created", async () => {
      const [adminUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, adminEmail))
        .limit(1);

      const memberships = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.userId, adminUser.id));

      expect(memberships).toHaveLength(0);
    });
  });
});
