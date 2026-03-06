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

describe("GET /v1/vacations", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty array when no vacations", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
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

  test("should list vacations for organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const period1 = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2023-01-01",
      acquisitionEnd: "2023-12-31",
      concessionStart: "2024-01-01",
      concessionEnd: "2024-12-31",
      status: "available",
    });

    const period2 = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2024-01-01",
      acquisitionEnd: "2024-12-31",
      concessionStart: "2025-01-01",
      concessionEnd: "2025-12-31",
      status: "available",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-01-01",
      endDate: "2025-01-15",
      daysUsed: 0,
      acquisitionPeriodId: period1.id,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-03-01",
      endDate: "2025-03-15",
      daysUsed: 0,
      acquisitionPeriodId: period2.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(2);
    expect(body.data[0].employee).toBeObject();
    expect(body.data[0].employee.id).toBe(employee.id);
    expect(body.data[0].employee.name).toBeString();
    expect(body.data[1].employee.id).toBe(employee.id);
  });

  test("should not return deleted vacations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const period1 = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2023-01-01",
      acquisitionEnd: "2023-12-31",
      concessionStart: "2024-01-01",
      concessionEnd: "2024-12-31",
      status: "available",
    });

    const period2 = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2024-01-01",
      acquisitionEnd: "2024-12-31",
      concessionStart: "2025-01-01",
      concessionEnd: "2025-12-31",
      status: "available",
    });

    const vacation1 = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-04-01",
      endDate: "2025-04-15",
      daysUsed: 0,
      acquisitionPeriodId: period1.id,
    });

    const vacation2 = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-06-01",
      endDate: "2025-06-15",
      daysUsed: 0,
      acquisitionPeriodId: period2.id,
    });

    await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation1.id}`, {
        method: "DELETE",
        headers,
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(vacation2.id);
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

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "GET",
        headers: headers1,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(1);
    expect(body.data[0].employee).toBeObject();
    expect(body.data[0].employee.id).toBe(employee1.id);
  });

  test("should allow viewer to list vacations", async () => {
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

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(1);
  });
});
