import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { ApiKeyService } from "@/modules/api-keys/api-key.service";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestAdminUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/admin/api-keys/:id/revoke", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/some-id/revoke`, {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-admin user", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/some-id/revoke`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should revoke API key successfully", async () => {
    const { headers, user } = await createTestAdminUser();

    const createResult = await ApiKeyService.create(user.id, {
      name: "revoke-test-key",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/${createResult.id}/revoke`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.revoked).toBe(true);

    const getResponse = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/${createResult.id}`, {
        method: "GET",
        headers,
      })
    );

    const getBody = await getResponse.json();
    expect(getBody.data.enabled).toBe(false);
  });
});
