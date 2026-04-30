import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { EmployeeService } from "../employee.service";

const BASE_URL = env.API_URL;

describe("GET /v1/employees", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list when no employees exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
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

  test("should return employees for organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { dependencies } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestEmployee({
      organizationId,
      userId: user.id,
      dependencies,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(2);
    expect(body.data[0].organizationId).toBe(organizationId);
    expect(body.data[1].organizationId).toBe(organizationId);

    expect(body.data[0].createdBy).toBeObject();
    expect(body.data[0].createdBy.id).toBeString();
    expect(body.data[0].createdBy.name).toBeString();
    expect(body.data[0].updatedBy).toBeObject();
    expect(body.data[0].updatedBy.id).toBeString();
    expect(body.data[0].updatedBy.name).toBeString();
  });

  test("should not return employees from other organizations", async () => {
    const {
      headers: headers1,
      organizationId: org1,
      user: user1,
    } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { organizationId: org2, user: user2 } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestEmployee({
      organizationId: org1,
      userId: user1.id,
      name: "Funcionário Org1",
    });

    await createTestEmployee({
      organizationId: org2,
      userId: user2.id,
      name: "Funcionário Org2",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "GET",
        headers: headers1,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(1);
    expect(body.data[0].organizationId).toBe(org1);
    expect(body.data[0].name).toBe("Funcionário Org1");
  });

  test("should not return deleted employees", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      name: "Funcionário Deletado",
    });

    await EmployeeService.delete(employee.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(0);
  });

  test("should filter by single status", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee: active, dependencies } = await createTestEmployee({
      organizationId,
      userId: user.id,
      name: "Ativo",
    });

    const { employee: toTerminate } = await createTestEmployee({
      organizationId,
      userId: user.id,
      name: "Demitido",
      dependencies,
    });

    await EmployeeService.updateStatus(toTerminate.id, organizationId, {
      status: "TERMINATED",
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees?status=ACTIVE`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(active.id);
    expect(body.data[0].status).toBe("ACTIVE");
  });

  test("should filter by multiple statuses", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { dependencies } = await createTestEmployee({
      organizationId,
      userId: user.id,
      name: "Ativo",
    });

    const { employee: onLeave } = await createTestEmployee({
      organizationId,
      userId: user.id,
      name: "Afastado",
      dependencies,
    });

    await EmployeeService.updateStatus(onLeave.id, organizationId, {
      status: "ON_LEAVE",
      userId: user.id,
    });

    const { employee: terminated } = await createTestEmployee({
      organizationId,
      userId: user.id,
      name: "Demitido",
      dependencies,
    });

    await EmployeeService.updateStatus(terminated.id, organizationId, {
      status: "TERMINATED",
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees?status=ACTIVE,ON_LEAVE`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(2);
    const statuses = body.data.map((e: { status: string }) => e.status);
    expect(statuses).toContain("ACTIVE");
    expect(statuses).toContain("ON_LEAVE");
  });

  test("should return all employees when no status filter", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { dependencies } = await createTestEmployee({
      organizationId,
      userId: user.id,
      name: "Ativo",
    });

    const { employee: terminated } = await createTestEmployee({
      organizationId,
      userId: user.id,
      name: "Demitido",
      dependencies,
    });

    await EmployeeService.updateStatus(terminated.id, organizationId, {
      status: "TERMINATED",
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.length).toBe(2);
  });

  test("should allow viewer to list employees", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestEmployee({
      organizationId,
      userId: user.id,
      name: "Funcionário Viewer Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
  });
});
