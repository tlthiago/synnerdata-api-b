import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/vacations/acquisition-periods", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          acquisitionStart: "2024-01-01",
          acquisitionEnd: "2024-12-31",
          concessionStart: "2025-01-01",
          concessionEnd: "2025-12-31",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          acquisitionStart: "2024-01-01",
          acquisitionEnd: "2024-12-31",
          concessionStart: "2025-01-01",
          concessionEnd: "2025-12-31",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject for non-existent employee", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-nonexistent",
          acquisitionStart: "2024-01-01",
          acquisitionEnd: "2024-12-31",
          concessionStart: "2025-01-01",
          concessionEnd: "2025-12-31",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ACQUISITION_PERIOD_INVALID_EMPLOYEE");
  });

  test("should create acquisition period successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          acquisitionStart: "2023-06-15",
          acquisitionEnd: "2024-06-14",
          concessionStart: "2024-06-15",
          concessionEnd: "2025-06-14",
          daysEntitled: 30,
          status: "available",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toStartWith("acquisition-period-");
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.daysEntitled).toBe(30);
    expect(body.data.daysUsed).toBe(0);
    expect(body.data.daysRemaining).toBe(30);
    expect(body.data.status).toBe("available");
  });

  test("should create with default values when optional fields omitted", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          acquisitionStart: "2023-01-01",
          acquisitionEnd: "2023-12-31",
          concessionStart: "2024-01-01",
          concessionEnd: "2024-12-31",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.daysEntitled).toBe(30);
    expect(body.data.status).toBe("pending");
  });

  test("should allow manager to create", async () => {
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

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/acquisition-periods`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          acquisitionStart: "2023-01-01",
          acquisitionEnd: "2023-12-31",
          concessionStart: "2024-01-01",
          concessionEnd: "2024-12-31",
        }),
      })
    );

    expect(response.status).toBe(200);
  });
});
