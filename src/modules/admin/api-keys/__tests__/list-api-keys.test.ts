import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { ApiKeyService } from "@/modules/admin/api-keys/api-key.service";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestAdminUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/admin/api-keys", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-admin user", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should list API keys for admin", async () => {
    const { headers, user } = await createTestAdminUser();

    await ApiKeyService.create(user.id, { name: "list-test-key-1" });
    await ApiKeyService.create(user.id, { name: "list-test-key-2" });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.keys).toBeDefined();
    expect(Array.isArray(body.data.keys)).toBe(true);
  });

  test("should filter API keys by organizationId", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { headers, user } = await createTestAdminUser();

    await ApiKeyService.create(user.id, {
      name: "org-specific-key",
      organizationId,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/admin/api-keys?organizationId=${organizationId}`,
        {
          method: "GET",
          headers,
        }
      )
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    for (const key of body.data.keys) {
      expect(key.organizationId).toBe(organizationId);
    }
  });

  test("should return empty list when no keys exist for organization", async () => {
    const { headers } = await createTestAdminUser();
    const nonExistentOrgId = "non-existent-org-id";

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/admin/api-keys?organizationId=${nonExistentOrgId}`,
        {
          method: "GET",
          headers,
        }
      )
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.keys).toEqual([]);
  });
});
