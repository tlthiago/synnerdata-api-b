import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestCpfAnalysis } from "@/test/helpers/cpf-analysis";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PUT /v1/cpf-analyses/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses/cpf-analysis-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses/cpf-analysis-123`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test.each([
    "supervisor",
    "viewer",
  ] as const)("should reject %s member from updating cpf analysis", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, userId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId,
    });

    const analysis = await createTestCpfAnalysis({
      organizationId,
      userId,
      employeeId: employee.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses/${analysis.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "approved" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject when cpf analysis does not exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses/cpf-analysis-nonexistent`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("CPF_ANALYSIS_NOT_FOUND");
  });

  test("should update cpf analysis", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId,
    });

    const analysis = await createTestCpfAnalysis({
      organizationId,
      userId,
      employeeId: employee.id,
      status: "pending",
      score: 500,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses/${analysis.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "approved",
          score: 800,
          riskLevel: "low",
          observations: "Análise aprovada após revisão",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(analysis.id);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBeString();
    expect(body.data.status).toBe("approved");
    expect(body.data.score).toBe(800);
    expect(body.data.riskLevel).toBe("low");
    expect(body.data.observations).toBe("Análise aprovada após revisão");
  });

  test("should allow manager to update cpf analysis", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, userId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId,
    });

    const analysis = await createTestCpfAnalysis({
      organizationId,
      userId,
      employeeId: employee.id,
      status: "pending",
    });

    const managerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(managerResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses/${analysis.id}`, {
        method: "PUT",
        headers: {
          ...managerResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "approved" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("approved");
  });
});
