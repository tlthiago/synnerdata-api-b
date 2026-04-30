import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestAccident } from "@/test/helpers/accident";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/accidents", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty array when no accidents exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data).toHaveLength(0);
  });

  test("should list accidents for the organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestAccident({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    await createTestAccident({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.data[0].createdBy).toBeObject();
    expect(body.data[0].createdBy.id).toBeString();
    expect(body.data[0].createdBy.name).toBeString();
    expect(body.data[0].updatedBy).toBeObject();
    expect(body.data[0].updatedBy.id).toBeString();
    expect(body.data[0].updatedBy.name).toBeString();
  });

  test("should not return accidents from other organizations", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestAccident({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      description: "Acidente da organização 1",
    });

    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "GET",
        headers: headers2,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const hasAccidentFromOrg1 = body.data.some(
      (a: { description: string }) =>
        a.description === "Acidente da organização 1"
    );
    expect(hasAccidentFromOrg1).toBe(false);
  });

  test("should allow viewer to list accidents", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestAccident({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
  });
});
