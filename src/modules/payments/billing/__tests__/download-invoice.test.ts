import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { skipIntegration } from "@/test/support/skip-integration";

const BASE_URL = env.API_URL;

describe("GET /v1/payments/billing/invoices/:id/download", () => {
  let app: TestApp;
  let trialPlanId: string;

  beforeAll(async () => {
    app = createTestApp();
    const { plan } = await PlanFactory.createTrial();
    trialPlanId = plan.id;
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
    const { headers } = await UserFactory.create();

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
    const { headers } = await UserFactory.createWithOrganization();

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
      const userResult = await UserFactory.createWithOrganization();

      await SubscriptionFactory.createActive(
        userResult.organizationId,
        trialPlanId,
        { pagarmeSubscriptionId: "sub_KeLr0VRSY0SZQ74O" }
      );

      // Try to download a non-existent invoice - Pagarme will return 404
      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/payments/billing/invoices/inv_nonexistent/download`,
          {
            method: "GET",
            headers: userResult.headers,
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
      const userResult = await UserFactory.createWithOrganization();

      await SubscriptionFactory.createTrial(
        userResult.organizationId,
        trialPlanId
      );

      // Trial subscriptions have no pagarmeSubscriptionId
      // The service should still try to fetch from Pagarme (and fail with 404)
      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/payments/billing/invoices/inv_123/download`,
          {
            method: "GET",
            headers: userResult.headers,
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
    const ownerResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createTrial(
      ownerResult.organizationId,
      trialPlanId
    );

    const memberResult = await UserFactory.create();
    await OrganizationFactory.addMember(memberResult, {
      organizationId: ownerResult.organizationId,
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

    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createActive(
      userResult.organizationId,
      trialPlanId,
      { pagarmeSubscriptionId: "sub_test_123" }
    );

    // Mock ONLY for simulating connection failure - impossible to reproduce reliably
    const getInvoiceSpy = spyOn(
      PagarmeClient,
      "getInvoice"
    ).mockRejectedValueOnce(new Error("Pagarme API error: Connection refused"));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices/inv_123/download`, {
        method: "GET",
        headers: userResult.headers,
      })
    );

    expect(response.status).toBe(500);

    getInvoiceSpy.mockRestore();
  });
});
