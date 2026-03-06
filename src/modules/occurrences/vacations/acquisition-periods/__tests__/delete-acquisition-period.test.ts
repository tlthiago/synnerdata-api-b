import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestAcquisitionPeriod } from "@/test/helpers/acquisition-period";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("DELETE /v1/vacations/acquisition-periods/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods/acquisition-period-123`,
        { method: "DELETE" }
      )
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods/acquisition-period-123`,
        { method: "DELETE", headers }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent period", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods/acquisition-period-nonexistent`,
        { method: "DELETE", headers }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ACQUISITION_PERIOD_NOT_FOUND");
  });

  test("should soft delete successfully", async () => {
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
      status: "available",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods/${period.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(period.id);
    expect(body.data.deletedAt).toBeDefined();
    expect(body.data.deletedBy).toBe(user.id);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
  });

  test("should reject re-delete of already deleted period", async () => {
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
      status: "available",
    });

    const { AcquisitionPeriodService } = await import(
      "../acquisition-period.service"
    );
    await AcquisitionPeriodService.delete(period.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods/${period.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ACQUISITION_PERIOD_ALREADY_DELETED");
  });

  test("should isolate by organization", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const period = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const { headers: otherHeaders } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods/${period.id}`, {
        method: "DELETE",
        headers: otherHeaders,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ACQUISITION_PERIOD_NOT_FOUND");
  });
});
