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

describe("DELETE /v1/medical-certificates/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/medical-certificates/medical-certificate-123`,
        {
          method: "DELETE",
        }
      )
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/medical-certificates/medical-certificate-123`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test.each([
    "viewer",
  ] as const)("should reject %s from deleting medical certificate", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/medical-certificates/medical-certificate-123`,
        {
          method: "DELETE",
          headers: memberResult.headers,
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject for non-existent medical certificate", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/medical-certificates/medical-certificate-nonexistent`,
        {
          method: "DELETE",
          headers,
        }
      )
    );

    expect(response.status).toBe(404);
  });

  test("should reject for already deleted medical certificate", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });
    const certificate = await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
    });

    await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "DELETE",
        headers,
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("MEDICAL_CERTIFICATE_ALREADY_DELETED");
  });

  test("should delete medical certificate successfully", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });
    const certificate = await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(certificate.id);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBeString();
    expect(body.data.deletedAt).toBeDefined();
  });
});
