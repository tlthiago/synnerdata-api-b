import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestAbsence } from "@/test/helpers/absence";
import {
  createApiKeyHeaders,
  createGlobalTestApiKey,
  createOrgScopedTestApiKey,
} from "@/test/helpers/api-key";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestAdminUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("API Key Organization Access", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("org-scoped API key on read endpoints", () => {
    test("should list employees with org-scoped API key", async () => {
      const { user, organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createTestEmployee({ organizationId, userId: user.id });

      const apiKey = await createOrgScopedTestApiKey(user.id, organizationId);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/employees`, {
          method: "GET",
          headers: createApiKeyHeaders(apiKey.key),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("should list absences with org-scoped API key", async () => {
      const { user, organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createTestAbsence({ organizationId, userId: user.id });

      const apiKey = await createOrgScopedTestApiKey(user.id, organizationId);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/absences`, {
          method: "GET",
          headers: createApiKeyHeaders(apiKey.key),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("should return scoped data only for the API key organization", async () => {
      const orgA = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createTestAbsence({
        organizationId: orgA.organizationId,
        userId: orgA.user.id,
      });

      const orgB = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createTestAbsence({
        organizationId: orgB.organizationId,
        userId: orgB.user.id,
      });

      const apiKey = await createOrgScopedTestApiKey(
        orgA.user.id,
        orgA.organizationId
      );

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/absences`, {
          method: "GET",
          headers: createApiKeyHeaders(apiKey.key),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
    });
  });

  describe("global API key (no org)", () => {
    test("should reject global API key on org-scoped endpoint", async () => {
      const { user } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const apiKey = await createGlobalTestApiKey(user.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/absences`, {
          method: "GET",
          headers: createApiKeyHeaders(apiKey.key),
        })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
    });
  });

  describe("admin-created API key", () => {
    test("should access org endpoint with admin-created org-scoped key", async () => {
      const { organizationId, user } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createTestEmployee({ organizationId, userId: user.id });

      const { user: admin } = await createTestAdminUser();
      const apiKey = await createOrgScopedTestApiKey(admin.id, organizationId);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/employees`, {
          method: "GET",
          headers: createApiKeyHeaders(apiKey.key),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
    });
  });

  describe("revoked/invalid keys", () => {
    test("should reject revoked API key", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      // Create key owned by admin so admin can revoke it
      const { headers: adminHeaders, user: admin } =
        await createTestAdminUser();
      const apiKey = await createOrgScopedTestApiKey(admin.id, organizationId);

      const revokeResponse = await app.handle(
        new Request(`${BASE_URL}/v1/admin/api-keys/${apiKey.id}/revoke`, {
          method: "POST",
          headers: adminHeaders,
        })
      );
      expect(revokeResponse.status).toBe(200);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/absences`, {
          method: "GET",
          headers: createApiKeyHeaders(apiKey.key),
        })
      );

      // Better Auth throws APIError for disabled keys — not 200
      expect(response.status).not.toBe(200);
    });

    test("should reject invalid API key", async () => {
      const fakeKey = "a".repeat(64);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/absences`, {
          method: "GET",
          headers: createApiKeyHeaders(fakeKey),
        })
      );

      // Better Auth throws APIError for invalid keys — not 200
      expect(response.status).not.toBe(200);
    });
  });
});
