import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestMedicalCertificate } from "@/test/helpers/medical-certificate";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/medical-certificates", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          startDate: "2024-01-01",
          endDate: "2024-01-05",
          daysOff: 5,
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          startDate: "2024-01-01",
          endDate: "2024-01-05",
          daysOff: 5,
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from creating medical certificate", async (role) => {
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
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: "employee-123",
          startDate: "2024-01-01",
          endDate: "2024-01-05",
          daysOff: 5,
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
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-nonexistent",
          startDate: "2024-01-01",
          endDate: "2024-01-05",
          daysOff: 5,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("MEDICAL_CERTIFICATE_INVALID_EMPLOYEE");
  });

  test("should reject when startDate is after endDate", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-01-10",
          endDate: "2024-01-05",
          daysOff: 5,
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject when daysOff is zero or negative", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-01-01",
          endDate: "2024-01-05",
          daysOff: 0,
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject future startDate", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: futureDateStr,
          endDate: futureDateStr,
          daysOff: 1,
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should accept future endDate when startDate is today", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 4);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: todayStr,
          endDate: futureDateStr,
          daysOff: 5,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.startDate).toBe(todayStr);
    expect(body.data.endDate).toBe(futureDateStr);
    expect(body.data.daysOff).toBe(5);
  });

  test("should reject when daysOff does not match date range", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-01-01",
          endDate: "2024-01-05",
          daysOff: 10,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_DAYS_OFF");
  });

  test("should create medical certificate successfully", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-01-01",
          endDate: "2024-01-05",
          daysOff: 5,
          cid: "A00.1",
          doctorName: "Dr. João Silva",
          doctorCrm: "123456",
          notes: "Test notes",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("medical-certificate-");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBeString();
    expect(body.data.startDate).toBe("2024-01-01");
    expect(body.data.endDate).toBe("2024-01-05");
    expect(body.data.daysOff).toBe(5);
    expect(body.data.cid).toBe("A00.1");
    expect(body.data.doctorName).toBe("Dr. João Silva");
  });

  test("should allow manager to create medical certificate", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, userId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({ organizationId, userId });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-01-01",
          endDate: "2024-01-03",
          daysOff: 3,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should reject overlapping medical certificate", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
      startDate: "2024-02-01",
      endDate: "2024-02-10",
      daysOff: 10,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-02-05",
          endDate: "2024-02-15",
          daysOff: 11,
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("MEDICAL_CERTIFICATE_OVERLAP");
  });

  test("should reject when employee is TERMINATED", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    await db
      .update(schema.employees)
      .set({ status: "TERMINATED" })
      .where(eq(schema.employees.id, employee.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-04-01",
          endDate: "2024-04-05",
          daysOff: 5,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_TERMINATED");
  });

  test("should reject when employee is ON_VACATION", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    await db
      .update(schema.employees)
      .set({ status: "ON_VACATION" })
      .where(eq(schema.employees.id, employee.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2024-05-01",
          endDate: "2024-05-05",
          daysOff: 5,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_ON_VACATION");
  });
});
