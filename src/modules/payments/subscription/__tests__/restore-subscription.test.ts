import { beforeAll, describe, expect, test } from "bun:test";
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

describe("POST /v1/payments/subscription/restore", () => {
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
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
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
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should reject restoring non-canceled subscription", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_RESTORABLE");
  });

  test("should reject restoring trial subscription without cancelAtPeriodEnd", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createTrial(
      organizationId,
      diamondPlanResult.plan.id
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_RESTORABLE");
  });

  test("should reject restoring expired subscription", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createExpired(
      organizationId,
      diamondPlanResult.plan.id
    );

    await db
      .update(schema.orgSubscriptions)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_RESTORABLE");
  });

  test("should reject restoring fully canceled subscription (via Pagarme webhook)", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createCanceled(
      organizationId,
      diamondPlanResult.plan.id
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_RESTORABLE");
  });

  test("should keep active status when restoring canceled trial subscription", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    // Trial subscriptions have status "active" in DB (trial is determined by plan.isTrial)
    await SubscriptionFactory.create(organizationId, trialPlanResult.plan.id, {
      status: "active",
      trialDays: 14,
    });

    await db
      .update(schema.orgSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
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

    // Status is "active" in DB (trial is not a status, it's determined by plan.isTrial)
    expect(subscription.status).toBe("active");
    expect(subscription.cancelAtPeriodEnd).toBe(false);
    expect(subscription.canceledAt).toBeNull();
  });

  test("should keep active status when restoring canceled active subscription", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

    await db
      .update(schema.orgSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
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
    expect(subscription.cancelAtPeriodEnd).toBe(false);
    expect(subscription.canceledAt).toBeNull();
  });

  test("should restore canceled subscription and return restored true", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

    await db
      .update(schema.orgSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
        method: "POST",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.restored).toBe(true);
  });

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from restoring subscription", async (role) => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

    await db
      .update(schema.orgSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const memberResult = await UserFactory.create({ emailVerified: true });

    await OrganizationFactory.addMember(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
        method: "POST",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
