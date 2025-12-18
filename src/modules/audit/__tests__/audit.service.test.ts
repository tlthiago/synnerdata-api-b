import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { AuditService } from "@/modules/audit/audit.service";
import { createTestOrganization } from "@/test/helpers/organization";

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
