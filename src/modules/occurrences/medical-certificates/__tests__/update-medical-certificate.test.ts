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

describe("PUT /v1/medical-certificates/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/medical-certificates/medical-certificate-123`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ daysOff: 7 }),
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
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ daysOff: 7 }),
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from updating medical certificate", async (role) => {
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
          method: "PUT",
          headers: {
            ...memberResult.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ daysOff: 7 }),
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
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ daysOff: 7 }),
        }
      )
    );

    expect(response.status).toBe(404);
  });

  test("should reject future startDate on update", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });
    const certificate = await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
      daysOff: 3,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: futureDateStr,
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject when daysOff does not match date range on update", async () => {
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
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2024-01-01",
          endDate: "2024-01-05",
          daysOff: 10,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_DAYS_OFF");
  });

  test("should update medical certificate successfully", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });
    const certificate = await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
      daysOff: 3,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2024-01-01",
          endDate: "2024-01-07",
          daysOff: 7,
          notes: "Updated notes",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(certificate.id);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBeString();
    expect(body.data.daysOff).toBe(7);
    expect(body.data.notes).toBe("Updated notes");
  });

  test("should reject overlapping medical certificate on update", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
      startDate: "2024-06-01",
      endDate: "2024-06-10",
      daysOff: 10,
    });

    const certificate2 = await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
      startDate: "2024-06-20",
      endDate: "2024-06-25",
      daysOff: 6,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate2.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2024-06-05",
          endDate: "2024-06-15",
          daysOff: 11,
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("MEDICAL_CERTIFICATE_OVERLAP");
  });

  test("should clear nullable fields when null is sent", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });
    const certificate = await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
      daysOff: 3,
      cid: "A01.0",
      doctorName: "Dr. Teste",
      doctorCrm: "123456",
      notes: "Some notes",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          cid: null,
          doctorName: null,
          doctorCrm: null,
          notes: null,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cid).toBeNull();
    expect(body.data.doctorName).toBeNull();
    expect(body.data.doctorCrm).toBeNull();
    expect(body.data.notes).toBeNull();
    expect(body.data.daysOff).toBe(certificate.daysOff);
    expect(body.data.startDate).toBe(certificate.startDate);
    expect(body.data.endDate).toBe(certificate.endDate);
  });

  test("should not change fields that are not sent (undefined)", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });
    const certificate = await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
      daysOff: 3,
      cid: "A01.0",
      doctorName: "Dr. Teste",
      doctorCrm: "123456",
      notes: "Some notes",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: "Updated notes only",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.notes).toBe("Updated notes only");
    expect(body.data.cid).toBe("A01.0");
    expect(body.data.doctorName).toBe("Dr. Teste");
    expect(body.data.doctorCrm).toBe("123456");
    expect(body.data.daysOff).toBe(certificate.daysOff);
    expect(body.data.startDate).toBe(certificate.startDate);
    expect(body.data.endDate).toBe(certificate.endDate);
  });

  test("should allow updating medical certificate without overlap (same record)", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({ organizationId, userId });

    const certificate = await createTestMedicalCertificate({
      organizationId,
      userId,
      employeeId: employee.id,
      startDate: "2024-07-01",
      endDate: "2024-07-10",
      daysOff: 10,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2024-07-02",
          endDate: "2024-07-08",
          daysOff: 7,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
