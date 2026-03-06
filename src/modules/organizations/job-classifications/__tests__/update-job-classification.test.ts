import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { cboOccupations } from "@/db/schema/cbo-occupations";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { JobClassificationService } from "../job-classification.service";

const BASE_URL = env.API_URL;

describe("PUT /v1/job-classifications/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/job-classification-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/job-classification-123`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject non-existent job classification", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/job-classification-nonexistent`,
        {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated" }),
        }
      )
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_CLASSIFICATION_NOT_FOUND");
  });

  test("should update job classification name successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Original",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "CBO Atualizado" }),
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(jobClassification.id);
    expect(body.data.name).toBe("CBO Atualizado");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from updating job classification", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "PUT",
          headers: {
            ...memberResult.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated" }),
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to update job classification", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobClassification = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "CBO Manager Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/job-classifications/${jobClassification.id}`,
        {
          method: "PUT",
          headers: {
            ...memberResult.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated by Manager" }),
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Updated by Manager");
  });

  test("should update job classification with cboOccupationId", async () => {
    const uid = crypto.randomUUID().slice(0, 4);
    const cboId = `cbo-${crypto.randomUUID()}`;
    await db.insert(cboOccupations).values({
      id: cboId,
      code: `${uid}-03`,
      title: "Técnico em programação de computador",
      familyCode: uid,
      familyTitle: "Técnicos em programação",
    });

    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const created = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "Programador",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cboOccupationId: cboId }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.cboOccupationId).toBe(cboId);
  });

  test("should clear cboOccupationId when set to null", async () => {
    const uid = crypto.randomUUID().slice(0, 4);
    const cboId = `cbo-${crypto.randomUUID()}`;
    await db.insert(cboOccupations).values({
      id: cboId,
      code: `${uid}-04`,
      title: "Técnico em segurança de dados",
      familyCode: uid,
      familyTitle: "Técnicos em programação",
    });

    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const created = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "Segurança de Dados",
      cboOccupationId: cboId,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cboOccupationId: null }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.cboOccupationId).toBeNull();
  });

  test("should reject invalid cboOccupationId on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const created = await JobClassificationService.create({
      organizationId,
      userId: user.id,
      name: "Test Classification",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cboOccupationId: "cbo-nonexistent" }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_CBO_OCCUPATION");
  });
});
