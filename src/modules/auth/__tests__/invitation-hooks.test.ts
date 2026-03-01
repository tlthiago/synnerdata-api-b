import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "TestPassword123!";

function inviteMember(
  app: TestApp,
  cookie: string,
  options: { email: string; role: string; organizationId: string }
) {
  return app.handle(
    new Request(`${BASE_URL}/api/auth/organization/invite-member`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(options),
    })
  );
}

function createOrg(app: TestApp, cookie: string) {
  const testId = crypto.randomUUID().slice(0, 8);
  return app.handle(
    new Request(`${BASE_URL}/api/auth/organization/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        name: `Org ${testId}`,
        slug: `org-${testId}`,
      }),
    })
  );
}

describe("Invitation Hooks", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await PlanFactory.createTrial();
  });

  describe("#126: beforeCreateInvitation — rejeitar convite para email existente", () => {
    let ownerResult: Awaited<
      ReturnType<typeof UserFactory.createWithOrganization>
    >;

    beforeAll(async () => {
      ownerResult = await UserFactory.createWithOrganization();
    });

    test("should reject invitation when email belongs to an existing user", async () => {
      const existingUser = await UserFactory.create();

      const response = await inviteMember(app, ownerResult.headers.Cookie, {
        email: existingUser.user.email,
        role: "viewer",
        organizationId: ownerResult.organizationId,
      });

      expect(response.ok).toBe(false);
      const body = await response.json();
      expect(body.code).toBe("USER_ALREADY_EXISTS");
    });

    test("should allow invitation for non-existing email", async () => {
      const newEmail = `new-${crypto.randomUUID()}@example.com`;

      const response = await inviteMember(app, ownerResult.headers.Cookie, {
        email: newEmail,
        role: "viewer",
        organizationId: ownerResult.organizationId,
      });

      expect(response.ok).toBe(true);
    });
  });

  describe("#127: user.create.before — skip verificação de email para convidados", () => {
    test("should auto-verify email when user has pending invitation", async () => {
      const owner = await UserFactory.createWithOrganization();
      const inviteeEmail = `invitee-${crypto.randomUUID()}@example.com`;

      // Insert invitation directly in DB
      await db.insert(schema.invitations).values({
        id: `inv-${crypto.randomUUID()}`,
        organizationId: owner.organizationId,
        email: inviteeEmail,
        role: "viewer",
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        inviterId: owner.userId,
      });

      // Sign up with the invited email
      const signUpResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: inviteeEmail,
            password: TEST_PASSWORD,
            name: "Invited User",
          }),
        })
      );

      expect(signUpResponse.status).toBe(200);

      // Verify user was created with emailVerified: true
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, inviteeEmail))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.emailVerified).toBe(true);
    });

    test("should NOT auto-verify email when user has no pending invitation", async () => {
      const regularEmail = `regular-${crypto.randomUUID()}@example.com`;

      const signUpResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: regularEmail,
            password: TEST_PASSWORD,
            name: "Regular User",
          }),
        })
      );

      expect(signUpResponse.status).toBe(200);

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, regularEmail))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.emailVerified).toBe(false);
    });
  });

  describe("#128: allowUserToCreateOrganization — impedir convidados de criar org", () => {
    test("should reject org creation when user has pending invitation", async () => {
      const owner = await UserFactory.createWithOrganization();
      const invitedUser = await UserFactory.create();

      // Insert pending invitation for the user
      await db.insert(schema.invitations).values({
        id: `inv-${crypto.randomUUID()}`,
        organizationId: owner.organizationId,
        email: invitedUser.user.email,
        role: "viewer",
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        inviterId: owner.userId,
      });

      const response = await createOrg(app, invitedUser.headers.Cookie);
      expect(response.ok).toBe(false);
    });

    test("should reject org creation when user already belongs to an org", async () => {
      const memberUser = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(memberUser, {
        organizationId: org.id,
        role: "viewer",
      });

      const response = await createOrg(app, memberUser.headers.Cookie);
      expect(response.ok).toBe(false);
    });

    test("should allow org creation for user without invitation and without org", async () => {
      const freshUser = await UserFactory.create();

      const response = await createOrg(app, freshUser.headers.Cookie);
      expect(response.ok).toBe(true);
    });
  });

  describe("#129: sendInvitationEmail — incluir email no link do convite", () => {
    test("should include encoded email in invitation link", async () => {
      const emailModule = await import("@/lib/email");
      const spy = spyOn(
        emailModule,
        "sendOrganizationInvitationEmail"
      ).mockResolvedValue(undefined);

      const owner = await UserFactory.createWithOrganization();
      const inviteeEmail = `link-test-${crypto.randomUUID()}@example.com`;

      await inviteMember(app, owner.headers.Cookie, {
        email: inviteeEmail,
        role: "viewer",
        organizationId: owner.organizationId,
      });

      expect(spy).toHaveBeenCalled();
      const callArgs = spy.mock.calls.at(-1)?.[0];
      expect(callArgs.inviteLink).toContain(
        `?email=${encodeURIComponent(inviteeEmail)}`
      );
      expect(callArgs.to).toBe(inviteeEmail);

      spy.mockRestore();
    });
  });
});
