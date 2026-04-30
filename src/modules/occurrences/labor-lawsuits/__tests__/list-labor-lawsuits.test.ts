import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestLaborLawsuit } from "@/test/helpers/labor-lawsuit";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/labor-lawsuits", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list when no lawsuits", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });

  test("should return lawsuits for organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestLaborLawsuit({ organizationId, userId: user.id });
    await createTestLaborLawsuit({ organizationId, userId: user.id });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(2);
    expect(body.data[0].employee).toBeDefined();
    expect(body.data[0].processNumber).toBeDefined();
    expect(body.data[0].createdBy).toBeObject();
    expect(body.data[0].createdBy.id).toBeString();
    expect(body.data[0].createdBy.name).toBeString();
    expect(body.data[0].updatedBy).toBeObject();
    expect(body.data[0].updatedBy.id).toBeString();
    expect(body.data[0].updatedBy.name).toBeString();
  });

  test("should filter by employeeId", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee: employee1 } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const { employee: employee2 } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      employeeId: employee1.id,
    });
    await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      employeeId: employee1.id,
    });
    await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      employeeId: employee2.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits?employeeId=${employee1.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(2);
    for (const lawsuit of body.data) {
      expect(lawsuit.employee.id).toBe(employee1.id);
    }
  });

  test("should not return lawsuits from other organizations", async () => {
    const user1 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const user2 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestLaborLawsuit({
      organizationId: user1.organizationId,
      userId: user1.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "GET",
        headers: user2.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(0);
  });

  test("should allow viewer to list lawsuits", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestLaborLawsuit({ organizationId, userId: user.id });

    const viewer = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewer, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits`, {
        method: "GET",
        headers: viewer.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
  });
});
