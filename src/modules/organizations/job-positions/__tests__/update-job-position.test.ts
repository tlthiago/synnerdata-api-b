import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { JobPositionService } from "../job-position.service";

const BASE_URL = env.API_URL;

describe("PUT /v1/job-positions/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/job-position-123`, {
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
      new Request(`${BASE_URL}/v1/job-positions/job-position-123`, {
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

  test("should reject non-existent job position", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/job-position-nonexistent`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_NOT_FOUND");
  });

  test("should update job position name successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Função Original",
      description: "Descrição Original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Função Atualizada" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(jobPosition.id);
    expect(body.data.name).toBe("Função Atualizada");
    expect(body.data.description).toBe("Descrição Original");
  });

  test("should update job position description successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Analista",
      description: "Descrição Original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description: "Nova Descrição" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(jobPosition.id);
    expect(body.data.name).toBe("Analista");
    expect(body.data.description).toBe("Nova Descrição");
  });

  test("should update both name and description", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Função Original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Função Completa",
          description: "Descrição Completa",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Função Completa");
    expect(body.data.description).toBe("Descrição Completa");
  });

  test("should clear description when null is sent", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Cargo com Descrição",
      description: "Descrição original",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description: null }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.description).toBeNull();
    expect(body.data.name).toBe("Cargo com Descrição");
  });

  test("should not change description when not sent (undefined)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Cargo Preservar",
      description: "Descrição preservada",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Cargo Renomeado" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Cargo Renomeado");
    expect(body.data.description).toBe("Descrição preservada");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from updating job position", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Função Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to update job position", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Função Manager Test",
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Função Atualizada por Manager" }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should return 409 when updating job position to duplicate name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Cargo A",
    });

    const jobPositionB = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Cargo B",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPositionB.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Cargo A" }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_ALREADY_EXISTS");
  });

  test("should return 409 when updating job position to duplicate name (case-insensitive)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Cargo A",
    });

    const jobPositionB = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Cargo B",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPositionB.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "CARGO A" }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_ALREADY_EXISTS");
  });

  test("should allow updating job position to its own name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const jobPosition = await JobPositionService.create({
      organizationId,
      userId: user.id,
      name: "Cargo Mesmo Nome",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${jobPosition.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Cargo Mesmo Nome" }),
      })
    );

    expect(response.status).toBe(200);
  });
});
