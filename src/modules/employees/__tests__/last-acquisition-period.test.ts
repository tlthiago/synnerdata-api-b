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

  test("should return null when vacations have no acquisition period", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      acquisitionPeriodStart: null,
      acquisitionPeriodEnd: null,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2027-01-10",
      endDate: "2027-01-20",
      daysEntitled: 11,
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

  // biome-ignore lint/suspicious/noSkippedTests: intentionally skipped — re-enabled in Task 4 once period computation is wired
  test.skip("should return the acquisition period when vacation has one — re-enabled in Task 4 once periods are computed from hireDate", async () => {
    // After Task 3, createTestVacation no longer stores period fields (backend
    // computes them). Task 4 wires the computation: re-enable then and update
    // assertions to match the auto-computed values from hireDate.
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2025-01-01",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2027-02-01",
      endDate: "2027-02-10",
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

  // biome-ignore lint/suspicious/noSkippedTests: intentionally skipped — re-enabled in Task 4 once period computation is wired
  test.skip("should return the most recent acquisition period when multiple vacations exist — re-enabled in Task 4", async () => {
    // After Task 3, createTestVacation no longer stores period fields.
    // Task 4 wires computation: re-enable then and update assertions.
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2027-03-01",
      endDate: "2027-03-10",
      daysEntitled: 10,
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2027-04-01",
      endDate: "2027-04-10",
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

  // biome-ignore lint/suspicious/noSkippedTests: intentionally skipped — re-enabled in Task 4 once period computation is wired
  test.skip("should ignore deleted vacations — re-enabled in Task 4", async () => {
    // After Task 3, createTestVacation no longer stores period fields.
    // Task 4 wires computation: re-enable then and update assertions.
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2027-05-01",
      endDate: "2027-05-10",
      daysEntitled: 10,
    });

    const newerVacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2027-06-01",
      endDate: "2027-06-10",
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

  // biome-ignore lint/suspicious/noSkippedTests: intentionally skipped — re-enabled in Task 4 once period computation is wired
  test.skip("should include canceled vacations (acquisition period is a labor right) — re-enabled in Task 4", async () => {
    // After Task 3, createTestVacation no longer stores period fields.
    // Task 4 wires computation: re-enable then and update assertions.
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2027-07-01",
      endDate: "2027-07-10",
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

  // biome-ignore lint/suspicious/noSkippedTests: intentionally skipped — re-enabled in Task 4 once period computation is wired
  test.skip("should prefer vacation acquisition period over manual fields — re-enabled in Task 4", async () => {
    // After Task 3, createTestVacation no longer stores period fields (NULL).
    // The vacation's NULL period means the manual employee field is returned
    // instead of the vacation period. Task 4 wires computation: re-enable then.
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
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

    // Create vacation with a newer acquisition period
    await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2027-08-01",
      endDate: "2027-08-10",
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
});
