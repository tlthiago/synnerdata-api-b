import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestProjects } from "@/test/helpers/project";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/projects", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty array when no projects exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data).toHaveLength(0);
  });

  test("should return all organization projects", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestProjects({
      organizationId,
      userId: user.id,
      count: 3,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data).toHaveLength(3);

    for (const project of body.data) {
      expect(project.id).toStartWith("project-");
      expect(project.organizationId).toBe(organizationId);
      expect(project.name).toBeDefined();
      expect(project.description).toBeDefined();
      expect(project.startDate).toBeDefined();
      expect(project.cno).toBeDefined();
      expect(project.employees).toBeArray();
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();
      expect(project.createdBy).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
      });
      expect(project.updatedBy).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
      });
    }
  });

  test("should not return projects from other organizations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestProjects({
      organizationId,
      userId: user.id,
      count: 2,
    });

    // Create projects in another organization
    const { organizationId: otherOrgId, user: otherUser } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestProjects({
      organizationId: otherOrgId,
      userId: otherUser.id,
      count: 3,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data).toHaveLength(2);
    for (const project of body.data) {
      expect(project.organizationId).toBe(organizationId);
    }
  });

  test.each([
    "viewer",
    "supervisor",
    "manager",
  ] as const)("should allow %s to list projects", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestProjects({
      organizationId,
      userId: user.id,
      count: 2,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
  });
});
