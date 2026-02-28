import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

let diamondPlanResult: CreatePlanResult;
let trialPlanResult: CreatePlanResult;

describe("POST /v1/payments/subscription/cancel", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    [diamondPlanResult, trialPlanResult] = await Promise.all([
      PlanFactory.createPaid("diamond"),
      PlanFactory.createTrial(),
    ]);
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
    const { headers } = await UserFactory.createWithOrganization({
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
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createCanceled(
      organizationId,
      diamondPlanResult.plan.id
    );

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
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createExpired(
      organizationId,
      diamondPlanResult.plan.id
    );

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
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.create(
      organizationId,
      diamondPlanResult.plan.id,
      {
        status: "past_due",
      }
    );

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
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

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

  test("should reject canceling trial subscription", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createTrial(
      organizationId,
      trialPlanResult.plan.id
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("TRIAL_NOT_CANCELLABLE");
  });

  test("should keep original status when canceling active subscription", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

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

  test("should reject canceling trial plan subscription even when status is active", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.create(organizationId, trialPlanResult.plan.id, {
      status: "active",
      trialDays: 14,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("TRIAL_NOT_CANCELLABLE");
  });

  test("should not call Pagarme immediately (soft cancel)", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id,
      { pagarmeSubscriptionId: "sub_test_soft_cancel" }
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
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

    const memberResult = await UserFactory.create({ emailVerified: true });

    await OrganizationFactory.addMember(memberResult, {
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
