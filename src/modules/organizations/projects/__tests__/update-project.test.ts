import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestProject, generateCno } from "@/test/helpers/project";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PUT /v1/projects/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/project-123`, {
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
      new Request(`${BASE_URL}/v1/projects/project-123`, {
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

  test("should return 404 for non-existent project", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/project-nonexistent`, {
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
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  test("should update project name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    const newName = "Projeto Atualizado";
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(project.id);
    expect(body.data.name).toBe(newName);
    expect(body.data.description).toBe(project.description);
    expect(body.data.startDate).toBe(project.startDate);
    expect(body.data.cno).toBe(project.cno);
  });

  test("should update multiple fields", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    const updates = {
      name: "Projeto Novo Nome",
      description: "Nova descrição do projeto",
      startDate: "2025-06-01",
      cno: generateCno(),
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.name).toBe(updates.name);
    expect(body.data.description).toBe(updates.description);
    expect(body.data.startDate).toBe(updates.startDate);
    expect(body.data.cno).toBe(updates.cno);
  });

  test("should reject invalid CNO length", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cno: "12345" }), // Should be 12 chars
      })
    );

    expect(response.status).toBe(422);
  });

  test("should not update project from different organization", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Create project in another organization
    const { organizationId: otherOrgId, user: otherUser } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const otherProject = await createTestProject({
      organizationId: otherOrgId,
      userId: otherUser.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${otherProject.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hacked" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from updating project", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}`, {
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

  test("should allow manager to update project", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Manager Updated" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Manager Updated");
  });

  test("should return 409 when updating project to duplicate name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestProject({
      organizationId,
      userId: user.id,
      name: "Projeto A",
    });

    const projectB = await createTestProject({
      organizationId,
      userId: user.id,
      name: "Projeto B",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${projectB.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Projeto A" }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NAME_ALREADY_EXISTS");
  });

  test("should return 409 when updating project to duplicate name (case-insensitive)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestProject({
      organizationId,
      userId: user.id,
      name: "Projeto A",
    });

    const projectB = await createTestProject({
      organizationId,
      userId: user.id,
      name: "Projeto B",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${projectB.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "PROJETO A" }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NAME_ALREADY_EXISTS");
  });

  test("should return 409 when updating project to duplicate cno", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const cno = generateCno();
    await createTestProject({
      organizationId,
      userId: user.id,
      cno,
    });

    const projectB = await createTestProject({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${projectB.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cno }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_CNO_ALREADY_EXISTS");
  });

  test("should allow updating project to its own name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
      name: "Projeto Mesmo Nome",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Projeto Mesmo Nome" }),
      })
    );

    expect(response.status).toBe(200);
  });
});
