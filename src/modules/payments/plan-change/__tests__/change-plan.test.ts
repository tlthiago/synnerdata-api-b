import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { addMemberToOrganization } from "@/test/helpers/organization";
import { seedPlans } from "@/test/helpers/seed";
import {
  createActiveSubscription,
  createCanceledSubscription,
  createTestSubscription,
} from "@/test/helpers/subscription";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/subscription/change-plan", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPlanId: "test-plan-enterprise",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject for same plan", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newPlanId: "test-plan-pro",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SAME_PLAN");
  });

  test("should reject for trial subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, "test-plan-pro", "trial");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newPlanId: "test-plan-starter",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_ACTIVE");
  });

  test("should reject when plan change already scheduled", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: "test-plan-starter",
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newPlanId: "test-plan-enterprise",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("PLAN_CHANGE_IN_PROGRESS");
  });

  test("should reject for canceled subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createCanceledSubscription(organizationId, "test-plan-pro");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newPlanId: "test-plan-starter",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_ACTIVE");
  });

  test("should reject missing newPlanId", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject missing successUrl", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newPlanId: "test-plan-starter",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject for non-existent plan", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newPlanId: "non-existent-plan",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });

  test("should reject viewer from changing plan", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    const memberResult = await createTestUser({ emailVerified: true });

    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPlanId: "test-plan-enterprise",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(403);
  });

  test("should schedule downgrade for end of period", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Pro -> Starter is a downgrade
    await createActiveSubscription(organizationId, "test-plan-pro");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-plan`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newPlanId: "test-plan-starter",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.changeType).toBe("downgrade");
    expect(body.data.immediate).toBe(false);
    expect(body.data.scheduledAt).toBeDefined();
    expect(body.data.newPlan).toBeDefined();
    expect(body.data.newPlan.id).toBe("test-plan-starter");

    // Verify DB was updated
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscription.pendingPlanId).toBe("test-plan-starter");
    expect(subscription.planChangeAt).toBeInstanceOf(Date);
  });
});
