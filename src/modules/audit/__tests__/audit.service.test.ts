import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { auditResourceSchema } from "@/modules/audit/audit.model";
import { AuditService } from "@/modules/audit/audit.service";
import { createTestOrganization } from "@/test/helpers/organization";

const AUDIT_ID_PREFIX_REGEX = /^audit-/;

describe("AuditService", () => {
  const testOrgIds: string[] = [];

  afterAll(async () => {
    // Cleanup audit logs created during tests
    for (const orgId of testOrgIds) {
      await db
        .delete(schema.auditLogs)
        .where(eq(schema.auditLogs.organizationId, orgId));
    }
  });

  describe("log", () => {
    test("should insert audit log successfully", async () => {
      const org = await createTestOrganization();
      testOrgIds.push(org.id);
      const userId = `test-user-${crypto.randomUUID()}`;

      await AuditService.log({
        action: "create",
        resource: "employee",
        resourceId: "emp-123",
        userId,
        organizationId: org.id,
        changes: { after: { name: "John Doe" } },
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      });

      const [log] = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.organizationId, org.id))
        .limit(1);

      expect(log).toBeDefined();
      expect(log.action).toBe("create");
      expect(log.resource).toBe("employee");
      expect(log.resourceId).toBe("emp-123");
      expect(log.userId).toBe(userId);
      expect(log.ipAddress).toBe("127.0.0.1");
      expect(log.userAgent).toBe("test-agent");
      expect(log.changes).toEqual({ after: { name: "John Doe" } });
    });

    test("should not throw on failure (silent catch)", async () => {
      // Pass invalid data that would cause a constraint error
      // The service should catch and log, not throw
      await expect(
        AuditService.log({
          action: "create",
          resource: "employee",
          userId: "", // Empty userId will not cause constraint error in our schema
          // organizationId intentionally omitted (nullable)
        })
      ).resolves.toBeUndefined();
    });

    test("should swallow insert errors when called without a transaction", async () => {
      // userId column is NOT NULL — passing nullish userId triggers a constraint error
      // The fire-and-forget contract requires this error to be logged, not thrown
      await expect(
        AuditService.log({
          action: "create",
          resource: "employee",
          userId: null as unknown as string,
        })
      ).resolves.toBeUndefined();
    });

    test("should propagate insert errors when called with a transaction", async () => {
      // Same NOT NULL violation, but inside a transaction the error must surface
      // so the caller's transaction can roll back
      await expect(
        db.transaction(async (tx) => {
          await AuditService.log(
            {
              action: "create",
              resource: "employee",
              userId: null as unknown as string,
            },
            tx
          );
        })
      ).rejects.toThrow();
    });

    test("should rollback the audit-log row when the surrounding transaction throws", async () => {
      const org = await createTestOrganization();
      testOrgIds.push(org.id);
      const userId = `test-user-${crypto.randomUUID()}`;
      const resourceId = `emp-rollback-${crypto.randomUUID()}`;

      await expect(
        db.transaction(async (tx) => {
          await AuditService.log(
            {
              action: "anonymize",
              resource: "user",
              resourceId,
              userId,
              organizationId: org.id,
            },
            tx
          );
          throw new Error("rollback");
        })
      ).rejects.toThrow("rollback");

      const rows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.resourceId, resourceId));
      expect(rows.length).toBe(0);
    });

    test("should commit the audit-log row when the surrounding transaction commits", async () => {
      const org = await createTestOrganization();
      testOrgIds.push(org.id);
      const userId = `test-user-${crypto.randomUUID()}`;
      const resourceId = `emp-commit-${crypto.randomUUID()}`;

      await db.transaction(async (tx) => {
        await AuditService.log(
          {
            action: "anonymize",
            resource: "user",
            resourceId,
            userId,
            organizationId: org.id,
          },
          tx
        );
      });

      const rows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.resourceId, resourceId));
      expect(rows.length).toBe(1);
      expect(rows[0].id).toMatch(AUDIT_ID_PREFIX_REGEX);
      expect(rows[0].action).toBe("anonymize");
      expect(rows[0].resource).toBe("user");
    });
  });

  describe("getByOrganization", () => {
    test("should return logs for organization", async () => {
      const org = await createTestOrganization();
      testOrgIds.push(org.id);
      const userId = `test-user-${crypto.randomUUID()}`;

      // Insert test logs
      await AuditService.log({
        action: "create",
        resource: "employee",
        resourceId: "emp-1",
        userId,
        organizationId: org.id,
      });
      await AuditService.log({
        action: "update",
        resource: "employee",
        resourceId: "emp-1",
        userId,
        organizationId: org.id,
      });
      await AuditService.log({
        action: "delete",
        resource: "document",
        resourceId: "doc-1",
        userId,
        organizationId: org.id,
      });

      const logs = await AuditService.getByOrganization(org.id);

      expect(logs.length).toBe(3);
      // Should be ordered by createdAt desc
      expect(logs[0].action).toBe("delete");
      expect(logs[1].action).toBe("update");
      expect(logs[2].action).toBe("create");
    });

    test("should filter by resource", async () => {
      const org = await createTestOrganization();
      testOrgIds.push(org.id);
      const userId = `test-user-${crypto.randomUUID()}`;

      await AuditService.log({
        action: "create",
        resource: "employee",
        userId,
        organizationId: org.id,
      });
      await AuditService.log({
        action: "create",
        resource: "document",
        userId,
        organizationId: org.id,
      });

      const logs = await AuditService.getByOrganization(org.id, {
        resource: "employee",
      });

      expect(logs.length).toBe(1);
      expect(logs[0].resource).toBe("employee");
    });

    test("should respect limit and offset", async () => {
      const org = await createTestOrganization();
      testOrgIds.push(org.id);
      const userId = `test-user-${crypto.randomUUID()}`;

      // Insert 5 logs
      for (let i = 0; i < 5; i++) {
        await AuditService.log({
          action: "create",
          resource: "employee",
          resourceId: `emp-${i}`,
          userId,
          organizationId: org.id,
        });
      }

      const firstPage = await AuditService.getByOrganization(org.id, {
        limit: 2,
        offset: 0,
      });
      const secondPage = await AuditService.getByOrganization(org.id, {
        limit: 2,
        offset: 2,
      });

      expect(firstPage.length).toBe(2);
      expect(secondPage.length).toBe(2);
      expect(firstPage[0].resourceId).not.toBe(secondPage[0].resourceId);
    });
  });

  describe("getByResource", () => {
    test("should return history for specific resource", async () => {
      const org = await createTestOrganization();
      testOrgIds.push(org.id);
      const userId = `test-user-${crypto.randomUUID()}`;
      const resourceId = `emp-${crypto.randomUUID()}`;

      await AuditService.log({
        action: "create",
        resource: "employee",
        resourceId,
        userId,
        organizationId: org.id,
      });
      await AuditService.log({
        action: "update",
        resource: "employee",
        resourceId,
        userId,
        organizationId: org.id,
        changes: { before: { name: "Old" }, after: { name: "New" } },
      });
      // Log for different resource
      await AuditService.log({
        action: "create",
        resource: "employee",
        resourceId: "other-emp",
        userId,
        organizationId: org.id,
      });

      const logs = await AuditService.getByResource("employee", resourceId);

      expect(logs.length).toBe(2);
      expect(logs.every((l) => l.resourceId === resourceId)).toBe(true);
    });
  });
});

describe("auditResourceSchema — expanded coverage", () => {
  test.each([
    "cost_center",
    "branch",
    "sector",
    "job_position",
    "job_classification",
    "project",
    "ppe_item",
    "absence",
    "accident",
    "vacation",
    "promotion",
    "termination",
    "warning",
    "ppe_delivery",
  ])("accepts new resource key '%s'", (resource) => {
    expect(() => auditResourceSchema.parse(resource)).not.toThrow();
  });
});

describe("auditResourceSchema — M2M coverage (PRD #1.5)", () => {
  test.each([
    "project_employee",
    "ppe_job_position",
    "ppe_delivery_item",
  ])("accepts new resource key '%s'", (resource) => {
    expect(auditResourceSchema.parse(resource)).toBe(resource);
  });
});
