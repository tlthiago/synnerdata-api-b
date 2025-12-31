import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import { trialPlan } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { getTestPlan, seedPlans } from "@/test/helpers/seed";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("Trial Plan", () => {
  let app: TestApp;
  let organizationId: string;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
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
    test("should have trial plan in fixtures with isTrial=true", () => {
      expect(trialPlan).toBeDefined();
      expect(trialPlan?.isTrial).toBe(true);
      expect(trialPlan?.isPublic).toBe(false);
      expect(trialPlan?.trialDays).toBe(14);
    });

    test("should be accessible via getTestPlan helper", () => {
      const plan = getTestPlan("trial");
      expect(plan).toBeDefined();
      expect(plan?.name).toBe("trial");
      expect(plan?.isTrial).toBe(true);
    });

    test("should have trial plan in database with isTrial=true", async () => {
      // Order by ID DESC to get fixture plan ("test-plan-trial" after "plan-xxx")
      const { desc } = await import("drizzle-orm");
      const [plan] = await db
        .select()
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.isTrial, true))
        .orderBy(desc(schema.subscriptionPlans.id))
        .limit(1);

      expect(plan).toBeDefined();
      expect(plan.name).toBe("trial");
      expect(plan.isPublic).toBe(false);
      expect(plan.trialDays).toBe(14);
    });
  });

  describe("Trial subscription creation", () => {
    test("should create trial subscription with trial plan and employee limit", async () => {
      const result = await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
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
      expect(subscription.planId).toBe("test-plan-trial");
      expect(subscription.pricingTierId).toBeDefined();
    });
  });

  describe("Public plan list", () => {
    test("trial plan should not appear in public plan list", async () => {
      const result = await createTestUserWithOrganization({
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
      const result = await createTestUserWithOrganization({
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
