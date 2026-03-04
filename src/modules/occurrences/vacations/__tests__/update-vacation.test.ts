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

describe("PUT /v1/vacations/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/vacation-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/vacation-123`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from updating vacation", async (role) => {
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

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ daysUsed: 10 }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject for non-existent vacation", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/vacation-nonexistent`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ daysUsed: 10 }),
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
    });

    const vacation = await createTestVacation({
      organizationId: org2,
      userId: user2.id,
      employeeId: employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: { ...headers1, "Content-Type": "application/json" },
        body: JSON.stringify({ daysUsed: 10 }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("VACATION_NOT_FOUND");
  });

  test("should update vacation successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      daysTotal: 30,
      daysUsed: 0,
      status: "scheduled",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          daysUsed: 15,
          status: "in_progress",
          notes: "Updated notes",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(vacation.id);
    expect(body.data.daysUsed).toBe(15);
    expect(body.data.status).toBe("in_progress");
    expect(body.data.notes).toBe("Updated notes");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBeString();
    expect(body.data.employee.name).toBeString();
  });

  test("should reject future acquisitionPeriodStart on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acquisitionPeriodStart: futureDateStr,
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should allow manager to update vacation", async () => {
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

    const vacation = await createTestVacation({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      daysTotal: 30,
      daysUsed: 0,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${vacation.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ daysUsed: 5 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.daysUsed).toBe(5);
  });
});
