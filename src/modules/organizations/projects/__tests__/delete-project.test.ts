import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestProject } from "@/test/helpers/project";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("DELETE /v1/projects/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/project-123`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/project-123`, {
        method: "DELETE",
        headers,
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
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  test("should soft delete project", async () => {
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
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(project.id);
    expect(body.data.deletedAt).toBeDefined();

    // Verify project is no longer accessible
    const getResponse = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(getResponse.status).toBe(404);
  });

  test("should return 404 when deleting already deleted project", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const project = await createTestProject({
      organizationId,
      userId: user.id,
    });

    // First delete
    await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}`, {
        method: "DELETE",
        headers,
      })
    );

    // Second delete attempt
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_ALREADY_DELETED");
  });

  test("should not delete project from different organization", async () => {
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
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from deleting project", async (role) => {
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
        method: "DELETE",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to delete project", async () => {
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
        method: "DELETE",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.deletedAt).toBeDefined();
  });
});
