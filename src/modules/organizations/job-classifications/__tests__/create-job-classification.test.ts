import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { cboOccupations } from "@/db/schema/cbo-occupations";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

const validJobClassificationData = {
  name: "Analista de Sistemas",
};

describe("POST /v1/job-classifications", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validJobClassificationData),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validJobClassificationData),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject missing required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return PT-BR message for empty name", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "" }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("Nome é obrigatório");
  });

  test("should return PT-BR message for name exceeding max length", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "x".repeat(256) }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("Nome deve ter no máximo 255 caracteres");
  });

  test("should create job classification successfully", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validJobClassificationData),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("job-classification-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe(validJobClassificationData.name);
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from creating job classification", async (role) => {
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
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validJobClassificationData),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create job classification", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Desenvolvedor Backend" }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should create job classification with cboOccupationId and auto-fill name", async () => {
    const cboId = `cbo-${crypto.randomUUID()}`;
    await db.insert(cboOccupations).values({
      id: cboId,
      code: "2521-05",
      title: "Administrador",
      familyCode: "2521",
      familyTitle: "Administradores",
    });

    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cboOccupationId: cboId }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Administrador");
    expect(body.data.cboOccupationId).toBe(cboId);
  });

  test("should create job classification with cboOccupationId and custom name override", async () => {
    const cboId = `cbo-${crypto.randomUUID()}`;
    await db.insert(cboOccupations).values({
      id: cboId,
      code: "2521-10",
      title: "Administrador de empresas",
      familyCode: "2521",
      familyTitle: "Administradores",
    });

    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          cboOccupationId: cboId,
          name: "Administrador Sênior",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Administrador Sênior");
    expect(body.data.cboOccupationId).toBe(cboId);
  });

  test("should reject invalid cboOccupationId", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cboOccupationId: "cbo-nonexistent" }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_CBO_OCCUPATION");
  });

  test("should reject when neither name nor cboOccupationId is provided", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-classifications`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });
});
