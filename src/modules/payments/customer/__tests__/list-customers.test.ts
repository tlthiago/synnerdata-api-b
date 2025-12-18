import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestAdminUser,
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/payments/customers", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/customers`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-admin user", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/customers`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject organization owner without admin role", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/customers`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject invalid page parameter", async () => {
    const { headers } = await createTestAdminUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/customers?page=0`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject invalid size parameter", async () => {
    const { headers } = await createTestAdminUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/customers?size=101`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(422);
  });

  test("should handle Pagarme API connection failure", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers } = await createTestAdminUser({ emailVerified: true });

    const getCustomersSpy = spyOn(
      PagarmeClient,
      "getCustomers"
    ).mockRejectedValueOnce(new Error("Pagarme API error: Connection refused"));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/customers`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(500);

    getCustomersSpy.mockRestore();
  });
});
