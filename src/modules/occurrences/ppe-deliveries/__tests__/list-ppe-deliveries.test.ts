import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestPpeDelivery } from "@/test/helpers/ppe-delivery";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/ppe-deliveries", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list when no deliveries exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
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

  test("should return all deliveries for the organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  test("should filter deliveries by employeeId", async () => {
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

    await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      employeeId: employee1.id,
    });

    await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      employeeId: employee2.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries?employeeId=${employee1.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].employee).toBeObject();
    expect(body.data[0].employee.id).toBe(employee1.id);
  });

  test("should only return deliveries from the active organization", async () => {
    const user1 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const user2 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestPpeDelivery({
      organizationId: user1.organizationId,
      userId: user1.user.id,
    });

    await createTestPpeDelivery({
      organizationId: user2.organizationId,
      userId: user2.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "GET",
        headers: user1.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    for (const delivery of body.data) {
      expect(delivery.organizationId).toBe(user1.organizationId);
    }
  });

  test("should allow viewer to list deliveries", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const owner = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestPpeDelivery({
      organizationId: owner.organizationId,
      userId: owner.user.id,
    });

    const viewer = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewer, {
      organizationId: owner.organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "GET",
        headers: viewer.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });
});
