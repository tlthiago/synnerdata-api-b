import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestTermination } from "@/test/helpers/termination";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/terminations", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          terminationDate: "2024-01-30",
          type: "RESIGNATION",
          lastWorkingDay: "2024-01-15",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          terminationDate: "2024-01-30",
          type: "RESIGNATION",
          lastWorkingDay: "2024-01-15",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject viewer member from creating termination", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: "employee-123",
          terminationDate: "2024-01-30",
          type: "RESIGNATION",
          lastWorkingDay: "2024-01-15",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject non-existent employee", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-nonexistent",
          terminationDate: "2024-01-30",
          type: "RESIGNATION",
          lastWorkingDay: "2024-01-15",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("TERMINATION_INVALID_EMPLOYEE");
  });

  test("should reject employee from another organization", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const otherOrgResult = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee: otherEmployee } = await createTestEmployee({
      organizationId: otherOrgResult.organizationId,
      userId: otherOrgResult.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: otherEmployee.id,
          terminationDate: "2024-01-30",
          type: "RESIGNATION",
          lastWorkingDay: "2024-01-15",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("TERMINATION_INVALID_EMPLOYEE");
  });

  test("should reject missing required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          terminationDate: "2024-01-15",
          type: "RESIGNATION",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should create termination successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: "2024-02-15",
          type: "RESIGNATION",
          reason: "Pedido de demissão para nova oportunidade",
          noticePeriodDays: 30,
          noticePeriodWorked: true,
          lastWorkingDay: "2024-02-15",
          notes: "Funcionário exemplar, saída amigável",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toStartWith("termination-");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBeString();
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.terminationDate).toBe("2024-02-15");
    expect(body.data.type).toBe("RESIGNATION");
    expect(body.data.reason).toBe("Pedido de demissão para nova oportunidade");
    expect(body.data.noticePeriodDays).toBe(30);
    expect(body.data.noticePeriodWorked).toBe(true);
    expect(body.data.lastWorkingDay).toBe("2024-02-15");
    expect(body.data.notes).toBe("Funcionário exemplar, saída amigável");
  });

  test("should allow manager to create termination", async () => {
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

    const managerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(managerResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: {
          ...managerResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: "2024-01-30",
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: "2024-01-15",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.type).toBe("DISMISSAL_WITHOUT_CAUSE");
  });

  test("should create termination with minimal required fields", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: "2024-01-30",
          type: "MUTUAL_AGREEMENT",
          lastWorkingDay: "2024-01-15",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toStartWith("termination-");
    expect(body.data.reason).toBeNull();
    expect(body.data.noticePeriodDays).toBeNull();
    expect(body.data.noticePeriodWorked).toBe(false);
    expect(body.data.notes).toBeNull();
  });

  test("should return 409 when creating second termination for same employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestTermination({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: "2024-03-15",
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: "2024-03-01",
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("TERMINATION_ALREADY_EXISTS");
  });

  test("should set employee status to TERMINATED after creating termination", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const [beforeEmployee] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id))
      .limit(1);
    expect(beforeEmployee.status).toBe("ACTIVE");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: "2024-02-15",
          type: "RESIGNATION",
          lastWorkingDay: "2024-02-15",
        }),
      })
    );

    expect(response.status).toBe(200);

    const [afterEmployee] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id))
      .limit(1);
    expect(afterEmployee.status).toBe("TERMINATED");
  });

  test("should allow creating termination when previous was soft-deleted", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const existingTermination = await createTestTermination({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    await db
      .update(schema.terminations)
      .set({ deletedAt: new Date(), deletedBy: user.id })
      .where(eq(schema.terminations.id, existingTermination.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: "2024-03-15",
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: "2024-03-01",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.employee.id).toBe(employee.id);
  });
});
