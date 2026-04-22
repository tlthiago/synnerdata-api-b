import { afterAll, describe, expect, test } from "bun:test";
import { desc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { type AuditEntry, auditPlugin } from "@/lib/audit/audit-plugin";
import { createTestOrganization } from "@/test/helpers/organization";

type AuditContext = {
  audit: (
    entry: AuditEntry,
    context: { userId: string; organizationId?: string | null }
  ) => Promise<void>;
};

/**
 * Baseline tests for auditPlugin — establish the current contract before RU-7 and RU-8 refactor it.
 *
 * Current contract (pre-refactor, to be changed):
 *   - Plugin injects `audit(entry, context)` into the scoped Elysia context.
 *   - `context: { userId, organizationId? }` must be passed manually by each caller.
 *   - `entry.action` and `entry.resource` are typed as `AuditAction | string` (loose).
 *   - IP is extracted from `x-forwarded-for` (first value) with fallback to `x-real-ip`.
 *   - userAgent is extracted from the request headers.
 *
 * After RU-7:
 *   - `context` will be injected automatically from the `auth` macro session — manual context goes away.
 *   - Tipes `action`/`resource` will be strict enums only (drop `| string`).
 * After RU-8:
 *   - Plugin moves to `src/plugins/audit/`. Imports update.
 *
 * These tests will need to be updated when RU-7 runs. Until then, they protect against accidental regression.
 */
describe("auditPlugin (baseline — pre RU-7/RU-8 refactor)", () => {
  const testOrgIds: string[] = [];
  const testUserIds: string[] = [];

  afterAll(async () => {
    // Cleanup audit logs created during tests
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

  test("injects audit() into context and persists log with full entry", async () => {
    const org = await createTestOrganization();
    testOrgIds.push(org.id);
    const userId = `test-user-${crypto.randomUUID()}`;

    const app = new Elysia()
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit(
          {
            action: "create",
            resource: "employee",
            resourceId: "emp-baseline-1",
            changes: { after: { name: "Baseline User" } },
          },
          { userId, organizationId: org.id }
        );
        return { ok: true };
      });

    const response = await app.handle(
      new Request("http://localhost/audit-trigger", {
        method: "POST",
        headers: {
          "user-agent": "baseline-test-agent/1.0",
          "x-forwarded-for": "10.0.0.42",
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
    expect(log.resourceId).toBe("emp-baseline-1");
    expect(log.userId).toBe(userId);
    expect(log.organizationId).toBe(org.id);
    expect(log.ipAddress).toBe("10.0.0.42");
    expect(log.userAgent).toBe("baseline-test-agent/1.0");
    expect(log.changes).toEqual({ after: { name: "Baseline User" } });
  });

  test("extracts ipAddress from x-forwarded-for taking first value when multiple present", async () => {
    const org = await createTestOrganization();
    testOrgIds.push(org.id);
    const userId = `test-user-${crypto.randomUUID()}`;

    const app = new Elysia()
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit(
          { action: "update", resource: "document" },
          { userId, organizationId: org.id }
        );
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
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit(
          { action: "delete", resource: "document" },
          { userId, organizationId: org.id }
        );
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
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit(
          {
            action: "create",
            resource: "document",
            resourceId: "doc-no-headers",
          },
          { userId, organizationId: org.id }
        );
        return { ok: true };
      });

    await app.handle(
      new Request("http://localhost/audit-trigger", {
        method: "POST",
      })
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

  test("accepts organizationId=null for system-level actions (login, user create)", async () => {
    const userId = `test-user-${crypto.randomUUID()}`;
    testUserIds.push(userId);

    const app = new Elysia()
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit(
          { action: "login", resource: "session", resourceId: "sess-baseline" },
          { userId, organizationId: null }
        );
        return { ok: true };
      });

    const response = await app.handle(
      new Request("http://localhost/audit-trigger", {
        method: "POST",
      })
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
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit(
          { action: "export", resource: "report" },
          { userId, organizationId: org.id }
        );
        return { ok: true };
      });

    await app.handle(
      new Request("http://localhost/audit-trigger", {
        method: "POST",
      })
    );

    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.organizationId, org.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);

    expect(log.resourceId).toBeNull();
    expect(log.action).toBe("export");
    expect(log.resource).toBe("report");
  });

  /**
   * Current behavior documents loose typing (AuditAction | string) — see débito #24.
   * RU-7 will tighten this to strict enums; this test will need to be updated or removed then.
   */
  test("accepts arbitrary action/resource strings (loose typing — to be tightened in RU-7)", async () => {
    const org = await createTestOrganization();
    testOrgIds.push(org.id);
    const userId = `test-user-${crypto.randomUUID()}`;

    const app = new Elysia()
      .use(auditPlugin)
      .post("/audit-trigger", async ({ audit }: AuditContext) => {
        await audit(
          {
            action: "custom_ad_hoc_action",
            resource: "custom_ad_hoc_resource",
            resourceId: "loose-1",
          },
          { userId, organizationId: org.id }
        );
        return { ok: true };
      });

    await app.handle(
      new Request("http://localhost/audit-trigger", {
        method: "POST",
      })
    );

    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.organizationId, org.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);

    expect(log.action).toBe("custom_ad_hoc_action");
    expect(log.resource).toBe("custom_ad_hoc_resource");
  });
});
