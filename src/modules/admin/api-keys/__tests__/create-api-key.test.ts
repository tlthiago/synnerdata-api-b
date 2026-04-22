import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { AuditService } from "@/modules/audit/audit.service";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestAdminUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/admin/api-keys", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "test-api-key",
        }),
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
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "test-api-key",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject missing name field", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject empty name", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should create API key and return key value", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "test-api-key-e2e",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.key).toBeDefined();
    expect(body.data.name).toBe("test-api-key-e2e");
    expect(body.data.prefix).toBeDefined();
  });

  test("should create API key with organizationId scope", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const adminResult = await createTestAdminUser();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "POST",
        headers: {
          ...adminResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "org-scoped-api-key",
          organizationId,
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("org-scoped-api-key");
  });

  test("should create API key with expiration", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "expiring-api-key",
          expiresInDays: 30,
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.expiresAt).toBeDefined();
  });

  test.each([
    "admin",
    "super_admin",
  ] as const)("should allow %s to create API key", async (role) => {
    const { headers } = await createTestAdminUser({ role });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/admin/api-keys`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `api-key-by-${role}`,
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  describe("audit trail (RU-6)", () => {
    test("records create action with prefix and without leaking the full key", async () => {
      const { user, headers } = await createTestAdminUser();

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/admin/api-keys`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "audit-create-key" }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const keyId = body.data.id;
      const fullKey = body.data.key;

      const logs = await AuditService.getByResource("api_key", keyId);
      expect(logs).toHaveLength(1);

      const entry = logs[0];
      expect(entry.action).toBe("create");
      expect(entry.resource).toBe("api_key");
      expect(entry.resourceId).toBe(keyId);
      expect(entry.userId).toBe(user.id);
      expect(entry.organizationId).toBeNull();

      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain(fullKey);
      expect(entry.changes).toMatchObject({
        after: { prefix: body.data.prefix, name: "audit-create-key" },
      });
    });

    test("records organizationId when key is org-scoped", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      const admin = await createTestAdminUser();

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/admin/api-keys`, {
          method: "POST",
          headers: { ...admin.headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "audit-org-key",
            organizationId,
          }),
        })
      );

      const body = await response.json();
      const logs = await AuditService.getByResource("api_key", body.data.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].organizationId).toBe(organizationId);
    });
  });
});
