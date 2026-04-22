import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { AuditService } from "@/modules/audit/audit.service";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /audit-logs", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return audit logs for owner", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    // Create some test audit logs
    await AuditService.log({
      action: "create",
      resource: "employee",
      resourceId: "emp-123",
      userId: user.id,
      organizationId,
      changes: { after: { name: "John Doe" } },
    });

    await AuditService.log({
      action: "update",
      resource: "employee",
      resourceId: "emp-123",
      userId: user.id,
      organizationId,
      changes: { before: { name: "John Doe" }, after: { name: "Jane Doe" } },
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  test("should filter by resource type", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    // Create audit logs for different resources
    await AuditService.log({
      action: "create",
      resource: "document",
      resourceId: "doc-123",
      userId: user.id,
      organizationId,
    });

    await AuditService.log({
      action: "create",
      resource: "employee",
      resourceId: "emp-456",
      userId: user.id,
      organizationId,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs?resource=document`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(
      body.data.every(
        (log: { resource: string }) => log.resource === "document"
      )
    ).toBe(true);
  });

  test("should support pagination with limit and offset", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    // Create several audit logs
    for (let i = 0; i < 5; i++) {
      await AuditService.log({
        action: "create",
        resource: "user",
        resourceId: `pt-${i}`,
        userId: user.id,
        organizationId,
      });
    }

    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs?resource=user&limit=2&offset=0`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
  });

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s from accessing audit logs", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("GET /audit-logs/:resource/:resourceId", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs/employee/emp-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should return resource history for owner", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const resourceId = `history-${crypto.randomUUID().slice(0, 8)}`;

    // Create audit logs for a specific resource
    await AuditService.log({
      action: "create",
      resource: "employee",
      resourceId,
      userId: user.id,
      organizationId,
      changes: { after: { name: "Initial" } },
    });

    await AuditService.log({
      action: "update",
      resource: "employee",
      resourceId,
      userId: user.id,
      organizationId,
      changes: { before: { name: "Initial" }, after: { name: "Updated" } },
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs/employee/${resourceId}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
    expect(
      body.data.every(
        (log: { resourceId: string }) => log.resourceId === resourceId
      )
    ).toBe(true);
  });

  test("should return empty array for non-existent resource", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs/employee/non-existent-id`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s from accessing resource history", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/audit-logs/employee/emp-123`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
