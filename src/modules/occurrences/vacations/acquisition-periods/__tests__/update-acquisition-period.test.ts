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

describe("PUT /v1/vacations/acquisition-periods/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods/acquisition-period-123`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ daysEntitled: 20 }),
        }
      )
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/vacations/acquisition-periods/acquisition-period-123`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ daysEntitled: 20 }),
        }
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
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ daysEntitled: 20 }),
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ACQUISITION_PERIOD_NOT_FOUND");
  });

  test("should update period successfully", async () => {
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
      daysEntitled: 30,
      status: "available",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods/${period.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          daysEntitled: 20,
          notes: "Updated notes",
          status: "expired",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(period.id);
    expect(body.data.daysEntitled).toBe(20);
    expect(body.data.notes).toBe("Updated notes");
    expect(body.data.status).toBe("expired");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
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
        method: "PUT",
        headers: { ...otherHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ daysEntitled: 15 }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ACQUISITION_PERIOD_NOT_FOUND");
  });

  test("should allow manager to update", async () => {
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

    const period = await createTestAcquisitionPeriod({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods/${period.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: "Updated by manager" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.notes).toBe("Updated by manager");
  });
});
