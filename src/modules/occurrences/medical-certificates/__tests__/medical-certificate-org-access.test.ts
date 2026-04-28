import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestMedicalCertificate } from "@/test/helpers/medical-certificate";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("Medical certificate cross-organization access (BOLA — RU-9)", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  async function seedCertificateInOrgA() {
    const orgA = await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({
      organizationId: orgA.organizationId,
      userId: orgA.user.id,
    });
    const certificate = await createTestMedicalCertificate({
      organizationId: orgA.organizationId,
      userId: orgA.user.id,
      employeeId: employee.id,
    });
    return { orgA, certificate };
  }

  test("should return 404 on GET when medical certificate belongs to another organization", async () => {
    const { certificate } = await seedCertificateInOrgA();
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "GET",
        headers: orgB.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("MEDICAL_CERTIFICATE_NOT_FOUND");
  });

  test("LIST from a different organization does not include medical certificates from another org", async () => {
    const { certificate } = await seedCertificateInOrgA();
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates`, {
        method: "GET",
        headers: orgB.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    const ids = (body.data as Array<{ id: string }>).map((c) => c.id);
    expect(ids).not.toContain(certificate.id);
  });

  test("should return 404 on PUT when medical certificate belongs to another organization", async () => {
    const { certificate } = await seedCertificateInOrgA();
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "PUT",
        headers: { ...orgB.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Cross-org tamper attempt" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("MEDICAL_CERTIFICATE_NOT_FOUND");
  });

  test("should return 404 on DELETE when medical certificate belongs to another organization", async () => {
    const { certificate } = await seedCertificateInOrgA();
    const orgB = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "DELETE",
        headers: orgB.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("MEDICAL_CERTIFICATE_NOT_FOUND");
  });
});
