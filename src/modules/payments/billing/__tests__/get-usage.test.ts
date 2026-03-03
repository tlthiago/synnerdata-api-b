import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("GET /v1/payments/billing/usage", () => {
  let app: TestApp;
  let trialPlanId: string;

  beforeAll(async () => {
    app = createTestApp();
    const { plan } = await PlanFactory.createTrial();
    trialPlanId = plan.id;
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/usage`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await UserFactory.create();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/usage`, {
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
      new Request(`${BASE_URL}/v1/payments/billing/usage`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should return usage for trial subscription", async () => {
    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createTrial(
      userResult.organizationId,
      trialPlanId
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/usage`, {
        method: "GET",
        headers: userResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.plan).toHaveProperty("name");
    expect(body.data.plan).toHaveProperty("displayName");
    expect(body.data.usage).toHaveProperty("employees");
    expect(body.data.usage.employees).toHaveProperty("current");
    expect(body.data.usage.employees).toHaveProperty("limit");
    expect(body.data.usage.employees).toHaveProperty("percentage");
    expect(body.data).toHaveProperty("features");
  });

  test("should return correct employee count", async () => {
    const userResult = await UserFactory.createWithOrganization();

    await SubscriptionFactory.createTrial(
      userResult.organizationId,
      trialPlanId
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/usage`, {
        method: "GET",
        headers: userResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.usage.employees.current).toBeGreaterThanOrEqual(0);
  });

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from getting usage", async (role) => {
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
      new Request(`${BASE_URL}/v1/payments/billing/usage`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
