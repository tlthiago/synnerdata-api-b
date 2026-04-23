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

describe("GET /v1/vacations/employee/:employeeId/active-cycle", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/employee/employee-123/active-cycle`,
        { method: "GET" }
      )
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/employee/employee-123/active-cycle`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("returns 404 when employee does not exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/employee/employee-nonexistent/active-cycle`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_INVALID_EMPLOYEE");
  });

  test("returns 404 when employee belongs to a different organization", async () => {
    const { headers: headers1 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { organizationId: org2, user: user2 } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId: org2,
      userId: user2.id,
      hireDate: "2024-06-10",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/employee/${employee.id}/active-cycle`,
        { method: "GET", headers: headers1 }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_INVALID_EMPLOYEE");
  });

  test("returns 422 when employee is TERMINATED", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-10",
    });

    await db
      .update(schema.employees)
      .set({ status: "TERMINATED" })
      .where(eq(schema.employees.id, employee.id));

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/employee/${employee.id}/active-cycle`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_TERMINATED");
  });

  test("returns cycle 1 for new hire with no vacations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2026-04-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/employee/${employee.id}/active-cycle`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.acquisitionPeriodStart).toBe("2026-04-01");
    expect(body.data.acquisitionPeriodEnd).toBe("2027-03-31");
    expect(body.data.concessivePeriodStart).toBe("2027-04-01");
    expect(body.data.concessivePeriodEnd).toBe("2028-03-31");
    expect(body.data.daysUsed).toBe(0);
    expect(body.data.daysRemaining).toBe(30);
  });

  test("returns active cycle with partial usage", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-07-01",
      endDate: "2025-07-15",
      daysEntitled: 15,
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/employee/${employee.id}/active-cycle`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.acquisitionPeriodStart).toBe("2024-06-01");
    expect(body.data.acquisitionPeriodEnd).toBe("2025-05-31");
    expect(body.data.concessivePeriodStart).toBe("2025-06-01");
    expect(body.data.concessivePeriodEnd).toBe("2026-05-31");
    expect(body.data.daysUsed).toBe(15);
    expect(body.data.daysRemaining).toBe(15);
  });

  test("advances to next cycle after current cycle reaches 30 days used", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-06-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-07-01",
      endDate: "2025-07-30",
      daysEntitled: 30,
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/employee/${employee.id}/active-cycle`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.acquisitionPeriodStart).toBe("2025-06-01");
    expect(body.data.acquisitionPeriodEnd).toBe("2026-05-31");
    expect(body.data.concessivePeriodStart).toBe("2026-06-01");
    expect(body.data.concessivePeriodEnd).toBe("2027-05-31");
    expect(body.data.daysUsed).toBe(0);
    expect(body.data.daysRemaining).toBe(30);
  });
});
