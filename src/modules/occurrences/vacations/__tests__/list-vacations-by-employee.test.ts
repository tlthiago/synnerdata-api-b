import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestAcquisitionPeriod } from "@/test/helpers/acquisition-period";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { createTestVacation } from "@/test/helpers/vacation";

const BASE_URL = env.API_URL;

describe("GET /v1/vacations/employee/:employeeId", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/employee/employee-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/employee/employee-123`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty array when employee has no vacations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/employee/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });

  test("should return only vacations for the specified employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee: employee1 } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const { employee: employee2 } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const period1a = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee1.id,
      acquisitionStart: "2023-01-01",
      acquisitionEnd: "2023-12-31",
      concessionStart: "2024-01-01",
      concessionEnd: "2024-12-31",
    });

    const period1b = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee1.id,
      acquisitionStart: "2024-01-01",
      acquisitionEnd: "2024-12-31",
      concessionStart: "2025-01-01",
      concessionEnd: "2025-12-31",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee1.id,
      acquisitionPeriodId: period1a.id,
      startDate: "2025-07-01",
      endDate: "2025-07-15",
      daysUsed: 0,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee1.id,
      acquisitionPeriodId: period1b.id,
      startDate: "2025-09-01",
      endDate: "2025-09-10",
      daysUsed: 0,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee2.id,
      startDate: "2025-08-01",
      endDate: "2025-08-15",
      daysUsed: 0,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/employee/${employee1.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(2);

    for (const vacation of body.data) {
      expect(vacation.employee.id).toBe(employee1.id);
    }
  });

  test("should not return deleted vacations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const periodA = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2023-01-01",
      acquisitionEnd: "2023-12-31",
      concessionStart: "2024-01-01",
      concessionEnd: "2024-12-31",
    });

    const periodB = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2024-01-01",
      acquisitionEnd: "2024-12-31",
      concessionStart: "2025-01-01",
      concessionEnd: "2025-12-31",
    });

    const vacation1 = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionPeriodId: periodA.id,
      startDate: "2025-10-01",
      endDate: "2025-10-15",
      daysUsed: 0,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionPeriodId: periodB.id,
      startDate: "2025-11-01",
      endDate: "2025-11-15",
      daysUsed: 0,
    });

    // Soft delete the first vacation
    await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation1.id}`, {
        method: "DELETE",
        headers,
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/employee/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).not.toBe(vacation1.id);
  });

  test("should not return vacations from other organizations", async () => {
    const {
      headers: headers1,
      organizationId: org1,
      user: user1,
    } = await createTestUserWithOrganization({ emailVerified: true });

    const { organizationId: org2, user: user2 } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee: employee1 } = await createTestEmployee({
      organizationId: org1,
      userId: user1.id,
    });

    const { employee: employee2 } = await createTestEmployee({
      organizationId: org2,
      userId: user2.id,
    });

    await createTestVacation({
      organizationId: org1,
      userId: user1.id,
      employeeId: employee1.id,
    });

    await createTestVacation({
      organizationId: org2,
      userId: user2.id,
      employeeId: employee2.id,
    });

    // org1 user tries to see employee2's vacations (from org2) -> empty
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/employee/${employee2.id}`, {
        method: "GET",
        headers: headers1,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(0);
  });

  test("should return vacations ordered by startDate", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const periodA = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2023-01-01",
      acquisitionEnd: "2023-12-31",
      concessionStart: "2024-01-01",
      concessionEnd: "2024-12-31",
    });

    const periodB = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2024-01-01",
      acquisitionEnd: "2024-12-31",
      concessionStart: "2025-01-01",
      concessionEnd: "2025-12-31",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionPeriodId: periodA.id,
      startDate: "2025-12-01",
      endDate: "2025-12-15",
      daysUsed: 0,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionPeriodId: periodB.id,
      startDate: "2025-06-01",
      endDate: "2025-06-15",
      daysUsed: 0,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/employee/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(2);
    expect(body.data[0].startDate <= body.data[1].startDate).toBe(true);
  });
});
