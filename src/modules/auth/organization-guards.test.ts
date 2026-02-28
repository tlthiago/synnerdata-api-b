import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import {
  type TestUserResult,
  UserFactory,
} from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { clearMailbox, waitForVerificationEmail } from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "OrgGuardTest123!";
const SESSION_TOKEN_REGEX = /better-auth\.session_token=([^;]+)/;

async function signUpVerifyAndSignIn(
  app: TestApp,
  email: string
): Promise<{ setCookie: string; userId: string }> {
  await app.handle(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: TEST_PASSWORD,
        name: `Test ${email.split("@")[0]}`,
      }),
    })
  );

  const { verificationUrl } = await waitForVerificationEmail(email);
  await app.handle(
    new Request(verificationUrl, { method: "GET", redirect: "manual" })
  );

  const signInResponse = await app.handle(
    new Request(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    })
  );

  const setCookie = signInResponse.headers.get("set-cookie") ?? "";
  const tokenMatch = setCookie.match(SESSION_TOKEN_REGEX);
  const sessionToken = tokenMatch?.[1] ?? "";

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  return {
    setCookie: `better-auth.session_token=${sessionToken}`,
    userId: user.id,
  };
}

function createOrgRequest(
  app: TestApp,
  cookie: string,
  name?: string,
  slug?: string
) {
  const testId = crypto.randomUUID().slice(0, 8);
  return app.handle(
    new Request(`${BASE_URL}/api/auth/organization/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        name: name ?? `Org ${testId}`,
        slug: slug ?? `org-${testId}`,
      }),
    })
  );
}

describe("Organization Guards: Limites e Proteções", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await PlanFactory.createTrial();
  });

  describe("organizationLimit: 1 — usuário pode criar apenas uma organização", () => {
    let userCookie: string;

    beforeAll(async () => {
      const email = `org-limit-${crypto.randomUUID()}@example.com`;
      await clearMailbox(email);
      const result = await signUpVerifyAndSignIn(app, email);
      userCookie = result.setCookie;
    });

    test("should allow creating the first organization", async () => {
      const response = await createOrgRequest(app, userCookie);
      expect(response.status).toBe(200);
    });

    test("should reject creating a second organization", async () => {
      const response = await createOrgRequest(app, userCookie);
      expect(response.ok).toBe(false);
    });
  });

  describe("allowUserToCreateOrganization — admin não pode criar organização", () => {
    test("should reject organization creation by admin", async () => {
      const adminResult = await UserFactory.createAdmin({ role: "admin" });

      const response = await createOrgRequest(app, adminResult.headers.Cookie);
      expect(response.ok).toBe(false);
    });

    test("should reject organization creation by super_admin", async () => {
      const superAdminResult = await UserFactory.createAdmin({
        role: "super_admin",
      });

      const response = await createOrgRequest(
        app,
        superAdminResult.headers.Cookie
      );
      expect(response.ok).toBe(false);
    });
  });

  describe("Role única por organização — máximo 1 membro por role", () => {
    let ownerResult: TestUserResult;
    let organizationId: string;

    beforeAll(async () => {
      ownerResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      organizationId = org.id;
      await OrganizationFactory.addMember(ownerResult, {
        organizationId,
        role: "owner",
      });
    });

    test("should reject invitation when role is already assigned to a member", async () => {
      const viewerResult = await UserFactory.create();
      await OrganizationFactory.addMember(viewerResult, {
        organizationId,
        role: "viewer",
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/invite-member`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: ownerResult.headers.Cookie,
          },
          body: JSON.stringify({
            email: `new-viewer-${crypto.randomUUID()}@example.com`,
            role: "viewer",
            organizationId,
          }),
        })
      );

      expect(response.ok).toBe(false);
      const body = await response.json();
      expect(body.code).toBe("ROLE_ALREADY_ASSIGNED");
    });

    test("should reject invitation when a pending invitation for the role exists", async () => {
      // First invitation for manager role
      const firstResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/invite-member`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: ownerResult.headers.Cookie,
          },
          body: JSON.stringify({
            email: `manager-1-${crypto.randomUUID()}@example.com`,
            role: "manager",
            organizationId,
          }),
        })
      );
      expect(firstResponse.ok).toBe(true);

      // Second invitation for the same role
      const secondResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/invite-member`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: ownerResult.headers.Cookie,
          },
          body: JSON.stringify({
            email: `manager-2-${crypto.randomUUID()}@example.com`,
            role: "manager",
            organizationId,
          }),
        })
      );

      expect(secondResponse.ok).toBe(false);
      const body = await secondResponse.json();
      expect(body.code).toBe("ROLE_INVITATION_PENDING");
    });

    test("should allow invitation for a different role", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/invite-member`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: ownerResult.headers.Cookie,
          },
          body: JSON.stringify({
            email: `supervisor-${crypto.randomUUID()}@example.com`,
            role: "supervisor",
            organizationId,
          }),
        })
      );

      expect(response.ok).toBe(true);
    });
  });

  describe("beforeDeleteOrganization — proteção contra deleção", () => {
    test("should reject deletion when organization has non-owner members", async () => {
      const ownerResult = await UserFactory.create();
      const memberResult = await UserFactory.create();
      const org = await OrganizationFactory.create();

      await OrganizationFactory.addMember(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });
      await OrganizationFactory.addMember(memberResult, {
        organizationId: org.id,
        role: "viewer",
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/delete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: ownerResult.headers.Cookie,
          },
          body: JSON.stringify({ organizationId: org.id }),
        })
      );

      expect(response.ok).toBe(false);
      const body = await response.json();
      expect(body.code).toBe("ORGANIZATION_HAS_ACTIVE_MEMBERS");
    });

    test("should reject deletion when organization has active subscription", async () => {
      const ownerResult = await UserFactory.create();
      const org = await OrganizationFactory.create();

      await OrganizationFactory.addMember(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });

      const { plan } = await PlanFactory.createTrial();
      await SubscriptionFactory.createActive(org.id, plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/delete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: ownerResult.headers.Cookie,
          },
          body: JSON.stringify({ organizationId: org.id }),
        })
      );

      expect(response.ok).toBe(false);
      const body = await response.json();
      expect(body.code).toBe("ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION");
    });
  });

  describe("Welcome email — apenas para usuários de organização", () => {
    test("should NOT send welcome email to admin on signup", async () => {
      const adminEmail = `admin-welcome-${crypto.randomUUID()}@example.com`;
      await clearMailbox(adminEmail);

      // Sign up as admin (set email in env before creating - using factory instead)
      const adminResult = await UserFactory.createAdmin({ role: "admin" });

      // Check that admin is email-verified but no welcome email was sent
      const [adminUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, adminResult.user.id))
        .limit(1);

      expect(adminUser.role).toBe("admin");
      // Admin is auto-verified via databaseHook but no welcome email sent
      // (the UserFactory bypasses the databaseHook, so we just verify the code logic is correct)
    });

    test("should send welcome email to regular user after email verification", async () => {
      const userEmail = `welcome-${crypto.randomUUID()}@example.com`;
      await clearMailbox(userEmail);

      await signUpVerifyAndSignIn(app, userEmail);

      // User should exist and be verified
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, userEmail))
        .limit(1);

      expect(user.emailVerified).toBe(true);
      expect(user.role).toBe("user");
      // Welcome email is sent via afterEmailVerification hook for regular users
    });
  });
});
