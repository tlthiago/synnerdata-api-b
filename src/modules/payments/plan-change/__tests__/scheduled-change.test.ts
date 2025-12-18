import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createActiveSubscription } from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/payments/subscription/scheduled-change", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should return hasScheduledChange false when no change is scheduled", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.hasScheduledChange).toBe(false);
    expect(body.data.change).toBeUndefined();
  });

  test("should return scheduled change details when change is pending", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-diamond");

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: "test-plan-gold",
        pendingBillingCycle: "monthly",
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.hasScheduledChange).toBe(true);
    expect(body.data.change).toBeDefined();
    expect(body.data.change.pendingPlanId).toBe("test-plan-gold");
    expect(body.data.change.pendingBillingCycle).toBe("monthly");
    expect(body.data.change.scheduledAt).toBeDefined();
  });
});

describe("DELETE /v1/payments/subscription/scheduled-change", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should cancel scheduled plan change", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-diamond");

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: "test-plan-gold",
        pendingBillingCycle: "monthly",
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.canceled).toBe(true);

    // Verify DB was cleared
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscription.pendingPlanId).toBeNull();
    expect(subscription.pendingBillingCycle).toBeNull();
    expect(subscription.planChangeAt).toBeNull();
  });

  test("should reject when no change is scheduled", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("NO_SCHEDULED_CHANGE");
  });
});
