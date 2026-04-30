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

describe("GET /v1/cpf-analyses", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list when no cpf analyses exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });

  test("should list cpf analyses for the organization", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId,
    });

    await createTestCpfAnalysis({
      organizationId,
      userId,
      employeeId: employee.id,
      analysisDate: "2025-06-15",
      status: "approved",
    });

    await createTestCpfAnalysis({
      organizationId,
      userId,
      employeeId: employee.id,
      analysisDate: "2025-06-16",
      status: "pending",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(2);
    expect(body.data[0].id).toStartWith("cpf-analysis-");
    expect(body.data[0].employee).toBeObject();
    expect(body.data[0].employee.id).toBe(employee.id);
    expect(body.data[0].employee.name).toBeString();
    expect(body.data[0].createdBy).toBeObject();
    expect(body.data[0].createdBy.id).toBeString();
    expect(body.data[0].createdBy.name).toBeString();
    expect(body.data[0].updatedBy).toBeObject();
    expect(body.data[0].updatedBy.id).toBeString();
    expect(body.data[0].updatedBy.name).toBeString();
    expect(body.data[1].id).toStartWith("cpf-analysis-");
    expect(body.data[1].employee).toBeObject();
    expect(body.data[1].employee.id).toBe(employee.id);
    expect(body.data[1].employee.name).toBeString();
  });

  test("should not return deleted cpf analyses", async () => {
    const { CpfAnalysisService } = await import("../cpf-analysis.service");
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
    });

    await CpfAnalysisService.delete(analysis.id, organizationId, userId);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });

  test("should not return cpf analyses from other organizations", async () => {
    const {
      headers: headers1,
      organizationId: org1,
      userId: user1,
    } = await createTestUserWithOrganization({ emailVerified: true });

    const { organizationId: org2, userId: user2 } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee: employee1 } = await createTestEmployee({
      organizationId: org1,
      userId: user1,
    });

    const { employee: employee2 } = await createTestEmployee({
      organizationId: org2,
      userId: user2,
    });

    await createTestCpfAnalysis({
      organizationId: org1,
      userId: user1,
      employeeId: employee1.id,
    });

    await createTestCpfAnalysis({
      organizationId: org2,
      userId: user2,
      employeeId: employee2.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses`, {
        method: "GET",
        headers: headers1,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(1);
  });

  test("should allow viewer to list cpf analyses", async () => {
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

    await createTestCpfAnalysis({
      organizationId,
      userId,
      employeeId: employee.id,
    });

    const viewerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewerResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cpf-analyses`, {
        method: "GET",
        headers: viewerResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(1);
  });
});
