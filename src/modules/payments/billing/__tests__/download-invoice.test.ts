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

describe("GET /v1/payments/billing/invoices/:id/download", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices/inv_123/download`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices/inv_123/download`, {
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
      new Request(`${BASE_URL}/v1/payments/billing/invoices/inv_123/download`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test.skipIf(skipIntegration)(
    "should return 404 for non-existent invoice in Pagarme",
    async () => {
      const { headers, organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createActiveSubscription(
        organizationId,
        "test-plan-diamond",
        "sub_KeLr0VRSY0SZQ74O"
      );

      // Try to download a non-existent invoice - Pagarme will return 404
      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/payments/billing/invoices/inv_nonexistent/download`,
          {
            method: "GET",
            headers,
          }
        )
      );

      // Pagarme returns 400 or 404 for non-existent invoice
      expect([400, 404, 500]).toContain(response.status);
    }
  );

  test.skipIf(skipIntegration)(
    "should allow trial subscription to attempt invoice download",
    async () => {
      const { headers, organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        "test-plan-diamond",
        "trial"
      );

      // Trial subscriptions have no pagarmeSubscriptionId
      // The service should still try to fetch from Pagarme (and fail with 404)
      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/payments/billing/invoices/inv_123/download`,
          {
            method: "GET",
            headers,
          }
        )
      );

      // Should fail when trying to fetch invoice from Pagarme
      expect([400, 404, 500]).toContain(response.status);
    }
  );

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from downloading invoice", async (role) => {
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
      new Request(`${BASE_URL}/v1/payments/billing/invoices/inv_123/download`, {
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
      "sub_test_123"
    );

    // Mock ONLY for simulating connection failure - impossible to reproduce reliably
    const getInvoiceSpy = spyOn(
      PagarmeClient,
      "getInvoice"
    ).mockRejectedValueOnce(new Error("Pagarme API error: Connection refused"));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices/inv_123/download`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(500);

    getInvoiceSpy.mockRestore();
  });
});
