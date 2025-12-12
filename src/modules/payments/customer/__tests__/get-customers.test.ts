import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUser } from "@/test/helpers/auth";

const BASE_URL = env.API_URL;

describe("GET /payments/customers", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await createTestUser({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/customers`)
    );
    expect(response.status).toBe(401);
  });

  test("should list customers from Pagarme", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/customers`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toBeArray();
    expect(body.paging).toBeDefined();
  });
});
