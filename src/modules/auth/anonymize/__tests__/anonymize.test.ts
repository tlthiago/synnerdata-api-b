import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
// biome-ignore lint/performance/noNamespaceImport: Namespace import required for bun's spyOn-based module mocking
import * as authSenders from "@/lib/emails/senders/auth";
import { BadRequestError } from "@/lib/errors/http-errors";
import { logger } from "@/lib/logger";
import { AuditService } from "@/modules/audit/audit.service";
import {
  AnonymizeService,
  buildAnonymizeAuditEntry,
  verifyPasswordOrThrow,
} from "@/modules/auth/anonymize/anonymize.service";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "TestPassword123!";

function buildHeaders(cookie: string): Headers {
  return new Headers({ Cookie: cookie });
}

function anonymizeAccount(
  app: TestApp,
  sessionCookies: string,
  password: string = TEST_PASSWORD
): Promise<Response> {
  return app.handle(
    new Request(`${BASE_URL}/v1/account/anonymize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookies,
      },
      body: JSON.stringify({ password }),
    })
  );
}

describe("AnonymizeService", () => {
  beforeAll(async () => {
    await PlanFactory.createTrial();
  });

  describe("buildAnonymizeAuditEntry", () => {
    test("returns wasOwnerOfTrialOrg=false / organizationCascade=null when no cascade", () => {
      const entry = buildAnonymizeAuditEntry({ id: "user-x" }, null);
      expect(entry.action).toBe("anonymize");
      expect(entry.resource).toBe("user");
      expect(entry.resourceId).toBe("user-x");
      expect(entry.userId).toBe("user-x");
      expect(entry.changes).toEqual({
        before: { wasOwnerOfTrialOrg: false, organizationCascade: null },
        after: undefined,
      });
    });

    test("returns wasOwnerOfTrialOrg=true / organizationCascade=<orgId> when cascade", () => {
      const entry = buildAnonymizeAuditEntry({ id: "user-y" }, "org-xyz");
      expect(entry.changes).toEqual({
        before: { wasOwnerOfTrialOrg: true, organizationCascade: "org-xyz" },
        after: undefined,
      });
    });

    test("contains no PII fields anywhere in the entry", () => {
      const entry = buildAnonymizeAuditEntry({ id: "user-z" }, "org-abc");
      const before = entry.changes?.before as Record<string, unknown>;
      expect(before).not.toHaveProperty("name");
      expect(before).not.toHaveProperty("email");
      expect(before).not.toHaveProperty("image");
      expect(before).not.toHaveProperty("role");
      expect(before).not.toHaveProperty("accountCreatedAt");
    });
  });

  describe("verifyPasswordOrThrow", () => {
    test("resolves silently when the password is correct", async () => {
      const { headers } = await UserFactory.create();
      await expect(
        verifyPasswordOrThrow(TEST_PASSWORD, buildHeaders(headers.Cookie))
      ).resolves.toBeUndefined();
    });

    test("re-throws BadRequestError(INVALID_PASSWORD) on wrong password", async () => {
      const { headers } = await UserFactory.create();

      let caught: unknown;
      try {
        await verifyPasswordOrThrow(
          "WrongPassword!",
          buildHeaders(headers.Cookie)
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(BadRequestError);
      expect((caught as BadRequestError).code).toBe("INVALID_PASSWORD");
      expect((caught as BadRequestError).status).toBe(400);
    });

    test("propagates non-INVALID_PASSWORD errors untouched (no session)", async () => {
      let caught: unknown;
      try {
        await verifyPasswordOrThrow(TEST_PASSWORD, new Headers());
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect(caught).not.toBeInstanceOf(BadRequestError);
    });
  });

  describe("anonymize — happy path", () => {
    test("user without organization is fully anonymized", async () => {
      const { user, headers } = await UserFactory.create();
      const originalEmail = user.email;

      await AnonymizeService.anonymize({
        userId: user.id,
        password: TEST_PASSWORD,
        requestHeaders: buildHeaders(headers.Cookie),
      });

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(row).toBeDefined();
      expect(row.name).toBe("Usuário removido");
      expect(row.email).toBe(`anon-${user.id}@deleted.synnerdata.local`);
      expect(row.image).toBeNull();
      expect(row.emailVerified).toBe(false);
      expect(row.anonymizedAt).toBeInstanceOf(Date);

      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));
      expect(sessions).toHaveLength(0);

      const accounts = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, user.id));
      expect(accounts).toHaveLength(0);

      const twoFactors = await db
        .select()
        .from(schema.twoFactors)
        .where(eq(schema.twoFactors.userId, user.id));
      expect(twoFactors).toHaveLength(0);

      const apikeys = await db
        .select()
        .from(schema.apikeys)
        .where(eq(schema.apikeys.referenceId, user.id));
      expect(apikeys).toHaveLength(0);

      const invitations = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.inviterId, user.id));
      expect(invitations).toHaveLength(0);

      const [auditLog] = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.resourceId, user.id),
            eq(schema.auditLogs.action, "anonymize")
          )
        );
      expect(auditLog).toBeDefined();
      expect(auditLog.resource).toBe("user");
      expect(auditLog.userId).toBe(user.id);
      expect(auditLog.changes).toEqual({
        before: { wasOwnerOfTrialOrg: false, organizationCascade: null },
      });

      const [byOriginalEmail] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, originalEmail));
      expect(byOriginalEmail).toBeUndefined();
    });

    test("owner of empty trial organization cascades to org delete", async () => {
      const userResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(userResult, {
        organizationId: org.id,
        role: "owner",
      });
      const { plan } = await PlanFactory.createTrial();
      await SubscriptionFactory.createTrial(org.id, plan.id);

      await AnonymizeService.anonymize({
        userId: userResult.user.id,
        password: TEST_PASSWORD,
        requestHeaders: buildHeaders(userResult.headers.Cookie),
      });

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userResult.user.id));
      expect(row.anonymizedAt).toBeInstanceOf(Date);

      const [orgRow] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, org.id));
      expect(orgRow).toBeUndefined();

      const [auditLog] = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.resourceId, userResult.user.id),
            eq(schema.auditLogs.action, "anonymize")
          )
        );
      expect(auditLog.changes).toEqual({
        before: { wasOwnerOfTrialOrg: true, organizationCascade: org.id },
      });
    });
  });

  describe("anonymize — guard rejections", () => {
    test("wrong password throws BadRequestError(INVALID_PASSWORD); no mutations", async () => {
      const { user, headers } = await UserFactory.create();

      let caught: unknown;
      try {
        await AnonymizeService.anonymize({
          userId: user.id,
          password: "WrongPassword!",
          requestHeaders: buildHeaders(headers.Cookie),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BadRequestError);
      expect((caught as BadRequestError).code).toBe("INVALID_PASSWORD");

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(row).toBeDefined();
      expect(row.email).toBe(user.email);
      expect(row.anonymizedAt).toBeNull();

      const [auditLog] = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.resourceId, user.id),
            eq(schema.auditLogs.action, "anonymize")
          )
        );
      expect(auditLog).toBeUndefined();
    });

    test("admin role propagates ADMIN_ACCOUNT_DELETE_FORBIDDEN; no mutations", async () => {
      const adminResult = await UserFactory.createAdmin({ role: "admin" });

      let caught: unknown;
      try {
        await AnonymizeService.anonymize({
          userId: adminResult.user.id,
          password: TEST_PASSWORD,
          requestHeaders: buildHeaders(adminResult.headers.Cookie),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BadRequestError);
      expect((caught as BadRequestError).code).toBe(
        "ADMIN_ACCOUNT_DELETE_FORBIDDEN"
      );

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, adminResult.user.id));
      expect(row.anonymizedAt).toBeNull();
      expect(row.email).toBe(adminResult.user.email);
    });

    test("owner with active paid subscription propagates ACTIVE_SUBSCRIPTION", async () => {
      const ownerResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });
      const { plan } = await PlanFactory.createPaid("gold");
      await SubscriptionFactory.createActive(org.id, plan.id);

      let caught: unknown;
      try {
        await AnonymizeService.anonymize({
          userId: ownerResult.user.id,
          password: TEST_PASSWORD,
          requestHeaders: buildHeaders(ownerResult.headers.Cookie),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BadRequestError);
      expect((caught as BadRequestError).code).toBe("ACTIVE_SUBSCRIPTION");

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ownerResult.user.id));
      expect(row.anonymizedAt).toBeNull();
      expect(row.email).toBe(ownerResult.user.email);
    });

    test("owner with other members propagates ORGANIZATION_HAS_MEMBERS", async () => {
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

      let caught: unknown;
      try {
        await AnonymizeService.anonymize({
          userId: ownerResult.user.id,
          password: TEST_PASSWORD,
          requestHeaders: buildHeaders(ownerResult.headers.Cookie),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BadRequestError);
      expect((caught as BadRequestError).code).toBe("ORGANIZATION_HAS_MEMBERS");

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ownerResult.user.id));
      expect(row.anonymizedAt).toBeNull();
    });
  });

  describe("anonymize — atomicity & post-commit", () => {
    test("audit-log insert failure inside the transaction rolls back all mutations", async () => {
      const { user, headers } = await UserFactory.create();
      const originalEmail = user.email;

      const auditSpy = spyOn(AuditService, "log").mockImplementation(() =>
        Promise.reject(new Error("simulated mid-transaction failure"))
      );

      let caught: unknown;
      try {
        await AnonymizeService.anonymize({
          userId: user.id,
          password: TEST_PASSWORD,
          requestHeaders: buildHeaders(headers.Cookie),
        });
      } catch (error) {
        caught = error;
      } finally {
        auditSpy.mockRestore();
      }

      expect(caught).toBeDefined();
      expect((caught as Error).message).toContain(
        "simulated mid-transaction failure"
      );

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(row).toBeDefined();
      expect(row.email).toBe(originalEmail);
      expect(row.anonymizedAt).toBeNull();
      expect(row.name).not.toBe("Usuário removido");

      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));
      expect(sessions.length).toBeGreaterThan(0);

      const accounts = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, user.id));
      expect(accounts.length).toBeGreaterThan(0);

      const auditLogs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.resourceId, user.id),
            eq(schema.auditLogs.action, "anonymize")
          )
        );
      expect(auditLogs).toHaveLength(0);
    });

    test("email send failure does NOT roll back; user remains anonymized", async () => {
      const { user, headers } = await UserFactory.create();

      const senderSpy = spyOn(
        authSenders,
        "sendAccountAnonymizedEmail"
      ).mockImplementation(() =>
        Promise.reject(new Error("simulated smtp failure"))
      );
      const loggerSpy = spyOn(logger, "error");

      let loggerCallsSnapshot: unknown[][] = [];
      try {
        await AnonymizeService.anonymize({
          userId: user.id,
          password: TEST_PASSWORD,
          requestHeaders: buildHeaders(headers.Cookie),
        });
        loggerCallsSnapshot = loggerSpy.mock.calls.map((call) => [...call]);
      } finally {
        senderSpy.mockRestore();
        loggerSpy.mockRestore();
      }

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(row.anonymizedAt).toBeInstanceOf(Date);
      expect(row.email).toBe(`anon-${user.id}@deleted.synnerdata.local`);

      const [auditLog] = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.resourceId, user.id),
            eq(schema.auditLogs.action, "anonymize")
          )
        );
      expect(auditLog).toBeDefined();

      const failureLogged = loggerCallsSnapshot.some((call) => {
        const [arg] = call as [{ type?: string }];
        return arg?.type === "email:account-anonymized:failed";
      });
      expect(failureLogged).toBe(true);
    });
  });
});

describe("POST /v1/account/anonymize (HTTP integration)", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await PlanFactory.createTrial();
  });

  afterEach(() => {
    // No state to reset across tests; placeholder kept for consistency with
    // future spies added to scenarios that mock `authSenders`.
  });

  describe("Scenario 1 — user without organization", () => {
    test("returns 200, anonymizes the row, and clears every credential surface", async () => {
      const { user, headers } = await UserFactory.create();
      const originalEmail = user.email;

      const sendSpy = spyOn(
        authSenders,
        "sendAccountAnonymizedEmail"
      ).mockResolvedValue(undefined);

      let response: Response;
      try {
        response = await anonymizeAccount(app, headers.Cookie);
      } finally {
        // Snapshot the call args before mockRestore clears them.
        const calls = sendSpy.mock.calls.map((c) => [...c]);
        sendSpy.mockRestore();
        expect(calls).toHaveLength(1);
        const [args] = calls[0] as [{ email: string }];
        expect(args.email).toBe(originalEmail);
      }

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        success: true;
        data: null;
        message: string;
      };
      expect(body.success).toBe(true);
      expect(body.message).toBe("Conta anonimizada com sucesso.");
      expect(body.data).toBeNull();

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(row).toBeDefined();
      expect(row.anonymizedAt).toBeInstanceOf(Date);
      expect(row.email).toBe(`anon-${user.id}@deleted.synnerdata.local`);
      expect(row.name).toBe("Usuário removido");
      expect(row.image).toBeNull();
      expect(row.emailVerified).toBe(false);

      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));
      expect(sessions).toHaveLength(0);

      const accounts = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, user.id));
      expect(accounts).toHaveLength(0);

      const twoFactors = await db
        .select()
        .from(schema.twoFactors)
        .where(eq(schema.twoFactors.userId, user.id));
      expect(twoFactors).toHaveLength(0);

      const apikeys = await db
        .select()
        .from(schema.apikeys)
        .where(eq(schema.apikeys.referenceId, user.id));
      expect(apikeys).toHaveLength(0);

      const invitations = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.inviterId, user.id));
      expect(invitations).toHaveLength(0);
    });
  });

  describe("Scenario 2 — anonymized email is reusable for a brand-new signup", () => {
    test("the original email can register a new account after anonymization", async () => {
      const { user, headers } = await UserFactory.create();
      const reusableEmail = user.email;

      const sendSpy = spyOn(
        authSenders,
        "sendAccountAnonymizedEmail"
      ).mockResolvedValue(undefined);
      try {
        const anonymizeResponse = await anonymizeAccount(app, headers.Cookie);
        expect(anonymizeResponse.status).toBe(200);
      } finally {
        sendSpy.mockRestore();
      }

      const signUpResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: reusableEmail,
            password: TEST_PASSWORD,
            name: "Reused Email User",
          }),
        })
      );

      expect(signUpResponse.status).toBe(200);
    });
  });

  describe("Scenario 3 — anonymized email can be invited to another organization", () => {
    test("invitation succeeds and a pending row is recorded against the new org", async () => {
      const { user, headers } = await UserFactory.create();
      const anonymizedEmail = user.email;

      const sendSpy = spyOn(
        authSenders,
        "sendAccountAnonymizedEmail"
      ).mockResolvedValue(undefined);
      try {
        const anonymizeResponse = await anonymizeAccount(app, headers.Cookie);
        expect(anonymizeResponse.status).toBe(200);
      } finally {
        sendSpy.mockRestore();
      }

      const otherOwner = await UserFactory.create();
      const otherOrg = await OrganizationFactory.create();
      await OrganizationFactory.addMember(otherOwner, {
        organizationId: otherOrg.id,
        role: "owner",
      });

      const inviteResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/invite-member`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: otherOwner.headers.Cookie,
          },
          body: JSON.stringify({
            email: anonymizedEmail,
            role: "viewer",
            organizationId: otherOrg.id,
          }),
        })
      );

      expect(inviteResponse.status).toBe(200);

      const [invitation] = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.email, anonymizedEmail))
        .limit(1);

      expect(invitation).toBeDefined();
      expect(invitation.organizationId).toBe(otherOrg.id);
      expect(invitation.role).toBe("viewer");
      expect(invitation.status).toBe("pending");
    });
  });

  describe("Scenario 4 — owner of active trial org (no other members)", () => {
    test("returns 200, anonymizes the user, and cascades the organization", async () => {
      const ownerResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });
      const { plan } = await PlanFactory.createTrial();
      await SubscriptionFactory.createTrial(org.id, plan.id);

      const sendSpy = spyOn(
        authSenders,
        "sendAccountAnonymizedEmail"
      ).mockResolvedValue(undefined);
      let response: Response;
      try {
        response = await anonymizeAccount(app, ownerResult.headers.Cookie);
      } finally {
        sendSpy.mockRestore();
      }
      expect(response.status).toBe(200);

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ownerResult.user.id));
      expect(row.anonymizedAt).toBeInstanceOf(Date);
      expect(row.name).toBe("Usuário removido");

      const [orgRow] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, org.id));
      expect(orgRow).toBeUndefined();
    });
  });

  describe("Scenario 5 — owner of expired trial org", () => {
    test("returns 200 and cascades the org just like the active-trial case", async () => {
      const ownerResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });
      const { plan } = await PlanFactory.createTrial();
      // Negative trialDays makes the trial period start in the past.
      await SubscriptionFactory.createTrial(org.id, plan.id, -1);

      const sendSpy = spyOn(
        authSenders,
        "sendAccountAnonymizedEmail"
      ).mockResolvedValue(undefined);
      let response: Response;
      try {
        response = await anonymizeAccount(app, ownerResult.headers.Cookie);
      } finally {
        sendSpy.mockRestore();
      }
      expect(response.status).toBe(200);

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ownerResult.user.id));
      expect(row.anonymizedAt).toBeInstanceOf(Date);

      const [orgRow] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, org.id));
      expect(orgRow).toBeUndefined();
    });
  });

  describe("Scenario 6 — owner with past_due subscription outside grace", () => {
    test("returns 200, anonymizes the user, and cascades the org", async () => {
      const ownerResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });
      const { plan } = await PlanFactory.createPaid("gold");
      await SubscriptionFactory.create(org.id, plan.id, {
        status: "past_due",
      });

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);
      await db
        .update(schema.orgSubscriptions)
        .set({
          pastDueSince: new Date(pastDate.getTime() - 15 * 24 * 60 * 60 * 1000),
          gracePeriodEnds: pastDate,
        })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const sendSpy = spyOn(
        authSenders,
        "sendAccountAnonymizedEmail"
      ).mockResolvedValue(undefined);
      let response: Response;
      try {
        response = await anonymizeAccount(app, ownerResult.headers.Cookie);
      } finally {
        sendSpy.mockRestore();
      }
      expect(response.status).toBe(200);

      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ownerResult.user.id));
      expect(row.anonymizedAt).toBeInstanceOf(Date);

      const [orgRow] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, org.id));
      expect(orgRow).toBeUndefined();
    });
  });

  describe("Scenario 7 — owner with active paid subscription", () => {
    test("returns 400 ACTIVE_SUBSCRIPTION; row unchanged; no audit row", async () => {
      const ownerResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });
      const { plan } = await PlanFactory.createPaid("gold");
      await SubscriptionFactory.createActive(org.id, plan.id);

      const response = await anonymizeAccount(app, ownerResult.headers.Cookie);
      expect(response.status).toBe(400);

      const body = (await response.json()) as {
        success: false;
        error: { code: string; message: string };
      };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("ACTIVE_SUBSCRIPTION");

      const [unchanged] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ownerResult.user.id));
      expect(unchanged).toBeDefined();
      expect(unchanged.anonymizedAt).toBeNull();
      expect(unchanged.email).toBe(ownerResult.user.email);
      expect(unchanged.name).toBe(ownerResult.user.name);

      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.userId, ownerResult.user.id),
            eq(schema.auditLogs.action, "anonymize")
          )
        );
      expect(auditRows).toHaveLength(0);
    });
  });

  describe("Scenario 8 — owner with other active members", () => {
    test("returns 400 ORGANIZATION_HAS_MEMBERS; row unchanged", async () => {
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

      const response = await anonymizeAccount(app, ownerResult.headers.Cookie);
      expect(response.status).toBe(400);

      const body = (await response.json()) as {
        success: false;
        error: { code: string };
      };
      expect(body.error.code).toBe("ORGANIZATION_HAS_MEMBERS");

      const [unchanged] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ownerResult.user.id));
      expect(unchanged.anonymizedAt).toBeNull();
      expect(unchanged.email).toBe(ownerResult.user.email);
    });
  });

  describe("Scenario 9 — admin / super_admin accounts", () => {
    test("admin role: returns 400 ADMIN_ACCOUNT_DELETE_FORBIDDEN; row unchanged", async () => {
      const adminResult = await UserFactory.createAdmin({ role: "admin" });

      const response = await anonymizeAccount(app, adminResult.headers.Cookie);
      expect(response.status).toBe(400);

      const body = (await response.json()) as {
        success: false;
        error: { code: string };
      };
      expect(body.error.code).toBe("ADMIN_ACCOUNT_DELETE_FORBIDDEN");

      const [unchanged] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, adminResult.user.id));
      expect(unchanged.anonymizedAt).toBeNull();
      expect(unchanged.email).toBe(adminResult.user.email);
    });

    test("super_admin role: returns 400 ADMIN_ACCOUNT_DELETE_FORBIDDEN; row unchanged", async () => {
      const superAdminResult = await UserFactory.createAdmin({
        role: "super_admin",
      });

      const response = await anonymizeAccount(
        app,
        superAdminResult.headers.Cookie
      );
      expect(response.status).toBe(400);

      const body = (await response.json()) as {
        success: false;
        error: { code: string };
      };
      expect(body.error.code).toBe("ADMIN_ACCOUNT_DELETE_FORBIDDEN");

      const [unchanged] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, superAdminResult.user.id));
      expect(unchanged.anonymizedAt).toBeNull();
    });
  });

  describe("Scenario 10 — wrong password", () => {
    test("returns 400 INVALID_PASSWORD; no mutations and no audit row", async () => {
      const { user, headers } = await UserFactory.create();

      const response = await anonymizeAccount(
        app,
        headers.Cookie,
        "WrongPassword999!"
      );
      expect(response.status).toBe(400);

      const body = (await response.json()) as {
        success: false;
        error: { code: string };
      };
      expect(body.error.code).toBe("INVALID_PASSWORD");

      const [unchanged] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(unchanged.anonymizedAt).toBeNull();
      expect(unchanged.email).toBe(user.email);

      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.userId, user.id),
            eq(schema.auditLogs.action, "anonymize")
          )
        );
      expect(auditRows).toHaveLength(0);
    });
  });

  describe("Scenario 11 — audit log payload (per ADR-006)", () => {
    test("inserts exactly one audit row with action=anonymize and the expected non-PII before payload", async () => {
      const ownerResult = await UserFactory.create();
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });
      const { plan } = await PlanFactory.createTrial();
      await SubscriptionFactory.createTrial(org.id, plan.id);

      const sendSpy = spyOn(
        authSenders,
        "sendAccountAnonymizedEmail"
      ).mockResolvedValue(undefined);
      let response: Response;
      try {
        response = await anonymizeAccount(app, ownerResult.headers.Cookie);
      } finally {
        sendSpy.mockRestore();
      }
      expect(response.status).toBe(200);

      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.userId, ownerResult.user.id),
            eq(schema.auditLogs.action, "anonymize")
          )
        );
      expect(auditRows).toHaveLength(1);

      const [entry] = auditRows;
      expect(entry.action).toBe("anonymize");
      expect(entry.resource).toBe("user");
      expect(entry.resourceId).toBe(ownerResult.user.id);
      expect(entry.userId).toBe(ownerResult.user.id);
      expect(entry.changes).toEqual({
        before: { wasOwnerOfTrialOrg: true, organizationCascade: org.id },
      });
    });
  });

  // Scenario 12 (atomic rollback) — covered above by the service-level test
  // "audit-log insert failure inside the transaction rolls back all
  // mutations" inside `describe("anonymize — atomicity & post-commit")`.
  // The cheapest seam is at the AuditService.log boundary (spyOn), which is
  // already in place. ADR-002's atomic-transaction invariant is structurally
  // enforced by db.transaction itself; the service-level assertion exercises
  // exactly the rollback path that an HTTP-level test would cover.
});
