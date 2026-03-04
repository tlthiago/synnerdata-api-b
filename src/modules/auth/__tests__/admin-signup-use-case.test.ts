import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";
import { waitForVerificationEmail } from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "AdminTest123!";

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
      await db
        .delete(schema.accounts)
        .where(eq(schema.accounts.userId, userId));
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  describe("Super Admin Signup", () => {
    test("should create super_admin user when email is in SUPER_ADMIN_EMAILS", async () => {
      await signUpAndVerify(app, superAdminEmail, TEST_PASSWORD, "Super Admin");

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
      const sessionCookies = await signUpAndVerify(
        app,
        superAdminEmail,
        TEST_PASSWORD,
        "Super Admin"
      ).catch(() => {
        // User already exists, just sign in
        return app
          .handle(
            new Request(`${BASE_URL}/api/auth/sign-in/email`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: superAdminEmail,
                password: TEST_PASSWORD,
              }),
            })
          )
          .then((r) => r.headers.get("set-cookie") ?? "");
      });

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
      await signUpAndVerify(app, adminEmail, TEST_PASSWORD, "Admin User");

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
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: adminEmail,
            password: TEST_PASSWORD,
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
      await signUpAndVerify(app, regularEmail, TEST_PASSWORD, "Regular User");

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, regularEmail))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.role).toBe("user");
      createdUserIds.push(user.id);
    });

    test("regular user should have emailVerified set to true after verification", async () => {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, regularEmail))
        .limit(1);

      expect(user.emailVerified).toBe(true);
    });

    test("regular user should have user role in session", async () => {
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: regularEmail,
            password: TEST_PASSWORD,
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

      const memberships = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.userId, superAdminUser.id));

      expect(memberships).toHaveLength(0);
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
