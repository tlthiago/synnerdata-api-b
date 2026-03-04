import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestTerminations } from "@/test/helpers/termination";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/terminations", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`)
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty array when no terminations exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });

  test("should list all terminations for organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await createTestTerminations({
      organizationId,
      userId: user.id,
      count: 3,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    expect(body.data[0]).toHaveProperty("id");
    expect(body.data[0]).toHaveProperty("employee");
    expect(body.data[0].employee).toBeObject();
    expect(body.data[0].employee).toHaveProperty("id");
    expect(body.data[0].employee).toHaveProperty("name");
    expect(body.data[0]).toHaveProperty("terminationDate");
    expect(body.data[0]).toHaveProperty("type");
  });

  test("should not return terminations from other organizations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const otherOrgResult = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestTerminations({
      organizationId,
      userId: user.id,
      count: 2,
    });

    await createTestTerminations({
      organizationId: otherOrgResult.organizationId,
      userId: otherOrgResult.user.id,
      count: 3,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();

    const orgTerminations = body.data.filter(
      (t: { organizationId: string }) => t.organizationId === organizationId
    );
    expect(orgTerminations.length).toBeGreaterThanOrEqual(2);

    const otherOrgTerminations = body.data.filter(
      (t: { organizationId: string }) =>
        t.organizationId === otherOrgResult.organizationId
    );
    expect(otherOrgTerminations.length).toBe(0);
  });

  test("should allow viewer to list terminations", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestTerminations({
      organizationId,
      userId: user.id,
      count: 2,
    });

    const viewerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewerResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        headers: viewerResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });
});
