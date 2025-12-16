import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestAdminUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { ApiKeyService } from "../api-key.service";

const BASE_URL = env.API_URL;

describe("GET /v1/admin/api-keys/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/some-id`, {
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
      new Request(`${BASE_URL}/v1/admin/api-keys/some-id`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should return 404 for non-existent API key", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/non-existent-id`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("API_KEY_NOT_FOUND");
  });

  test("should return API key details", async () => {
    const { headers, user } = await createTestAdminUser();

    const createResult = await ApiKeyService.create(user.id, {
      name: "get-test-key",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/${createResult.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(createResult.id);
    expect(body.data.name).toBe("get-test-key");
    expect(body.data.prefix).toBeDefined();
    expect(body.data.enabled).toBe(true);
    expect(body.data.key).toBeUndefined();
  });
});
