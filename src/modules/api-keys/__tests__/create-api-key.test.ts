import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
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
});
