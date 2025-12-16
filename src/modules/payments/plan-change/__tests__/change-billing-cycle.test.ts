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

describe("POST /v1/payments/subscription/change-billing-cycle", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-billing-cycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newBillingCycle: "yearly",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject same billing cycle", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-billing-cycle`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newBillingCycle: "monthly",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SAME_BILLING_CYCLE");
  });

  test("should schedule yearly to monthly for period end", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    // Set to yearly billing cycle
    await db
      .update(schema.orgSubscriptions)
      .set({ billingCycle: "yearly" })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-billing-cycle`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newBillingCycle: "monthly",
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
    expect(body.data.newBillingCycle).toBe("monthly");

    // Verify DB was updated
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscription.pendingBillingCycle).toBe("monthly");
    expect(subscription.planChangeAt).toBeInstanceOf(Date);
  });

  test("should reject missing newBillingCycle", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-billing-cycle`, {
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
      new Request(`${BASE_URL}/v1/payments/subscription/change-billing-cycle`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newBillingCycle: "yearly",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject invalid newBillingCycle value", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, "test-plan-pro");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/change-billing-cycle`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          newBillingCycle: "quarterly",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(422);
  });
});
