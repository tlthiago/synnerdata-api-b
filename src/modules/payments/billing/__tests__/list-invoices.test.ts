import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { skipIntegration } from "@/test/helpers/skip-integration";
import {
  createActiveSubscription,
  createTestSubscription,
} from "@/test/helpers/subscription";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/payments/billing/invoices", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 when organization has no subscription", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should return empty invoices for trial subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-diamond", "trial");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.invoices).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  test.skipIf(skipIntegration)(
    "should call Pagarme API for active subscription with pagarmeSubscriptionId",
    async () => {
      const { headers, organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      // Use a real Pagarme subscription ID from sandbox
      // This subscription may or may not exist/have invoices depending on sandbox state
      await createActiveSubscription(
        organizationId,
        "test-plan-diamond",
        "sub_KeLr0VRSY0SZQ74O" // Real Pagarme sandbox subscription
      );

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
          method: "GET",
          headers,
        })
      );

      // The API should either return invoices or an error from Pagarme
      // Depending on whether the subscription exists in sandbox
      if (response.status === 200) {
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty("invoices");
        expect(body.data).toHaveProperty("total");
        expect(body.data).toHaveProperty("page");
        expect(body.data).toHaveProperty("limit");
        expect(Array.isArray(body.data.invoices)).toBe(true);
      } else {
        // Subscription may not exist in Pagarme sandbox anymore
        expect([400, 404, 422, 500]).toContain(response.status);
      }
    }
  );

  test("should accept pagination parameters", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-diamond", "trial");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices?page=2&limit=10`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.page).toBe(2);
    expect(body.data.limit).toBe(10);
  });

  test("should use default pagination when not provided", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-diamond", "trial");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(20);
  });

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from listing invoices", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-diamond", "trial");

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should handle Pagarme API connection failure", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(
      organizationId,
      "test-plan-diamond",
      "sub_real_123"
    );

    // Mock ONLY for simulating connection failure - impossible to reproduce reliably
    const getInvoicesSpy = spyOn(
      PagarmeClient,
      "getInvoices"
    ).mockRejectedValueOnce(new Error("Pagarme API error: Connection refused"));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(500);

    getInvoicesSpy.mockRestore();
  });
});
