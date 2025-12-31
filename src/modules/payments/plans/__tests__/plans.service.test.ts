import { describe, expect, test } from "bun:test";
import {
  PlanNotAvailableError,
  PlanNotFoundError,
} from "@/modules/payments/errors";
import { PlansService } from "@/modules/payments/plans/plans.service";
import {
  createInactivePlan,
  createPaidPlan,
  createTrialPlan,
} from "@/test/factories/plan";

describe("PlansService", () => {
  describe("getAvailableById", () => {
    test("should return active plan", async () => {
      const { plan } = await createPaidPlan("gold");

      const result = await PlansService.getAvailableById(plan.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(plan.id);
      expect(result.isActive).toBe(true);
    });

    test("should throw PlanNotAvailableError for inactive plan", async () => {
      const { plan: inactivePlan } = await createInactivePlan({ type: "gold" });

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
      await createTrialPlan();

      const trialPlan = await PlansService.getTrialPlan();

      expect(trialPlan).toBeDefined();
      expect(trialPlan.isTrial).toBe(true);
      expect(trialPlan.trialDays).toBeGreaterThan(0);
    });

    test("should return trial plan with single pricing tier", async () => {
      await createTrialPlan();

      const trialPlan = await PlansService.getTrialPlan();

      expect(trialPlan.pricingTiers).toBeArray();
      expect(trialPlan.pricingTiers.length).toBe(1);
      expect(trialPlan.pricingTiers[0].priceMonthly).toBe(0);
    });
  });

  describe("getTierById", () => {
    test("should return tier with correct data", async () => {
      const planResult = await createPaidPlan("gold");
      const expectedTier = planResult.tiers[0];

      const result = await PlansService.getTierById(expectedTier.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(expectedTier.id);
      expect(result.minEmployees).toBe(expectedTier.minEmployees);
      expect(result.maxEmployees).toBe(expectedTier.maxEmployees);
      expect(result.priceMonthly).toBe(expectedTier.priceMonthly);
      expect(result.priceYearly).toBe(expectedTier.priceYearly);
    });

    test("should throw PricingTierNotFoundError for non-existent tier", () => {
      expect(() => PlansService.getTierById("tier-non-existent-id")).toThrow();
    });
  });
});
