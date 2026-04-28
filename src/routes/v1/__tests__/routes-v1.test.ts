import { describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp } from "@/test/helpers/app";

const BASE_URL = env.API_URL;

describe("routesV1 composer", () => {
  const app = createTestApp();

  describe("top-level domains reachable under /v1/", () => {
    test("organizations: GET /v1/branches reaches auth (401)", async () => {
      const response = await app.handle(new Request(`${BASE_URL}/v1/branches`));
      expect(response.status).toBe(401);
    });

    test("employees: GET /v1/employees reaches auth (401)", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/employees`)
      );
      expect(response.status).toBe(401);
    });

    test("occurrences: GET /v1/absences reaches auth (401)", async () => {
      const response = await app.handle(new Request(`${BASE_URL}/v1/absences`));
      expect(response.status).toBe(401);
    });

    test("payments (public): GET /v1/payments/plans returns 200", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans`)
      );
      expect(response.status).toBe(200);
    });

    test("audit: GET /v1/audit-logs reaches auth (401)", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/audit-logs`)
      );
      expect(response.status).toBe(401);
    });

    test("admin: GET /v1/admin/api-keys reaches auth (401)", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/admin/api-keys`)
      );
      expect(response.status).toBe(401);
    });

    test("public: POST /v1/public/newsletter/subscribe returns 200", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/public/newsletter/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `smoke-${Date.now()}@test.com` }),
        })
      );
      expect(response.status).toBe(200);
    });

    test("cbo-occupations: GET /v1/cbo-occupations?search=xx reaches auth (401)", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/cbo-occupations?search=xx`)
      );
      expect(response.status).toBe(401);
    });
  });

  describe("pre-refactor URLs return 404 (migration verified)", () => {
    test("GET /audit-logs (without /v1) returns 404", async () => {
      const response = await app.handle(new Request(`${BASE_URL}/audit-logs`));
      expect(response.status).toBe(404);
    });

    test("GET /branches (without /v1) returns 404", async () => {
      const response = await app.handle(new Request(`${BASE_URL}/branches`));
      expect(response.status).toBe(404);
    });

    test("GET /employees (without /v1) returns 404", async () => {
      const response = await app.handle(new Request(`${BASE_URL}/employees`));
      expect(response.status).toBe(404);
    });
  });

  describe("health routes remain outside /v1/", () => {
    test("GET /health returns 200 (not under /v1)", async () => {
      const response = await app.handle(new Request(`${BASE_URL}/health`));
      expect(response.status).toBe(200);
    });

    test("GET /v1/health returns 404", async () => {
      const response = await app.handle(new Request(`${BASE_URL}/v1/health`));
      expect(response.status).toBe(404);
    });
  });
});
