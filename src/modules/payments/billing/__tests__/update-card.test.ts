import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { skipIntegration } from "@/test/support/skip-integration";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/billing/update-card", () => {
  let app: TestApp;
  let trialPlanId: string;

  beforeAll(async () => {
    app = createTestApp();
    const { plan } = await PlanFactory.createTrial();
    trialPlanId = plan.id;
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/update-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: "card_123" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await UserFactory.create();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/update-card`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: "card_123" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 when organization has no subscription", async () => {
    const { headers } = await UserFactory.createWithOrganization();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/update-card`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: "card_123" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should return 404 for subscription without pagarmeSubscriptionId", async () => {
    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createTrial(
      userResult.organizationId,
      trialPlanId
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/update-card`, {
        method: "POST",
        headers: { ...userResult.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: "card_123" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should reject empty cardId", async () => {
    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createActive(
      userResult.organizationId,
      trialPlanId,
      { pagarmeSubscriptionId: "sub_123" }
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/update-card`, {
        method: "POST",
        headers: { ...userResult.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: "" }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject missing cardId", async () => {
    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createActive(
      userResult.organizationId,
      trialPlanId,
      { pagarmeSubscriptionId: "sub_123" }
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/update-card`, {
        method: "POST",
        headers: { ...userResult.headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test.skipIf(skipIntegration)(
    "should fail with invalid cardId in Pagarme",
    async () => {
      const userResult = await UserFactory.createWithOrganization();

      // Use a real Pagarme subscription ID
      await SubscriptionFactory.createActive(
        userResult.organizationId,
        trialPlanId,
        { pagarmeSubscriptionId: "sub_KeLr0VRSY0SZQ74O" }
      );

      // Try to update with an invalid card ID - Pagarme should reject it
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/billing/update-card`, {
          method: "POST",
          headers: {
            ...userResult.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cardId: "card_invalid_123" }),
        })
      );

      // Pagarme returns error for invalid card ID
      expect([400, 404, 422, 500]).toContain(response.status);
    }
  );

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from updating card", async (role) => {
    const ownerResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createActive(
      ownerResult.organizationId,
      trialPlanId,
      { pagarmeSubscriptionId: "sub_123" }
    );

    const memberResult = await UserFactory.create();
    await OrganizationFactory.addMember(memberResult, {
      organizationId: ownerResult.organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/update-card`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cardId: "card_123" }),
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
    const updateCardSpy = spyOn(
      PagarmeClient,
      "updateSubscriptionCard"
    ).mockRejectedValueOnce(new Error("Pagarme API error: Connection refused"));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/update-card`, {
        method: "POST",
        headers: { ...userResult.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: "card_123" }),
      })
    );

    expect(response.status).toBe(500);

    updateCardSpy.mockRestore();
  });
});
