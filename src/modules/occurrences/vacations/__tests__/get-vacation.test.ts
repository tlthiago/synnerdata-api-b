import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { createTestVacation } from "@/test/helpers/vacation";

const BASE_URL = env.API_URL;

describe("GET /v1/vacations/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/vacation-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/vacation-123`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject for non-existent vacation", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/vacation-nonexistent`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_NOT_FOUND");
  });

  test("should reject for vacation from another organization", async () => {
    const { headers: headers1 } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { organizationId: org2, user: user2 } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId: org2,
      userId: user2.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId: org2,
      userId: user2.id,
      employeeId: employee.id,
      startDate: "2025-06-01",
      endDate: "2025-06-15",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "GET",
        headers: headers1,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_NOT_FOUND");
  });

  test("should get vacation successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-03-01",
      endDate: "2025-03-15",
      daysEntitled: 15,
      daysUsed: 10,
      status: "scheduled",
      notes: "Test vacation",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(vacation.id);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBe(employee.name);
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.daysEntitled).toBe(15);
    expect(body.data.daysUsed).toBe(10);
    expect(body.data.status).toBe("scheduled");
    expect(body.data.notes).toBe("Test vacation");
    expect(body.data.createdBy).toBeObject();
    expect(body.data.createdBy.id).toBeString();
    expect(body.data.createdBy.name).toBeString();
    expect(body.data.updatedBy).toBeObject();
    expect(body.data.updatedBy.id).toBeString();
    expect(body.data.updatedBy.name).toBeString();
  });

  test("should allow viewer to get vacation", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2025-06-01",
      endDate: "2025-06-15",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(vacation.id);
  });
});
