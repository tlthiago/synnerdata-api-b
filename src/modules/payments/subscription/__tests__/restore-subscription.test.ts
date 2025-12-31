import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import {
  type CreatePlanResult,
  createPaidPlan,
  createTrialPlan,
} from "@/test/factories/plan";
import { createTestApp, type TestApp } from "@/test/helpers/app";
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

let diamondPlanResult: CreatePlanResult;
let trialPlanResult: CreatePlanResult;

describe("POST /v1/payments/subscription/restore", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    [diamondPlanResult, trialPlanResult] = await Promise.all([
      createPaidPlan("diamond"),
      createTrialPlan(),
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
    const { headers } = await createTestUserWithOrganization({
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
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

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
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(
      organizationId,
      diamondPlanResult.plan.id,
      "trial"
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
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createExpiredSubscription(organizationId, diamondPlanResult.plan.id);

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
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createCanceledSubscription(organizationId, diamondPlanResult.plan.id);

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
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Trial subscriptions have status "active" in DB (trial is determined by plan.isTrial)
    await createTestSubscription(organizationId, trialPlanResult.plan.id, {
      status: "trial",
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
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

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
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

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
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

    await db
      .update(schema.orgSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const memberResult = await createTestUser({ emailVerified: true });

    await addMemberToOrganization(memberResult, {
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
