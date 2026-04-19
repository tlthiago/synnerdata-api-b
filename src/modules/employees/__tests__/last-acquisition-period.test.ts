import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import {
  computePeriodsFromHireDate,
  computePeriodsFromLastAcquisition,
} from "@/modules/occurrences/vacations/period-calculation";
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
    // Vacation was created against hireDate "2025-01-01" with no prior vacations
    // → computePeriodsFromHireDate computes the current period based on today.
    const expected = computePeriodsFromHireDate("2025-01-01");
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
    const firstPeriods = computePeriodsFromHireDate("2024-01-01");
    const secondPeriods = computePeriodsFromLastAcquisition(
      firstPeriods.acquisitionPeriodEnd
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
    const firstPeriods = computePeriodsFromHireDate("2024-01-01");
    // Second vacation was deleted, so the last remaining period is from the first vacation.
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
    const periods = computePeriodsFromHireDate("2024-01-01");
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

    // Create vacation — service sees manual seed via getLastAcquisitionPeriod,
    // then computes next period from it.
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
    // Manual seed: 2024-01-01 to 2024-12-31
    // Vacation creation sees this via getLastAcquisitionPeriod, computes next period
    const vacationPeriods = computePeriodsFromLastAcquisition("2024-12-31");
    expect(body.data.lastAcquisitionPeriod).toEqual({
      start: vacationPeriods.acquisitionPeriodStart,
      end: vacationPeriods.acquisitionPeriodEnd,
    });
  });
});
