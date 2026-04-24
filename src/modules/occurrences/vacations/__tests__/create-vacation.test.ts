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
          startDate: "2021-01-01",
          endDate: "2021-01-15",
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
          startDate: "2021-02-01",
          endDate: "2021-02-15",
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
      startDate: "2021-03-01",
      endDate: "2021-03-15",
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2021-03-10",
          endDate: "2021-03-20",
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
      startDate: "2021-04-01",
      endDate: "2021-04-15",
      daysUsed: 0,
      status: "canceled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2021-04-01",
          endDate: "2021-04-15",
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
          startDate: "2021-06-01",
          endDate: "2021-06-15",
          daysEntitled: 15,
          daysUsed: 0,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("accepts cadastro with startDate after concessivoEnd of resolved cycle (pago via multa, no prior history)", async () => {
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
          startDate: "2027-02-01",
          endDate: "2027-02-17",
          daysEntitled: 17,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.startDate).toBe("2027-02-01");
    expect(body.data.endDate).toBe("2027-02-17");
    expect(body.data.daysEntitled).toBe(17);
    expect(body.data.acquisitionPeriodStart).toBe("2025-01-01");
    expect(body.data.acquisitionPeriodEnd).toBe("2025-12-31");
    expect(body.data.concessivePeriodStart).toBe("2026-01-01");
    expect(body.data.concessivePeriodEnd).toBe("2026-12-31");
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
          startDate: "2025-07-01",
          endDate: "2025-07-30",
          daysEntitled: 30,
          daysUsed: 30,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.acquisitionPeriodStart).toBe("2024-06-10");
    expect(body.data.acquisitionPeriodEnd).toBe("2025-06-09");
    expect(body.data.concessivePeriodStart).toBe("2025-06-10");
    expect(body.data.concessivePeriodEnd).toBe("2026-06-09");
  });

  test("ignores employee manual seed and derives cycle from history (none here)", async () => {
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
          startDate: "2025-10-06",
          endDate: "2025-11-04",
          daysEntitled: 30,
          daysUsed: 30,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.acquisitionPeriodStart).toBe("2024-06-10");
    expect(body.data.acquisitionPeriodEnd).toBe("2025-06-09");
    expect(body.data.concessivePeriodStart).toBe("2025-06-10");
    expect(body.data.concessivePeriodEnd).toBe("2026-06-09");
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
          startDate: "2025-10-06",
          endDate: "2025-11-04",
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
    expect(body.data.acquisitionPeriodStart).toBe("2024-06-10");
    expect(body.data.acquisitionPeriodEnd).toBe("2025-06-09");
    expect(body.data.concessivePeriodStart).toBe("2025-06-10");
    expect(body.data.concessivePeriodEnd).toBe("2026-06-09");
  });

  test("accepts cadastro with startDate after concessivoEnd of first cycle (pago via multa for new hire)", async () => {
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

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2027-08-01",
          endDate: "2027-08-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.startDate).toBe("2027-08-01");
    expect(body.data.endDate).toBe("2027-08-10");
    expect(body.data.daysEntitled).toBe(10);
    expect(body.data.acquisitionPeriodStart).toBe("2025-06-10");
    expect(body.data.acquisitionPeriodEnd).toBe("2026-06-09");
    expect(body.data.concessivePeriodStart).toBe("2026-06-10");
    expect(body.data.concessivePeriodEnd).toBe("2027-06-09");
  });

  test("allows creating vacation for new hire (< 1 anniversary) when startDate is within first future concessivo", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2026-04-22",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2027-05-01",
          endDate: "2027-05-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.acquisitionPeriodStart).toBe("2026-04-22");
    expect(body.data.acquisitionPeriodEnd).toBe("2027-04-21");
    expect(body.data.concessivePeriodStart).toBe("2027-04-22");
    expect(body.data.concessivePeriodEnd).toBe("2028-04-21");
  });

  test("uses next cycle when the previous cycle is filled with 30 days", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-04-22",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      daysEntitled: 30,
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-05-01",
          endDate: "2026-05-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.acquisitionPeriodStart).toBe("2025-04-22");
    expect(body.data.acquisitionPeriodEnd).toBe("2026-04-21");
    expect(body.data.concessivePeriodStart).toBe("2026-04-22");
    expect(body.data.concessivePeriodEnd).toBe("2027-04-21");
  });

  test("partial usage in past cycle keeps new registration anchored to that same cycle", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2023-04-22",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await db.insert(schema.vacations).values({
      id: `vacation-${crypto.randomUUID()}`,
      organizationId,
      employeeId: employee.id,
      startDate: "2024-06-01",
      endDate: "2024-06-15",
      acquisitionPeriodStart: "2023-04-22",
      acquisitionPeriodEnd: "2024-04-21",
      concessivePeriodStart: "2024-04-22",
      concessivePeriodEnd: "2025-04-21",
      daysEntitled: 15,
      daysUsed: 15,
      status: "completed",
      createdBy: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-09-01",
          endDate: "2024-09-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.acquisitionPeriodStart).toBe("2023-04-22");
    expect(body.data.acquisitionPeriodEnd).toBe("2024-04-21");
    expect(body.data.concessivePeriodStart).toBe("2024-04-22");
    expect(body.data.concessivePeriodEnd).toBe("2025-04-21");
  });

  test("accepts cadastro with startDate after concessivoEnd of next resolved cycle (pago via multa, with history)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2023-01-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2024-06-01",
      endDate: "2024-06-30",
      daysEntitled: 30,
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-02-01",
          endDate: "2026-02-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.startDate).toBe("2026-02-01");
    expect(body.data.endDate).toBe("2026-02-10");
    expect(body.data.daysEntitled).toBe(10);
    expect(body.data.acquisitionPeriodStart).toBe("2024-01-01");
    expect(body.data.acquisitionPeriodEnd).toBe("2024-12-31");
    expect(body.data.concessivePeriodStart).toBe("2025-01-01");
    expect(body.data.concessivePeriodEnd).toBe("2025-12-31");
  });

  test("accepts cadastro with startDate far in the future beyond the resolved cycle's concessivo (pago via multa scenario)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-05-01",
          endDate: "2026-05-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.startDate).toBe("2026-05-01");
    expect(body.data.endDate).toBe("2026-05-10");
    expect(body.data.daysEntitled).toBe(10);
    expect(body.data.acquisitionPeriodStart).toBe("2024-01-01");
    expect(body.data.acquisitionPeriodEnd).toBe("2024-12-31");
    expect(body.data.concessivePeriodStart).toBe("2025-01-01");
    expect(body.data.concessivePeriodEnd).toBe("2025-12-31");
  });

  test("should set employee status to VACATION_SCHEDULED after creating vacation", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-01-01",
    });

    const startDate = "2021-06-01";
    const endDate = "2021-06-10";

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
          startDate: "2025-07-01",
          endDate: "2025-07-30",
          daysEntitled: 30,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("accepts 2nd vacation in same aquisitivo when sum <= 30", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const first = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-07-01",
          endDate: "2025-07-20",
          daysEntitled: 20,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    expect(first.status).toBe(200);

    const second = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-08-01",
          endDate: "2025-08-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    expect(second.status).toBe(200);
  });

  test("rejects 2nd vacation in same aquisitivo when sum > 30 (CLT art. 130)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-07-01",
          endDate: "2025-07-20",
          daysEntitled: 20,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    const second = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-08-01",
          endDate: "2025-08-15",
          daysEntitled: 15,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(second.status).toBe(422);
    const body = await second.json();
    expect(body.error.code).toBe("VACATION_AQUISITIVO_EXCEEDED");
    expect(body.error.details.daysRemaining).toBe(10);
    expect(body.error.details.currentTotal).toBe(20);
    expect(body.error.details.requestedDays).toBe(15);
  });

  test("boundary: accepts 2nd vacation when sum equals exactly 30", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-07-01",
          endDate: "2025-07-29",
          daysEntitled: 29,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    const second = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-08-05",
          endDate: "2025-08-05",
          daysEntitled: 1,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    expect(second.status).toBe(200);
  });

  test("limit is scoped per aquisitivo — consecutive aquisitivos are independent", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    // 1st aquisitivo: 2024-06-10 / 2025-06-09 (startDate 2026-05-01 → completed=1, index=0)
    const firstAq = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2026-05-01",
          endDate: "2026-05-30", // 30 days
          daysEntitled: 30,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    expect(firstAq.status).toBe(200);

    // 2nd aquisitivo: 2025-06-10 / 2026-06-09 (startDate 2027-02-01 → completed=2, index=1)
    const secondAq = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2027-02-01",
          endDate: "2027-03-02", // 30 days in a different aquisitivo
          daysEntitled: 30,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    expect(secondAq.status).toBe(200);
  });

  test("canceled vacations do not count toward the aquisitivo sum", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const firstResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-07-01",
          endDate: "2025-07-30",
          daysEntitled: 30,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    expect(firstResponse.status).toBe(200);
    const { data: first } = await firstResponse.json();

    const cancelResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${first.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "canceled" }),
      })
    );
    expect(cancelResponse.status).toBe(200);

    const second = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-09-01",
          endDate: "2025-09-30",
          daysEntitled: 30,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    expect(second.status).toBe(200);
  });

  test("deleted vacations do not count toward the aquisitivo sum", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const firstResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-07-01",
          endDate: "2025-07-30",
          daysEntitled: 30,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    expect(firstResponse.status).toBe(200);
    const { data: first } = await firstResponse.json();

    const deleteResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${first.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResponse.status).toBe(200);

    const second = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-09-01",
          endDate: "2025-09-30",
          daysEntitled: 30,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    expect(second.status).toBe(200);
  });

  test("employer data migration: first vacation registration lands in cycle 1 derived from old hireDate", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2019-02-15",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2020-03-01",
          endDate: "2020-03-15",
          daysEntitled: 15,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.acquisitionPeriodStart).toBe("2019-02-15");
    expect(body.data.acquisitionPeriodEnd).toBe("2020-02-14");
    expect(body.data.concessivePeriodStart).toBe("2020-02-15");
    expect(body.data.concessivePeriodEnd).toBe("2021-02-14");
  });
});
