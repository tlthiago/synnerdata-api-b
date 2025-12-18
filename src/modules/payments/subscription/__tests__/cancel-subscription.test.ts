import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import {
  createActiveSubscription,
  createCanceledSubscription,
  createExpiredSubscription,
  createTestSubscription,
} from "@/test/helpers/subscription";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/subscription/cancel", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject for organization without subscription", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should reject canceling already canceled subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createCanceledSubscription(organizationId, "test-plan-diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_CANCELABLE");
  });

  test("should reject canceling expired subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createExpiredSubscription(organizationId, "test-plan-diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_CANCELABLE");
  });

  test("should reject canceling past_due subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-diamond", {
      status: "past_due",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_CANCELABLE");
  });

  test("should cancel active subscription and return cancelAtPeriodEnd", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cancelAtPeriodEnd).toBe(true);
    expect(body.data.currentPeriodEnd).toBeDefined();
  });

  test("should cancel trial subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-diamond", "trial");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.cancelAtPeriodEnd).toBe(true);
  });

  test("should keep original status when canceling active subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscription.status).toBe("active");
    expect(subscription.cancelAtPeriodEnd).toBe(true);
    expect(subscription.canceledAt).toBeInstanceOf(Date);
  });

  test("should keep original status when canceling trial subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-diamond", "trial");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscription.status).toBe("trial");
    expect(subscription.cancelAtPeriodEnd).toBe(true);
    expect(subscription.canceledAt).toBeInstanceOf(Date);
  });

  test("should not call Pagarme immediately (soft cancel)", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(
      organizationId,
      "test-plan-diamond",
      "sub_test_soft_cancel"
    );

    const cancelSubscriptionSpy = spyOn(
      PagarmeClient,
      "cancelSubscription"
    ).mockResolvedValueOnce({} as never);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(200);
    expect(cancelSubscriptionSpy).not.toHaveBeenCalled();

    cancelSubscriptionSpy.mockRestore();
  });

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from canceling subscription", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-diamond");

    const memberResult = await createTestUser({ emailVerified: true });

    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
