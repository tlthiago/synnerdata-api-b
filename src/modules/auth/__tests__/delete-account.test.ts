import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "TestPassword123!";

function deleteAccount(
  app: TestApp,
  sessionCookies: string
): Promise<Response> {
  return app.handle(
    new Request(`${BASE_URL}/api/auth/delete-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookies,
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    })
  );
}

describe("Delete Account", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await PlanFactory.createTrial();

    const emailModule = await import("@/lib/email");
    spyOn(emailModule, "sendWelcomeEmail").mockResolvedValue(undefined);
  });

  describe("user without organization", () => {
    test("should delete account successfully", async () => {
      const { user, headers } = await UserFactory.create();

      const response = await deleteAccount(app, headers.Cookie);

      expect(response.status).toBe(200);

      const [deletedUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);

      expect(deletedUser).toBeUndefined();
    });

    test("should free email for new signup after deletion", async () => {
      const { user, headers } = await UserFactory.create();
      const email = user.email;

      await deleteAccount(app, headers.Cookie);

      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: TEST_PASSWORD,
            name: "Reused Email User",
          }),
        })
      );

      expect(response.status).toBe(200);
    });
  });

  describe("owner of trial organization", () => {
    test("should delete account and organization", async () => {
      const userResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(userResult, {
        organizationId: org.id,
        role: "owner",
      });

      const { plan } = await PlanFactory.createTrial();
      await SubscriptionFactory.createTrial(org.id, plan.id);

      const response = await deleteAccount(app, userResult.headers.Cookie);

      expect(response.status).toBe(200);

      // Verify user deleted
      const [deletedUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userResult.user.id))
        .limit(1);
      expect(deletedUser).toBeUndefined();

      // Verify org deleted
      const [deletedOrg] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, org.id))
        .limit(1);
      expect(deletedOrg).toBeUndefined();

      // Verify membership deleted
      const [deletedMember] = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.organizationId, org.id))
        .limit(1);
      expect(deletedMember).toBeUndefined();

      // Verify subscription deleted
      const [deletedSub] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);
      expect(deletedSub).toBeUndefined();
    });
  });

  describe("owner with active paid subscription", () => {
    test("should block deletion", async () => {
      const userResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(userResult, {
        organizationId: org.id,
        role: "owner",
      });

      const { plan } = await PlanFactory.createPaid("gold");
      await SubscriptionFactory.createActive(org.id, plan.id);

      const response = await deleteAccount(app, userResult.headers.Cookie);

      expect(response.status).not.toBe(200);

      const body = await response.json();
      expect(body.code).toBe("ACTIVE_SUBSCRIPTION");

      // Verify user still exists
      const [existingUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userResult.user.id))
        .limit(1);
      expect(existingUser).toBeDefined();
    });
  });

  describe("owner with other members", () => {
    test("should block deletion", async () => {
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

      const response = await deleteAccount(app, ownerResult.headers.Cookie);

      expect(response.status).not.toBe(200);

      const body = await response.json();
      expect(body.code).toBe("ORGANIZATION_HAS_MEMBERS");

      // Verify user still exists
      const [existingUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ownerResult.user.id))
        .limit(1);
      expect(existingUser).toBeDefined();
    });
  });

  describe("audit", () => {
    test("should create audit log entry after deletion", async () => {
      const { user, headers } = await UserFactory.create();

      const response = await deleteAccount(app, headers.Cookie);
      expect(response.status).toBe(200);

      const [auditLog] = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.resourceId, user.id),
            eq(schema.auditLogs.action, "delete")
          )
        )
        .limit(1);

      expect(auditLog).toBeDefined();
      expect(auditLog.action).toBe("delete");
      expect(auditLog.resource).toBe("user");
      expect(auditLog.userId).toBe(user.id);
    });
  });
});
