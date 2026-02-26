import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/terminations — feature gate", () => {
  let app: TestApp;
  let goldPlan: CreatePlanResult;

  beforeAll(async () => {
    app = createTestApp();
    goldPlan = await PlanFactory.createPaid("gold");
  });

  afterAll(async () => {
    if (goldPlan) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.planId, goldPlan.plan.id));
      await db
        .delete(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.planId, goldPlan.plan.id));
      await db
        .delete(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, goldPlan.plan.id));
    }
  });

  test("should return 403 FEATURE_NOT_AVAILABLE without subscription", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, { headers })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FEATURE_NOT_AVAILABLE");
  });

  test("should return 200 with Gold plan (terminated_employees is a Gold feature)", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    await SubscriptionFactory.createActive(organizationId, goldPlan.plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, { headers })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
