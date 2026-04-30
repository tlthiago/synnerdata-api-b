import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestPpeItems } from "@/test/helpers/ppe-item";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/ppe-items", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list when no ppe items exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });

  test("should return all ppe items for the organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const createdPpeItems = await createTestPpeItems({
      organizationId,
      userId: user.id,
      count: 3,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(createdPpeItems.length);
    for (const item of body.data) {
      expect(item.createdBy).toMatchObject({ id: user.id });
      expect(item.updatedBy).toMatchObject({ id: user.id });
    }
  });

  test("should only return ppe items from the active organization", async () => {
    const user1 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const user2 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestPpeItems({
      organizationId: user1.organizationId,
      userId: user1.user.id,
      count: 2,
    });

    await createTestPpeItems({
      organizationId: user2.organizationId,
      userId: user2.user.id,
      count: 3,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "GET",
        headers: user1.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(2);
    for (const item of body.data) {
      expect(item.organizationId).toBe(user1.organizationId);
    }
  });

  test("should allow viewer to list ppe items", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const owner = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestPpeItems({
      organizationId: owner.organizationId,
      userId: owner.user.id,
      count: 2,
    });

    const viewer = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewer, {
      organizationId: owner.organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "GET",
        headers: viewer.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(2);
  });
});
