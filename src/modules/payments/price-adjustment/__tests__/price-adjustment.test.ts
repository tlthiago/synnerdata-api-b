import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestAdminUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/price-adjustments/subscriptions/:subscriptionId", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newPriceMonthly: 5000,
            reason: "Test adjustment",
          }),
        }
      )
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPriceMonthly: 5000,
            reason: "Test adjustment",
          }),
        }
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject with missing reason", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPriceMonthly: 5000,
          }),
        }
      )
    );

    expect(response.status).toBe(422);
  });

  test("should reject with price too low", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/price-adjustments/subscriptions/sub-fake-id`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPriceMonthly: 50,
            reason: "Too cheap",
          }),
        }
      )
    );

    expect(response.status).toBe(422);
  });
});

describe("POST /v1/payments/price-adjustments/bulk", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/price-adjustments/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "plan-fake-id",
          pricingTierId: "tier-fake-id",
          billingCycle: "monthly",
          newPriceMonthly: 5000,
          reason: "Bulk test",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/price-adjustments/bulk`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "plan-fake-id",
          pricingTierId: "tier-fake-id",
          billingCycle: "monthly",
          newPriceMonthly: 5000,
          reason: "Bulk test",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject with invalid body", async () => {
    const { headers } = await createTestAdminUser();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/price-adjustments/bulk`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "plan-fake-id",
          // missing pricingTierId, billingCycle, newPriceMonthly, reason
        }),
      })
    );

    expect(response.status).toBe(422);
  });
});
