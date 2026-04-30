import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { JobPositionService } from "../job-position.service";

const BASE_URL = env.API_URL;

const validJobPositionData = {
  name: "Desenvolvedor Senior",
  description: "Responsável por desenvolvimento de software",
};

describe("POST /v1/job-positions", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validJobPositionData),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validJobPositionData),
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
      new Request(`${BASE_URL}/v1/job-positions`, {
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
      new Request(`${BASE_URL}/v1/job-positions`, {
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

  test("should create job position successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validJobPositionData),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("job-position-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe(validJobPositionData.name);
    expect(body.data.description).toBe(validJobPositionData.description);
    expect(body.data.createdBy).toEqual({ id: user.id, name: user.name });
    expect(body.data.updatedBy).toEqual({ id: user.id, name: user.name });
  });

  test("should create job position without description", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Estagiário" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe("Estagiário");
    expect(body.data.description).toBeNull();
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from creating job position", async (role) => {
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
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validJobPositionData),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create job position", async () => {
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
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Gerente de Projetos" }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should return 409 when creating job position with duplicate name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Cargo Duplicado",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Cargo Duplicado" }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_ALREADY_EXISTS");
  });

  test("should return 409 when creating job position with duplicate name (case-insensitive)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Cargo Teste",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "cargo teste" }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_ALREADY_EXISTS");
  });
});
