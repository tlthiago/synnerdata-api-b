import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { ApiKeyService } from "@/modules/admin/api-keys/api-key.service";
import { AuditService } from "@/modules/audit/audit.service";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestAdminUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("DELETE /v1/admin/api-keys/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/some-id`, {
        method: "DELETE",
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
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should delete API key successfully", async () => {
    const { headers, user } = await createTestAdminUser();

    const createResult = await ApiKeyService.create(user.id, {
      name: "delete-test-key",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/${createResult.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);

    const getResponse = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys/${createResult.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(getResponse.status).toBe(404);
  });

  describe("audit trail (RU-6)", () => {
    test("records delete action with userId and resourceId", async () => {
      const { headers, user } = await createTestAdminUser();

      const createResult = await ApiKeyService.create(user.id, {
        name: "audit-delete-key",
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/admin/api-keys/${createResult.id}`, {
          method: "DELETE",
          headers,
        })
      );

      expect(response.status).toBe(200);

      const logs = await AuditService.getByResource("api_key", createResult.id);
      const deleteEntry = logs.find((log) => log.action === "delete");
      expect(deleteEntry).toBeDefined();
      expect(deleteEntry?.resource).toBe("api_key");
      expect(deleteEntry?.resourceId).toBe(createResult.id);
      expect(deleteEntry?.userId).toBe(user.id);
    });
  });
});
