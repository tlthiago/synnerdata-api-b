import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { computePeriodsFromHireDate } from "@/modules/occurrences/vacations/period-calculation";
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
    // The service computes periods using hireDate + vacation's startDate as reference.
    const expected = computePeriodsFromHireDate(
      "2025-01-01",
      new Date("2027-02-01T00:00:00Z") // vacation startDate
    );
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: expected.acquisitionPeriodStart,
      end: expected.acquisitionPeriodEnd,
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
    // The service computes each vacation's periods independently using its own startDate.
    // getLastAcquisitionPeriod returns the one with the latest acquisitionPeriodEnd.
    const secondPeriods = computePeriodsFromHireDate(
      "2024-01-01",
      new Date("2027-04-01T00:00:00Z") // second vacation startDate
    );
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: secondPeriods.acquisitionPeriodStart,
      end: secondPeriods.acquisitionPeriodEnd,
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
    // Second vacation was deleted, so the last remaining period is from the first vacation.
    const firstPeriods = computePeriodsFromHireDate(
      "2024-01-01",
      new Date("2027-05-01T00:00:00Z") // first vacation startDate
    );
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: firstPeriods.acquisitionPeriodStart,
      end: firstPeriods.acquisitionPeriodEnd,
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
    const periods = computePeriodsFromHireDate(
      "2024-01-01",
      new Date("2027-07-01T00:00:00Z") // vacation startDate
    );
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: periods.acquisitionPeriodStart,
      end: periods.acquisitionPeriodEnd,
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

    // Create vacation — the service now computes periods using hireDate + vacation's
    // startDate as reference, ignoring the manual seed.
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
    // The vacation's periods are computed from hireDate + vacation's startDate,
    // not from the manual seed. The vacation's period takes priority over the manual seed.
    const vacationPeriods = computePeriodsFromHireDate(
      "2024-01-01",
      new Date("2027-08-01T00:00:00Z") // vacation startDate
    );
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: vacationPeriods.acquisitionPeriodStart,
      end: vacationPeriods.acquisitionPeriodEnd,
    });
  });
});
