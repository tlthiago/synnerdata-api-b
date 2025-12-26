import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  addEmployeeToProject,
  createTestProject,
} from "@/test/helpers/project";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/projects/:id/employees", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/project-123/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: "employee-123" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/project-123/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ employeeId: "employee-123" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 for non-existent project", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/project-nonexistent/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ employeeId: employee.id }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  test("should return 404 for non-existent employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ employeeId: "employee-nonexistent" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test("should add employee to project", async () => {
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

    expect(body.success).toBe(true);
    expect(body.data.projectId).toBe(project.id);
    expect(body.data.employeeId).toBe(employee.id);
    expect(body.data.createdAt).toBeDefined();
  });

  test("should reject duplicate employee assignment", async () => {
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

    // Add employee first
    await addEmployeeToProject(
      project.id,
      employee.id,
      organizationId,
      user.id
    );

    // Try to add again
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

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_EMPLOYEE_ALREADY_EXISTS");
  });

  test("should reject employee from different organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    // Create employee in different organization
    const { organizationId: otherOrgId, user: otherUser } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee: otherEmployee } = await createTestEmployee({
      organizationId: otherOrgId,
      userId: otherUser.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ employeeId: otherEmployee.id }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from adding employee", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
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

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ employeeId: employee.id }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to add employee", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
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

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ employeeId: employee.id }),
      })
    );

    expect(response.status).toBe(200);
  });
});

describe("GET /v1/projects/:id/employees", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/project-123/employees`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should return empty array when no employees assigned", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
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

  test("should return assigned employees", async () => {
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

    const project = await createTestProject({
      organizationId,
      userId: user.id,
      employeeIds: [employee1.id, employee2.id],
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data).toHaveLength(2);

    const employeeIds = body.data.map((e: { id: string }) => e.id);
    expect(employeeIds).toContain(employee1.id);
    expect(employeeIds).toContain(employee2.id);
  });
});
