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
import { createTestVacation } from "@/test/helpers/vacation";

const BASE_URL = env.API_URL;

describe("POST /v1/vacations", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          startDate: "2025-01-01",
          endDate: "2025-01-15",
          daysEntitled: 15,
          daysUsed: 15,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          startDate: "2025-01-01",
          endDate: "2025-01-15",
          daysEntitled: 15,
          daysUsed: 15,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test.each([
    "viewer",
  ] as const)("should reject %s member from creating vacation", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: "employee-123",
          startDate: "2025-01-01",
          endDate: "2025-01-15",
          daysEntitled: 15,
          daysUsed: 15,
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject for non-existent employee", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-nonexistent",
          startDate: "2025-01-01",
          endDate: "2025-01-15",
          daysEntitled: 15,
          daysUsed: 15,
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_INVALID_EMPLOYEE");
  });

  test("should reject with invalid date range (startDate > endDate)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-01-01",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-01-15",
          endDate: "2025-01-01",
          daysEntitled: 15,
          daysUsed: 15,
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject when daysUsed exceeds daysEntitled", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-01-01",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-01-01",
          endDate: "2025-01-15",
          daysEntitled: 15,
          daysUsed: 20,
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should create vacation successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-01-01",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-01-01",
          endDate: "2025-01-15",
          daysEntitled: 15,
          daysUsed: 10,
          status: "scheduled",
          notes: "Summer vacation",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toStartWith("vacation-");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBe(employee.name);
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.daysEntitled).toBe(15);
    expect(body.data.daysUsed).toBe(10);
    expect(body.data.status).toBe("scheduled");
    expect(body.data.notes).toBe("Summer vacation");
  });

  test("should allow manager to create vacation", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-01-01",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-02-01",
          endDate: "2025-02-15",
          daysEntitled: 15,
          daysUsed: 0,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
  });

  test("should reject overlapping vacation", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-01-01",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-03-01",
      endDate: "2025-03-15",
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-03-10",
          endDate: "2025-03-20",
          daysEntitled: 11,
          daysUsed: 0,
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_OVERLAP");
  });

  test("should allow overlapping vacation when existing is canceled", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-01-01",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-04-01",
      endDate: "2025-04-15",
      daysUsed: 0,
      status: "canceled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-04-01",
          endDate: "2025-04-15",
          daysEntitled: 15,
          daysUsed: 0,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("should reject when employee is TERMINATED", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-01-01",
    });

    await db
      .update(schema.employees)
      .set({ status: "TERMINATED" })
      .where(eq(schema.employees.id, employee.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-05-01",
          endDate: "2025-05-15",
          daysEntitled: 15,
          daysUsed: 0,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_TERMINATED");
  });

  test("should allow creating vacation when employee is ON_VACATION", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-01-01",
    });

    await db
      .update(schema.employees)
      .set({ status: "ON_VACATION" })
      .where(eq(schema.employees.id, employee.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-06-01",
          endDate: "2025-06-15",
          daysEntitled: 15,
          daysUsed: 0,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("should reject when startDate is before employee hireDate", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2025-01-01",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-12-20",
          endDate: "2025-01-05",
          daysEntitled: 17,
          daysUsed: 0,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_DATE_BEFORE_HIRE");
  });

  test("computes periods from hireDate for employee without prior vacations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-07-01",
          endDate: "2026-07-30",
          daysEntitled: 30,
          daysUsed: 30,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // startDate=2026-07-01 as reference: completed=2 (2025-06-10 and 2026-06-10 anniversaries), index=1
    // acquisitionPeriodStart = addMonths("2024-06-10", 12) = "2025-06-10"
    // acquisitionPeriodEnd = addDays(addMonths("2024-06-10", 24), -1) = "2026-06-09"
    // concessivePeriodStart = "2026-06-10", concessivePeriodEnd = "2027-06-09"
    expect(body.data.acquisitionPeriodStart).toBe("2025-06-10");
    expect(body.data.acquisitionPeriodEnd).toBe("2026-06-09");
    expect(body.data.concessivePeriodStart).toBe("2026-06-10");
    expect(body.data.concessivePeriodEnd).toBe("2027-06-09");
  });

  test("ignores employee manual seed and computes periods from hireDate + startDate", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: "2025-04-19",
      acquisitionPeriodEnd: "2026-04-18",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-10-06",
          endDate: "2026-11-04",
          daysEntitled: 30,
          daysUsed: 30,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // Manual seed on employee is now ignored; periods always computed
    // from hireDate + vacation.startDate.
    expect(body.data.acquisitionPeriodStart).toBe("2025-06-10");
    expect(body.data.acquisitionPeriodEnd).toBe("2026-06-09");
    expect(body.data.concessivePeriodStart).toBe("2026-06-10");
    expect(body.data.concessivePeriodEnd).toBe("2027-06-09");
  });

  test("ignores period fields in payload and computes from backend", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: "2025-04-19",
      acquisitionPeriodEnd: "2026-04-18",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-10-06",
          endDate: "2026-11-04",
          daysEntitled: 30,
          daysUsed: 30,
          status: "scheduled",
          acquisitionPeriodStart: "2099-01-01",
          acquisitionPeriodEnd: "2099-12-31",
          concessivePeriodStart: "2100-01-01",
          concessivePeriodEnd: "2100-12-31",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // Zod strips the 4 garbage values; backend computes from hireDate + startDate.
    expect(body.data.acquisitionPeriodStart).toBe("2025-06-10");
    expect(body.data.acquisitionPeriodEnd).toBe("2026-06-09");
    expect(body.data.concessivePeriodStart).toBe("2026-06-10");
    expect(body.data.concessivePeriodEnd).toBe("2027-06-09");
  });

  test("rejects with 422 when vacation startDate is before the first anniversary", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2025-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    // startDate is before hireDate + 12 months (no acquired rights yet)
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-03-01",
          endDate: "2026-03-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_NO_RIGHTS");
  });

  test("should set employee status to VACATION_SCHEDULED after creating vacation", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const startDate = "2027-06-01";
    const endDate = "2027-06-10";

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate,
          endDate,
          daysEntitled: 10,
          daysUsed: 0,
        }),
      })
    );

    expect(response.status).toBe(200);

    const [updatedEmployee] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id))
      .limit(1);
    expect(updatedEmployee.status).toBe("VACATION_SCHEDULED");
  });

  test("rejects with 422 when daysEntitled > 30 (CLT art. 130 limit)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-07-01",
          endDate: "2026-08-14",
          daysEntitled: 45,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("accepts daysEntitled = 30 (upper boundary)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-07-01",
          endDate: "2026-07-30",
          daysEntitled: 30,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
  });
});
