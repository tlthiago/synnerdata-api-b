import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/payments/billing/usage", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
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
    const { headers } = await createTestUser({ emailVerified: true });

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
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

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
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-pro", "trial");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/usage`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.plan).toHaveProperty("name");
    expect(body.data.plan).toHaveProperty("displayName");
    expect(body.data.usage).toHaveProperty("members");
    expect(body.data.usage.members).toHaveProperty("current");
    expect(body.data.usage.members).toHaveProperty("limit");
    expect(body.data.usage.members).toHaveProperty("percentage");
    expect(body.data).toHaveProperty("features");
  });

  test("should return correct member count", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-pro", "trial");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/usage`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.usage.members.current).toBeGreaterThanOrEqual(1);
  });

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from getting usage", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-pro", "trial");

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
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
