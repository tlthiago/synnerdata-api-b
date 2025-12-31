import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { skipIntegration } from "@/test/helpers/skip-integration";
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

  test("should list customers successfully with admin auth", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers } = await createTestAdminUser({ emailVerified: true });

    const mockCustomers = {
      data: [
        {
          id: "cus_test_123",
          name: "Test Company",
          email: "test@example.com",
          document: "12345678000190",
          type: "company" as const,
          delinquent: false,
          phones: {
            mobile_phone: {
              country_code: "55",
              area_code: "11",
              number: "999999999",
            },
          },
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
      paging: {
        total: 1,
      },
    };

    const getCustomersSpy = spyOn(
      PagarmeClient,
      "getCustomers"
    ).mockResolvedValueOnce(mockCustomers);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/customers`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.customers).toBeArray();
    expect(body.data.customers.length).toBe(1);
    expect(body.data.customers[0].id).toBe("cus_test_123");
    expect(body.data.paging.total).toBe(1);

    getCustomersSpy.mockRestore();
  });

  test("should pass filter parameters to Pagarme API", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers } = await createTestAdminUser({ emailVerified: true });

    const getCustomersSpy = spyOn(
      PagarmeClient,
      "getCustomers"
    ).mockResolvedValueOnce({ data: [], paging: { total: 0 } });

    await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/customers?name=Test&email=test@example.com&page=2&size=20`,
        {
          method: "GET",
          headers,
        }
      )
    );

    expect(getCustomersSpy).toHaveBeenCalledWith({
      name: "Test",
      email: "test@example.com",
      document: undefined,
      page: 2,
      size: 20,
    });

    getCustomersSpy.mockRestore();
  });
});

describe.skipIf(skipIntegration)(
  "GET /v1/payments/customers (Pagarme API)",
  () => {
    let app: TestApp;

    beforeAll(() => {
      app = createTestApp();
    });

    test("should list customers from Pagarme API", async () => {
      const { headers } = await createTestAdminUser({ emailVerified: true });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/customers`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.customers).toBeArray();
      expect(body.data.paging).toBeDefined();
      expect(typeof body.data.paging.total).toBe("number");
    });

    test("should filter customers by name in Pagarme API", async () => {
      const { headers } = await createTestAdminUser({ emailVerified: true });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/customers?name=Test`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.customers).toBeArray();
    });

    test("should paginate customers from Pagarme API", async () => {
      const { headers } = await createTestAdminUser({ emailVerified: true });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/customers?page=1&size=5`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.customers).toBeArray();
      expect(body.data.customers.length).toBeLessThanOrEqual(5);
    });
  }
);
