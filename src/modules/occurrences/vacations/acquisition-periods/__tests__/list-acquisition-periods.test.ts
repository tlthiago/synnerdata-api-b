import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestAcquisitionPeriod } from "@/test/helpers/acquisition-period";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/vacations/acquisition-periods", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods?employeeId=employee-123`,
        { method: "GET" }
      )
    );

    expect(response.status).toBe(401);
  });

  test("should return only available periods for employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2022-01-01",
      acquisitionEnd: "2022-12-31",
      concessionStart: "2023-01-01",
      concessionEnd: "2023-12-31",
      status: "available",
    });

    await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2023-01-01",
      acquisitionEnd: "2023-12-31",
      concessionStart: "2024-01-01",
      concessionEnd: "2024-12-31",
      status: "pending",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods?employeeId=${employee.id}`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();

    const statuses = body.data.map((p: { status: string }) => p.status);
    for (const s of statuses) {
      expect(s).toBe("available");
    }
  });

  test("should return empty array when no available periods", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      status: "pending",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods?employeeId=${employee.id}`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });
});

describe("GET /v1/vacations/acquisition-periods/employee/:employeeId", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods/employee/employee-123`,
        { method: "GET" }
      )
    );

    expect(response.status).toBe(401);
  });

  test("should return all periods for employee (all statuses)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2021-01-01",
      acquisitionEnd: "2021-12-31",
      concessionStart: "2022-01-01",
      concessionEnd: "2022-12-31",
      status: "available",
    });

    await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2022-01-01",
      acquisitionEnd: "2022-12-31",
      concessionStart: "2023-01-01",
      concessionEnd: "2023-12-31",
      status: "pending",
    });

    await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2020-01-01",
      acquisitionEnd: "2020-12-31",
      concessionStart: "2021-01-01",
      concessionEnd: "2021-12-31",
      status: "expired",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods/employee/${employee.id}`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThanOrEqual(3);

    const statuses = new Set(
      body.data.map((p: { status: string }) => p.status)
    );
    expect(statuses.has("available")).toBe(true);
    expect(statuses.has("pending")).toBe(true);
    expect(statuses.has("expired")).toBe(true);
  });

  test("should exclude soft-deleted periods", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const period = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2019-01-01",
      acquisitionEnd: "2019-12-31",
      concessionStart: "2020-01-01",
      concessionEnd: "2020-12-31",
      status: "available",
    });

    const { AcquisitionPeriodService } = await import(
      "../acquisition-period.service"
    );
    await AcquisitionPeriodService.delete(period.id, organizationId, user.id);

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods/employee/${employee.id}`,
        { method: "GET", headers }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const hasDeleted = body.data.some(
      (p: { id: string }) => p.id === period.id
    );
    expect(hasDeleted).toBe(false);
  });

  test("should isolate by organization", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      acquisitionStart: "2018-01-01",
      acquisitionEnd: "2018-12-31",
      concessionStart: "2019-01-01",
      concessionEnd: "2019-12-31",
      status: "available",
    });

    const { headers: otherHeaders } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods/employee/${employee.id}`,
        { method: "GET", headers: otherHeaders }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(0);
  });
});
