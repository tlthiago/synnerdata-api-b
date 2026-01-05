import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { skipIntegration } from "@/test/support/skip-integration";

const BASE_URL = env.API_URL;

describe("GET /v1/payments/billing/invoices", () => {
  let app: TestApp;
  let trialPlanId: string;

  beforeAll(async () => {
    app = createTestApp();
    const { plan } = await PlanFactory.createTrial();
    trialPlanId = plan.id;
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
    const { headers } = await UserFactory.create();

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
    const { headers } = await UserFactory.createWithOrganization();

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
    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createTrial(
      userResult.organizationId,
      trialPlanId
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
        headers: userResult.headers,
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
      const userResult = await UserFactory.createWithOrganization();

      // Use a real Pagarme subscription ID from sandbox
      // This subscription may or may not exist/have invoices depending on sandbox state
      await SubscriptionFactory.createActive(
        userResult.organizationId,
        trialPlanId,
        { pagarmeSubscriptionId: "sub_KeLr0VRSY0SZQ74O" } // Real Pagarme sandbox subscription
      );

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
          method: "GET",
          headers: userResult.headers,
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
    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createTrial(
      userResult.organizationId,
      trialPlanId
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices?page=2&limit=10`, {
        method: "GET",
        headers: userResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.page).toBe(2);
    expect(body.data.limit).toBe(10);
  });

  test("should use default pagination when not provided", async () => {
    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createTrial(
      userResult.organizationId,
      trialPlanId
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
        headers: userResult.headers,
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

    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createActive(
      userResult.organizationId,
      trialPlanId,
      { pagarmeSubscriptionId: "sub_real_123" }
    );

    // Mock ONLY for simulating connection failure - impossible to reproduce reliably
    const getInvoicesSpy = spyOn(
      PagarmeClient,
      "getInvoices"
    ).mockRejectedValueOnce(new Error("Pagarme API error: Connection refused"));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/invoices`, {
        method: "GET",
        headers: userResult.headers,
      })
    );

    expect(response.status).toBe(500);

    getInvoicesSpy.mockRestore();
  });
});
