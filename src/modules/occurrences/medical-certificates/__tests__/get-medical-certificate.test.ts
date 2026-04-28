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

describe("GET /v1/medical-certificates/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/medical-certificates/medical-certificate-123`,
        {
          method: "GET",
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
          method: "GET",
          headers,
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject for non-existent medical certificate", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/medical-certificates/medical-certificate-nonexistent`,
        {
          method: "GET",
          headers,
        }
      )
    );

    expect(response.status).toBe(404);
  });

  test("should reject for medical certificate from another organization", async () => {
    const { organizationId: org1, userId: user1 } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId: org1,
      userId: user1,
    });
    const certificate = await createTestMedicalCertificate({
      organizationId: org1,
      userId: user1,
      employeeId: employee.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/medical-certificates/${certificate.id}`, {
        method: "GET",
        headers: headers2,
      })
    );

    expect(response.status).toBe(404);
  });

  test("should get medical certificate successfully", async () => {
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
        method: "GET",
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
  });

  test("should emit a read audit log on successful GET (CP-43)", async () => {
    const { db } = await import("@/db");
    const { schema } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");

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
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.organizationId, organizationId),
          eq(schema.auditLogs.resource, "medical_certificate"),
          eq(schema.auditLogs.action, "read")
        )
      );

    const readLog = logs.find((log) => log.resourceId === certificate.id);
    expect(readLog).toBeDefined();
    expect(readLog?.userId).toBe(userId);
    expect(readLog?.changes).toBeNull();
  });
});
