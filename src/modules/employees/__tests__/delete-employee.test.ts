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

describe("DELETE /v1/employees/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/employee-123`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/employee-123`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent employee", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/employee-nonexistent`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test("should reject already deleted employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    // First delete
    await EmployeeService.delete(employee.id, organizationId, user.id);

    // Try to delete again
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_ALREADY_DELETED");
  });

  test("should soft delete employee successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(employee.id);
    expect(body.data.deletedAt).toBeDefined();

    expect(body.data.createdBy).toBeObject();
    expect(body.data.createdBy.id).toBe(user.id);
    expect(body.data.createdBy.name).toBeString();
    expect(body.data.updatedBy).toBeObject();
    expect(body.data.updatedBy.id).toBeString();
    expect(body.data.updatedBy.name).toBeString();
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from deleting employee", async (role) => {
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

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "DELETE",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to delete employee", async () => {
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

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "DELETE",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
  });
});
