import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestMedicalCertificate } from "@/test/helpers/medical-certificate";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/medical-certificates", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list for organization without medical certificates", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
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

  test("should list all medical certificates for organization", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });
    await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
    });
    await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  test("should not return medical certificates from other organizations", async () => {
    const {
      headers: headers1,
      organizationId: org1,
      userId: user1,
    } = await createTestUserWithOrganization({ emailVerified: true });
    const { organizationId: org2, userId: user2 } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee: emp1 } = await createTestEmployee({
      organizationId: org1,
      userId: user1,
    });
    const { employee: emp2 } = await createTestEmployee({
      organizationId: org2,
      userId: user2,
    });

    await createTestMedicalCertificate({
      organizationId: org1,
      userId: user1,
      employeeId: emp1.id,
    });
    await createTestMedicalCertificate({
      organizationId: org2,
      userId: user2,
      employeeId: emp2.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "GET",
        headers: headers1,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.every((cert: any) => cert.organizationId === org1)).toBe(
      true
    );
  });

  test("should allow viewer to list medical certificates", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
  });
});
