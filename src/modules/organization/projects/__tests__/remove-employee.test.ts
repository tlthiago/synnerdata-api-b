import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestProject } from "@/test/helpers/project";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("DELETE /v1/projects/:id/employees/:employeeId", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/project-123/employees/employee-123`,
        {
          method: "DELETE",
        }
      )
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/project-123/employees/employee-123`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 for non-existent project", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/project-nonexistent/employees/employee-123`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  test("should return 404 for non-assigned employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/${project.id}/employees/${employee.id}`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_EMPLOYEE_NOT_ASSIGNED");
  });

  test("should remove employee from project", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
      employeeIds: [employee.id],
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/${project.id}/employees/${employee.id}`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.success).toBe(true);

    // Verify employee is no longer in project
    const getResponse = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
        method: "GET",
        headers,
      })
    );

    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.json();
    expect(getBody.data).toHaveLength(0);
  });

  test("should return 404 when removing already removed employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
      employeeIds: [employee.id],
    });

    // First remove
    await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/${project.id}/employees/${employee.id}`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    // Second remove attempt
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/${project.id}/employees/${employee.id}`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_EMPLOYEE_NOT_ASSIGNED");
  });

  test("should allow re-adding employee after removal", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
      employeeIds: [employee.id],
    });

    // Remove employee
    await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/${project.id}/employees/${employee.id}`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    // Re-add employee
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ employeeId: employee.id }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.employeeId).toBe(employee.id);
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from removing employee", async (role) => {
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

    const project = await createTestProject({
      organizationId,
      userId: user.id,
      employeeIds: [employee.id],
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/${project.id}/employees/${employee.id}`,
        {
          method: "DELETE",
          headers: memberResult.headers,
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to remove employee", async () => {
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

    const project = await createTestProject({
      organizationId,
      userId: user.id,
      employeeIds: [employee.id],
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/${project.id}/employees/${employee.id}`,
        {
          method: "DELETE",
          headers: memberResult.headers,
        }
      )
    );

    expect(response.status).toBe(200);
  });
});
