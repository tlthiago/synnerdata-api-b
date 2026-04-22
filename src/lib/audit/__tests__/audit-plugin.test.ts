import { afterAll, describe, expect, test } from "bun:test";
import { desc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { type AuditEntry, auditPlugin } from "@/lib/audit/audit-plugin";
import type { AuthSession, AuthUser } from "@/lib/auth";
import { createTestOrganization } from "@/test/helpers/organization";

type AuditContext = { audit: (entry: AuditEntry) => Promise<void> };

function mockAuthContext(userId: string, organizationId: string | null) {
  return {
    user: { id: userId } as AuthUser,
    session: { activeOrganizationId: organizationId } as AuthSession,
  };
}

describe("auditPlugin — auto-context via auth macro (RU-7)", () => {
  const testOrgIds: string[] = [];
  const testUserIds: string[] = [];

  afterAll(async () => {
    for (const orgId of testOrgIds) {
      await db
        .delete(schema.auditLogs)
        .where(eq(schema.auditLogs.organizationId, orgId));
    }
    for (const userId of testUserIds) {
      await db
        .delete(schema.auditLogs)
        .where(eq(schema.auditLogs.userId, userId));
    }
  });

  test("auto-injects user.id and session.activeOrganizationId without manual context", async () => {
    const org = await createTestOrganization();
    testOrgIds.push(org.id);
    const userId = `test-user-${crypto.randomUUID()}`;

    const app = new Elysia()
      .derive(() => mockAuthContext(userId, org.id))
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit({
          action: "create",
          resource: "employee",
          resourceId: "emp-ru7",
          changes: { after: { name: "RU-7 Employee" } },
        });
        return { ok: true };
      });

    const response = await app.handle(
      new Request("http://localhost/audit-trigger", {
        method: "POST",
        headers: {
          "user-agent": "ru7-test-agent/1.0",
          "x-forwarded-for": "10.0.0.99",
        },
      })
    );

    expect(response.status).toBe(200);

    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.organizationId, org.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);

    expect(log).toBeDefined();
    expect(log.action).toBe("create");
    expect(log.resource).toBe("employee");
    expect(log.resourceId).toBe("emp-ru7");
    expect(log.userId).toBe(userId);
    expect(log.organizationId).toBe(org.id);
    expect(log.ipAddress).toBe("10.0.0.99");
    expect(log.userAgent).toBe("ru7-test-agent/1.0");
    expect(log.changes).toEqual({ after: { name: "RU-7 Employee" } });
  });

  test("extracts ipAddress from x-forwarded-for taking first value when multiple present", async () => {
    const org = await createTestOrganization();
    testOrgIds.push(org.id);
    const userId = `test-user-${crypto.randomUUID()}`;

    const app = new Elysia()
      .derive(() => mockAuthContext(userId, org.id))
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit({ action: "update", resource: "document" });
        return { ok: true };
      });

    await app.handle(
      new Request("http://localhost/audit-trigger", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.5, 10.0.0.1, 172.16.0.1",
        },
      })
    );

    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.organizationId, org.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);

    expect(log.ipAddress).toBe("203.0.113.5");
  });

  test("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    const org = await createTestOrganization();
    testOrgIds.push(org.id);
    const userId = `test-user-${crypto.randomUUID()}`;

    const app = new Elysia()
      .derive(() => mockAuthContext(userId, org.id))
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit({ action: "delete", resource: "document" });
        return { ok: true };
      });

    await app.handle(
      new Request("http://localhost/audit-trigger", {
        method: "POST",
        headers: { "x-real-ip": "198.51.100.7" },
      })
    );

    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.organizationId, org.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);

    expect(log.ipAddress).toBe("198.51.100.7");
  });

  test("stores null ipAddress and userAgent when headers are absent", async () => {
    const org = await createTestOrganization();
    testOrgIds.push(org.id);
    const userId = `test-user-${crypto.randomUUID()}`;

    const app = new Elysia()
      .derive(() => mockAuthContext(userId, org.id))
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit({
          action: "create",
          resource: "document",
          resourceId: "doc-no-headers",
        });
        return { ok: true };
      });

    await app.handle(
      new Request("http://localhost/audit-trigger", { method: "POST" })
    );

    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.organizationId, org.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);

    expect(log.ipAddress).toBeNull();
    expect(log.userAgent).toBeNull();
  });

  test("persists organizationId=null when session has no active organization (system-level actions)", async () => {
    const userId = `test-user-${crypto.randomUUID()}`;
    testUserIds.push(userId);

    const app = new Elysia()
      .derive(() => mockAuthContext(userId, null))
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit({
          action: "login",
          resource: "session",
          resourceId: "sess-ru7",
        });
        return { ok: true };
      });

    const response = await app.handle(
      new Request("http://localhost/audit-trigger", { method: "POST" })
    );

    expect(response.status).toBe(200);

    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.userId, userId))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);

    expect(log.organizationId).toBeNull();
    expect(log.action).toBe("login");
    expect(log.resource).toBe("session");
  });

  test("omits optional resourceId when not provided", async () => {
    const org = await createTestOrganization();
    testOrgIds.push(org.id);
    const userId = `test-user-${crypto.randomUUID()}`;

    const app = new Elysia()
      .derive(() => mockAuthContext(userId, org.id))
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit({ action: "export", resource: "export" });
        return { ok: true };
      });

    await app.handle(
      new Request("http://localhost/audit-trigger", { method: "POST" })
    );

    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.organizationId, org.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);

    expect(log.resourceId).toBeNull();
    expect(log.action).toBe("export");
    expect(log.resource).toBe("export");
  });
});
