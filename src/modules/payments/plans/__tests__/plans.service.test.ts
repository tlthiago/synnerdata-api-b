import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  PlanNotAvailableError,
  PlanNotFoundError,
  TierNotFoundError,
} from "@/modules/payments/errors";
import { PlansService } from "@/modules/payments/plans/plans.service";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";

describe("PlansService", () => {
  describe("getAvailableById", () => {
    test("should return active plan", async () => {
      const { plan } = await PlanFactory.createPaid("gold");

      const result = await PlansService.getAvailableById(plan.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(plan.id);
      expect(result.isActive).toBe(true);
    });

    test("should throw PlanNotAvailableError for inactive plan", async () => {
      const { plan: inactivePlan } = await PlanFactory.createInactive({
        type: "gold",
      });

      expect(() => PlansService.getAvailableById(inactivePlan.id)).toThrow(
        PlanNotAvailableError
      );
    });

    test("should throw PlanNotFoundError for non-existent plan", () => {
      expect(() =>
        PlansService.getAvailableById("plan-non-existent-id")
      ).toThrow(PlanNotFoundError);
    });
  });

  describe("getTrialPlan", () => {
    test("should return the trial plan", async () => {
      await PlanFactory.createTrial();

      const trialPlan = await PlansService.getTrialPlan();

      expect(trialPlan).toBeDefined();
      expect(trialPlan.isTrial).toBe(true);
      expect(trialPlan.trialDays).toBeGreaterThan(0);
    });

    test("should ignore private trial plans and return the public default", async () => {
      const trialPlanResult = await PlanFactory.createTrial();

      // Create a real org for FK constraint
      const org = await OrganizationFactory.create();

      // Create a private trial plan (simulating admin provision)
      const privatePlanId = `plan-${crypto.randomUUID()}`;
      await db.insert(schema.subscriptionPlans).values({
        id: privatePlanId,
        name: `custom-trial-private-${Date.now()}`,
        displayName: "Trial",
        description: "Private trial plan",
        trialDays: 30,
        isActive: true,
        isPublic: false,
        isTrial: true,
        sortOrder: -1,
        organizationId: org.id,
        basePlanId: trialPlanResult.plan.id,
      });

      const result = await PlansService.getTrialPlan();

      expect(result.id).toBe(trialPlanResult.plan.id);
      expect(result.id).not.toBe(privatePlanId);
    });

    test("should return trial plan with single pricing tier", async () => {
      await PlanFactory.createTrial();

      const trialPlan = await PlansService.getTrialPlan();

      expect(trialPlan.pricingTiers).toBeArray();
      expect(trialPlan.pricingTiers.length).toBe(1);
      expect(trialPlan.pricingTiers[0].priceMonthly).toBe(0);
    });
  });

  describe("getTierById", () => {
    test("should return tier with correct data", async () => {
      const planResult = await PlanFactory.createPaid("gold");
      const expectedTier = planResult.tiers[0];

      const result = await PlansService.getTierById(expectedTier.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(expectedTier.id);
      expect(result.minEmployees).toBe(expectedTier.minEmployees);
      expect(result.maxEmployees).toBe(expectedTier.maxEmployees);
      expect(result.priceMonthly).toBe(expectedTier.priceMonthly);
      expect(result.priceYearly).toBe(expectedTier.priceYearly);
    });

    test("should throw TierNotFoundError for non-existent tier", async () => {
      await expect(() =>
        PlansService.getTierById("tier-non-existent-id")
      ).toThrow(TierNotFoundError);
    });

    test("should throw for archived tier", async () => {
      const { plan } = await PlanFactory.createPaid("gold");

      // Get the tier ID before archiving
      const originalTiers = await db
        .select()
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.planId, plan.id));

      const tierToArchive = originalTiers[0];

      // Archive the tier (simulate what replaceTiers does)
      await db
        .update(schema.planPricingTiers)
        .set({ archivedAt: new Date() })
        .where(eq(schema.planPricingTiers.id, tierToArchive.id));

      // getTierById should not find archived tiers
      expect(() => PlansService.getTierById(tierToArchive.id)).toThrow();
    });
  });
});
