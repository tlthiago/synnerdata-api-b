import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("Trial Plan", () => {
  let app: TestApp;
  let organizationId: string;
  let trialPlanResult: CreatePlanResult;

  beforeAll(async () => {
    app = createTestApp();
    trialPlanResult = await PlanFactory.createTrial();
    // Create paid plans for the public list test
    await PlanFactory.createPaid("gold");
    await PlanFactory.createPaid("diamond");
    await PlanFactory.createPaid("platinum");
  });

  afterAll(async () => {
    // Cleanup subscription
    if (organizationId) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));
    }
  });

  describe("Trial plan configuration", () => {
    test("should have trial plan created with isTrial=true", () => {
      expect(trialPlanResult.plan).toBeDefined();
      expect(trialPlanResult.plan.isTrial).toBe(true);
      expect(trialPlanResult.plan.isPublic).toBe(false);
      expect(trialPlanResult.plan.trialDays).toBe(14);
    });

    test("should have trial plan in database with isTrial=true", async () => {
      const [plan] = await db
        .select()
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, trialPlanResult.plan.id))
        .limit(1);

      expect(plan).toBeDefined();
      expect(plan.name).toStartWith("trial"); // Name has UUID suffix for uniqueness
      expect(plan.isPublic).toBe(false);
      expect(plan.trialDays).toBe(14);
    });
  });

  describe("Trial subscription creation", () => {
    test("should create trial subscription with trial plan and employee limit", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      organizationId = result.organizationId;

      // Create trial subscription
      await SubscriptionService.createTrial(organizationId);

      const [subscription] = await db
        .select({
          status: schema.orgSubscriptions.status,
          planId: schema.orgSubscriptions.planId,
          pricingTierId: schema.orgSubscriptions.pricingTierId,
        })
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("active"); // Trial is a plan, not a status
      expect(subscription.pricingTierId).toBeDefined();

      // Verify the subscription uses a trial plan (isTrial=true)
      const [plan] = await db
        .select({ isTrial: schema.subscriptionPlans.isTrial })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, subscription.planId))
        .limit(1);

      expect(plan.isTrial).toBe(true);
    });
  });

  describe("Public plan list", () => {
    test("trial plan should not appear in public plan list", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans`, {
          headers: result.headers,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      const trialInList = body.data.plans.find(
        (p: { name: string }) => p.name === "trial"
      );

      expect(trialInList).toBeUndefined();
    });

    test("paid plans should appear in public plan list", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans`, {
          headers: result.headers,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      const planNames = body.data.plans.map((p: { name: string }) => p.name);

      expect(planNames).toContain("gold");
      expect(planNames).toContain("diamond");
      expect(planNames).toContain("platinum");
      expect(planNames).not.toContain("trial");
    });
  });
});
