import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("Employee cross-organization access (BOLA — RU-9)", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should return 404 on GET when employee belongs to another organization", async () => {
    const orgA = await createTestUserWithOrganization({ emailVerified: true });
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId: orgA.organizationId,
      userId: orgA.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "GET",
        headers: orgB.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test("LIST from a different organization does not include employees from another org", async () => {
    const orgA = await createTestUserWithOrganization({ emailVerified: true });
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const { employee: orgAEmployee } = await createTestEmployee({
      organizationId: orgA.organizationId,
      userId: orgA.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees`, {
        method: "GET",
        headers: orgB.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    const ids = (body.data as Array<{ id: string }>).map((e) => e.id);
    expect(ids).not.toContain(orgAEmployee.id);
  });

  test("should return 404 on PUT when employee belongs to another organization", async () => {
    const orgA = await createTestUserWithOrganization({ emailVerified: true });
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId: orgA.organizationId,
      userId: orgA.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { ...orgB.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Cross-org Attacker" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test("should return 404 on DELETE when employee belongs to another organization", async () => {
    const orgA = await createTestUserWithOrganization({ emailVerified: true });
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId: orgA.organizationId,
      userId: orgA.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "DELETE",
        headers: orgB.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });
});
