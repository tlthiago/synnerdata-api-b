import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { VacationService } from "@/modules/occurrences/vacations/vacation.service";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { createTestVacation } from "@/test/helpers/vacation";

const BASE_URL = env.API_URL;

describe("GET /v1/employees/:id — lastAcquisitionPeriod", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should return null when employee has no vacations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lastAcquisitionPeriod).toBeNull();
  });

  test("should return the acquisition period when vacation has one", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2025-01-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2026-02-01",
      endDate: "2026-02-10",
      daysEntitled: 10,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: "2025-01-01",
      end: "2025-12-31",
    });
  });

  test("should return the most recent acquisition period when multiple vacations exist", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-03-01",
      endDate: "2025-03-10",
      daysEntitled: 10,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-04-01",
      endDate: "2025-04-10",
      daysEntitled: 10,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
  });

  test("should ignore deleted vacations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-05-01",
      endDate: "2025-05-10",
      daysEntitled: 10,
    });

    const newerVacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-06-01",
      endDate: "2025-06-10",
      daysEntitled: 10,
    });

    await VacationService.delete(newerVacation.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
  });

  test("should include canceled vacations (acquisition period is a labor right)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-07-01",
      endDate: "2025-07-10",
      daysEntitled: 10,
      status: "canceled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
  });

  test("should fallback to manual fields when no vacations have acquisition period", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    // Set manual acquisition period via update
    await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          acquisitionPeriodStart: "2024-01-01",
          acquisitionPeriodEnd: "2024-12-31",
        }),
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
  });

  test("should prefer vacation acquisition period over manual fields", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    // Set manual acquisition period
    await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          acquisitionPeriodStart: "2024-01-01",
          acquisitionPeriodEnd: "2024-12-31",
        }),
      })
    );

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-08-01",
      endDate: "2025-08-10",
      daysEntitled: 10,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
  });
});
