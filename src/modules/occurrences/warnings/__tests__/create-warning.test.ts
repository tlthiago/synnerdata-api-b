import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

const validWarningData = {
  date: "2024-01-15",
  type: "verbal",
  reason: "Atraso injustificado",
};

describe("POST /v1/warnings", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validWarningData, employeeId: "emp-123" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...validWarningData, employeeId: "emp-123" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject missing required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject invalid warning type", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          date: "2024-01-15",
          type: "invalid_type",
          reason: "Test",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject future date", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validWarningData,
          employeeId: employee.id,
          date: futureDate.toISOString().split("T")[0],
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject future acknowledgedAt", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validWarningData,
          employeeId: employee.id,
          acknowledged: true,
          acknowledgedAt: futureDate.toISOString(),
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject acknowledgedAt before warning date", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validWarningData,
          date: "2024-06-15",
          employeeId: employee.id,
          acknowledged: true,
          acknowledgedAt: "2024-06-14T10:00:00.000Z",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should create warning successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validWarningData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("warning-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBe(employee.name);
    expect(body.data.type).toBe(validWarningData.type);
    expect(body.data.reason).toBe(validWarningData.reason);
    expect(body.data.acknowledged).toBe(false);
    expect(body.data.createdBy).toBeObject();
    expect(body.data.createdBy.id).toBeString();
    expect(body.data.createdBy.name).toBeString();
    expect(body.data.updatedBy).toBeObject();
    expect(body.data.updatedBy.id).toBeString();
    expect(body.data.updatedBy.name).toBeString();
  });

  test("should reject duplicate warning with same date and type", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const warningData = {
      employeeId: employee.id,
      date: "2024-03-10",
      type: "written",
      reason: "First warning",
    };

    const first = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(warningData),
      })
    );
    expect(first.status).toBe(200);

    const second = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ...warningData, reason: "Second warning" }),
      })
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe("WARNING_DUPLICATE");
  });

  test("should allow same date with different type", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const first = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          date: "2024-04-10",
          type: "verbal",
          reason: "Verbal warning",
        }),
      })
    );
    expect(first.status).toBe(200);

    const second = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          date: "2024-04-10",
          type: "written",
          reason: "Written warning",
        }),
      })
    );
    expect(second.status).toBe(200);
  });

  test("should reject warning for TERMINATED employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await db
      .update(schema.employees)
      .set({ status: "TERMINATED" })
      .where(eq(schema.employees.id, employee.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validWarningData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_TERMINATED");
  });

  test("should reject warning for ON_VACATION employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await db
      .update(schema.employees)
      .set({ status: "ON_VACATION" })
      .where(eq(schema.employees.id, employee.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validWarningData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_ON_VACATION");
  });

  test.each([
    "viewer",
  ] as const)("should reject %s member from creating warning", async (role) => {
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
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validWarningData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create warning", async () => {
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
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validWarningData,
          employeeId: employee.id,
        }),
      })
    );

    expect(response.status).toBe(200);
  });
});
