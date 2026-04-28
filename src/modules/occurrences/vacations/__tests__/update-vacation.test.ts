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

describe("PUT /v1/vacations/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/vacation-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/vacation-123`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test.each([
    "viewer",
  ] as const)("should reject %s member from updating vacation", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ daysUsed: 10 }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject for non-existent vacation", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/vacation-nonexistent`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ daysUsed: 10 }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_NOT_FOUND");
  });

  test("should reject for vacation from another organization", async () => {
    const { headers: headers1 } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { organizationId: org2, user: user2 } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId: org2,
      userId: user2.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId: org2,
      userId: user2.id,
      employeeId: employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: { ...headers1, "Content-Type": "application/json" },
        body: JSON.stringify({ daysUsed: 10 }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_NOT_FOUND");
  });

  test("should update vacation successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-01-01",
      endDate: "2025-01-30",
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          daysUsed: 15,
          status: "in_progress",
          notes: "Updated notes",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(vacation.id);
    expect(body.data.daysUsed).toBe(15);
    expect(body.data.status).toBe("in_progress");
    expect(body.data.notes).toBe("Updated notes");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBeString();
    expect(body.data.employee.name).toBeString();
    expect(body.data.daysEntitled).toBeNumber();
  });

  test("should reject when daysUsed exceeds daysEntitled on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-01-01",
      endDate: "2025-01-30",
      daysEntitled: 30,
      daysUsed: 0,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ daysUsed: 31 }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should allow manager to update vacation", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-01-01",
      endDate: "2025-01-30",
      daysUsed: 0,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ daysUsed: 5 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.daysUsed).toBe(5);
  });

  test("should reject overlapping vacation on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-06-01",
      endDate: "2025-06-15",
      daysUsed: 0,
      status: "scheduled",
    });

    const vacation2 = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-06-20",
      endDate: "2025-06-30",
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation2.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2025-06-10",
          endDate: "2025-06-20",
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_OVERLAP");
  });

  test("should allow updating vacation without overlap (same record)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-07-01",
      endDate: "2025-07-15",
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2025-07-02",
          endDate: "2025-07-11",
          daysEntitled: 10,
          daysUsed: 0,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("should reject when updating startDate to before hireDate", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2025-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2026-02-01",
      endDate: "2026-02-15",
      daysUsed: 0,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2024-12-20",
          endDate: "2025-01-05",
          daysEntitled: 17,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_DATE_BEFORE_HIRE");
  });

  test("should set employee status to ON_VACATION when vacation status changes to in_progress", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      })
    );

    expect(response.status).toBe(200);

    const [updatedEmployee] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id))
      .limit(1);
    expect(updatedEmployee.status).toBe("ON_VACATION");
  });

  test("should revert employee status to ACTIVE when vacation is completed", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      status: "in_progress",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      })
    );

    expect(response.status).toBe(200);

    const [updatedEmployee] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id))
      .limit(1);
    expect(updatedEmployee.status).toBe("ACTIVE");
  });

  test("should keep employee ON_VACATION if another vacation is in_progress when canceling one", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    // First vacation: in_progress
    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-03-01",
      endDate: "2025-03-10",
      daysEntitled: 10,
      daysUsed: 0,
      status: "in_progress",
    });

    // Second vacation: scheduled (non-overlapping)
    const secondVacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-07-01",
      endDate: "2025-07-10",
      daysEntitled: 10,
      daysUsed: 0,
      status: "scheduled",
    });

    // Cancel the second vacation
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${secondVacation.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "canceled" }),
      })
    );

    expect(response.status).toBe(200);

    const [updatedEmployee] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id))
      .limit(1);
    expect(updatedEmployee.status).toBe("ON_VACATION");
  });

  test("silently strips period fields from update payload (periods are immutable)", async () => {
    // Mirrors the create-side "ignores period fields in payload" test:
    // the 4 period fields are no longer in the update Zod schema, so any values
    // sent by a stale SDK are dropped before reaching the service.
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

    const createResponse = await app.handle(
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
    const { data: created } = await createResponse.json();

    const updateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: "apenas notas novas",
          acquisitionPeriodStart: "2099-01-01",
          acquisitionPeriodEnd: "2099-12-31",
          concessivePeriodStart: "2100-01-01",
          concessivePeriodEnd: "2100-12-31",
        }),
      })
    );

    expect(updateResponse.status).toBe(200);
    const { data: updated } = await updateResponse.json();
    expect(updated.notes).toBe("apenas notas novas");
    // Garbage period values in the payload are stripped; stored values unchanged.
    expect(updated.acquisitionPeriodStart).toBe(created.acquisitionPeriodStart);
    expect(updated.acquisitionPeriodEnd).toBe(created.acquisitionPeriodEnd);
    expect(updated.concessivePeriodStart).toBe(created.concessivePeriodStart);
    expect(updated.concessivePeriodEnd).toBe(created.concessivePeriodEnd);
  });

  test("should not change period fields that are not sent", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const created = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-01-01",
      endDate: "2025-01-30",
      daysUsed: 0,
      notes: "Original notes",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          daysUsed: 5,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.daysUsed).toBe(5);
    expect(body.data.notes).toBe("Original notes");
    // Period fields computed at create time must be preserved when not sent in update
    expect(body.data.acquisitionPeriodStart).toBe(
      created.acquisitionPeriodStart
    );
    expect(body.data.acquisitionPeriodEnd).toBe(created.acquisitionPeriodEnd);
    expect(body.data.concessivePeriodStart).toBe(created.concessivePeriodStart);
    expect(body.data.concessivePeriodEnd).toBe(created.concessivePeriodEnd);
  });

  test("rejects update with 422 when daysEntitled > 30", async () => {
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

    const createResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-07-01",
          endDate: "2025-07-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    const { data: created } = await createResponse.json();

    const updateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ daysEntitled: 45 }),
      })
    );

    expect(updateResponse.status).toBe(422);
  });

  test("rejects update of daysEntitled when new total exceeds 30 in aquisitivo", async () => {
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

    // First vacation: 20 days
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

    // Second vacation: 5 days (total 25)
    const secondResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-08-01",
          endDate: "2025-08-05",
          daysEntitled: 5,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    const { data: second } = await secondResponse.json();

    // Update second to 15 days → would total 35 in aquisitivo
    const updateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${second.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2025-08-01",
          endDate: "2025-08-15",
          daysEntitled: 15,
        }),
      })
    );

    expect(updateResponse.status).toBe(422);
    const body = await updateResponse.json();
    expect(body.error.code).toBe("VACATION_AQUISITIVO_EXCEEDED");
    expect(body.error.details.currentTotal).toBe(20);
    expect(body.error.details.requestedDays).toBe(15);
    expect(body.error.details.daysRemaining).toBe(10);
  });

  test("accepts update of daysEntitled when own record is excluded from sum", async () => {
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

    // Only vacation in aquisitivo: 20 days
    const createResponse = await app.handle(
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
    const { data: created } = await createResponse.json();

    // Update to 25 days — self-excluded so sum = 25 (not 45)
    const updateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2025-07-01",
          endDate: "2025-07-25",
          daysEntitled: 25,
        }),
      })
    );
    expect(updateResponse.status).toBe(200);
  });

  test("accepts update of daysEntitled within aquisitivo limit (sum still <= 30)", async () => {
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

    // 10 + 10 in same aquisitivo
    await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-07-01",
          endDate: "2025-07-10",
          daysEntitled: 10,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );

    const secondResponse = await app.handle(
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
    const { data: second } = await secondResponse.json();

    // Update second to 15 days → total 25, under limit
    const updateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${second.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2025-08-01",
          endDate: "2025-08-15",
          daysEntitled: 15,
        }),
      })
    );
    expect(updateResponse.status).toBe(200);
  });

  test("allows editing legacy record with aquisitivo already over 30 days (notes-only update)", async () => {
    // Regression guard for ensureAquisitivoLimit's skip-when-daysEntitled-absent
    // branch. The skip exists specifically so legacy records (pre-CLT-sum-check
    // or Zod-bypassed seeds) whose aquisitivo is already >30 days stay editable
    // for non-day fields (notes, status). We insert directly into the DB to
    // bypass Zod's .max(30) and the service's ensureAquisitivoLimit — mirroring
    // the homologação state where such records exist (e.g., Raquel: 35+45+7=87
    // in a single aquisitivo).
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

    const legacyVacationId = `vacation-${crypto.randomUUID()}`;
    await db.insert(schema.vacations).values({
      id: legacyVacationId,
      organizationId,
      employeeId: employee.id,
      startDate: "2025-03-01",
      endDate: "2025-04-04", // 35-day range, matches daysEntitled
      acquisitionPeriodStart: "2024-01-01",
      acquisitionPeriodEnd: "2024-12-31",
      concessivePeriodStart: "2025-01-01",
      concessivePeriodEnd: "2025-12-31",
      daysEntitled: 35, // over CLT art. 130 limit — direct insert bypasses validation
      daysUsed: 0,
      status: "scheduled",
      notes: null,
      createdBy: user.id,
    });

    const updateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${legacyVacationId}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Observação em registro legado" }),
      })
    );

    expect(updateResponse.status).toBe(200);
    const body = await updateResponse.json();
    expect(body.data.notes).toBe("Observação em registro legado");
    expect(body.data.daysEntitled).toBe(35); // untouched
  });

  test("update without daysEntitled change does not trigger the aquisitivo check", async () => {
    // Regression guard: legacy records already over-limit must still be editable
    // for non-day fields (status, notes) without being blocked by the new check.
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

    const createResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2025-07-01",
          endDate: "2025-07-15",
          daysEntitled: 15,
          daysUsed: 0,
          status: "scheduled",
        }),
      })
    );
    const { data: created } = await createResponse.json();

    // Update only notes — aquisitivo check must be skipped
    const updateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Observação atualizada" }),
      })
    );
    expect(updateResponse.status).toBe(200);
  });
});
