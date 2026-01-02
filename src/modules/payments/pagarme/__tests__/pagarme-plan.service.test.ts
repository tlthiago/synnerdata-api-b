import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { PricingTierNotFoundError } from "@/modules/payments/errors";
import { PagarmePlanService } from "@/modules/payments/pagarme/pagarme-plan.service";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { skipIntegration } from "@/test/support/skip-integration";

describe("PagarmePlanService", () => {
  describe("ensurePlan - cache hit (no API call)", () => {
    test("should return existing pagarmePlanIdMonthly when cached", async () => {
      const planResult = await PlanFactory.createPaid("gold");
      const tier = PlanFactory.getFirstTier(planResult);

      const cachedPlanId = `plan_cached_monthly_${crypto.randomUUID().slice(0, 8)}`;

      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdMonthly: cachedPlanId })
        .where(eq(schema.planPricingTiers.id, tier.id));

      const result = await PagarmePlanService.ensurePlan(tier.id, "monthly");

      expect(result).toBe(cachedPlanId);
    });

    test("should return existing pagarmePlanIdYearly when cached", async () => {
      const planResult = await PlanFactory.createPaid("gold");
      const tier = PlanFactory.getFirstTier(planResult);

      const cachedPlanId = `plan_cached_yearly_${crypto.randomUUID().slice(0, 8)}`;

      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdYearly: cachedPlanId })
        .where(eq(schema.planPricingTiers.id, tier.id));

      const result = await PagarmePlanService.ensurePlan(tier.id, "yearly");

      expect(result).toBe(cachedPlanId);
    });

    test("should return monthly cache even if yearly is also cached", async () => {
      const planResult = await PlanFactory.createPaid("gold");
      const tier = PlanFactory.getFirstTier(planResult);

      const monthlyPlanId = `plan_monthly_${crypto.randomUUID().slice(0, 8)}`;
      const yearlyPlanId = `plan_yearly_${crypto.randomUUID().slice(0, 8)}`;

      await db
        .update(schema.planPricingTiers)
        .set({
          pagarmePlanIdMonthly: monthlyPlanId,
          pagarmePlanIdYearly: yearlyPlanId,
        })
        .where(eq(schema.planPricingTiers.id, tier.id));

      const result = await PagarmePlanService.ensurePlan(tier.id, "monthly");

      expect(result).toBe(monthlyPlanId);
    });

    test("should return yearly cache even if monthly is also cached", async () => {
      const planResult = await PlanFactory.createPaid("gold");
      const tier = PlanFactory.getFirstTier(planResult);

      const monthlyPlanId = `plan_monthly_${crypto.randomUUID().slice(0, 8)}`;
      const yearlyPlanId = `plan_yearly_${crypto.randomUUID().slice(0, 8)}`;

      await db
        .update(schema.planPricingTiers)
        .set({
          pagarmePlanIdMonthly: monthlyPlanId,
          pagarmePlanIdYearly: yearlyPlanId,
        })
        .where(eq(schema.planPricingTiers.id, tier.id));

      const result = await PagarmePlanService.ensurePlan(tier.id, "yearly");

      expect(result).toBe(yearlyPlanId);
    });
  });

  describe("ensurePlan - validation errors", () => {
    test("should throw PricingTierNotFoundError for non-existent tier", async () => {
      await expect(
        PagarmePlanService.ensurePlan("tier-non-existent-id", "monthly")
      ).rejects.toBeInstanceOf(PricingTierNotFoundError);
    });

    test("should throw PricingTierNotFoundError for invalid tier id format", async () => {
      await expect(
        PagarmePlanService.ensurePlan("invalid-id", "yearly")
      ).rejects.toBeInstanceOf(PricingTierNotFoundError);
    });

    // Note: PlanNotFoundError test removed because FK constraint with cascade delete
    // prevents orphan tiers. The error path is unreachable in normal operation.
  });

  describe.skipIf(skipIntegration)(
    "ensurePlan - integration (Pagarme API)",
    () => {
      test("should create plan in Pagarme and save ID to database", async () => {
        const planResult = await PlanFactory.createPaid("diamond");
        const tier = PlanFactory.getFirstTier(planResult);

        // Verify tier has no cached plan ID
        const [tierBefore] = await db
          .select({
            pagarmePlanIdMonthly: schema.planPricingTiers.pagarmePlanIdMonthly,
          })
          .from(schema.planPricingTiers)
          .where(eq(schema.planPricingTiers.id, tier.id))
          .limit(1);

        expect(tierBefore.pagarmePlanIdMonthly).toBeNull();

        // First call - should create plan in Pagarme
        const pagarmePlanId = await PagarmePlanService.ensurePlan(
          tier.id,
          "monthly"
        );

        expect(pagarmePlanId).toBeDefined();
        expect(pagarmePlanId).toStartWith("plan_");

        // Verify plan ID was saved to database
        const [tierAfter] = await db
          .select({
            pagarmePlanIdMonthly: schema.planPricingTiers.pagarmePlanIdMonthly,
          })
          .from(schema.planPricingTiers)
          .where(eq(schema.planPricingTiers.id, tier.id))
          .limit(1);

        expect(tierAfter.pagarmePlanIdMonthly).toBe(pagarmePlanId);
      });

      test("should return same plan ID on subsequent calls (no duplicate)", async () => {
        const planResult = await PlanFactory.createPaid("platinum");
        const tier = PlanFactory.getFirstTier(planResult);

        // First call - creates plan
        const firstPlanId = await PagarmePlanService.ensurePlan(
          tier.id,
          "monthly"
        );

        // Second call - should return cached
        const secondPlanId = await PagarmePlanService.ensurePlan(
          tier.id,
          "monthly"
        );

        expect(secondPlanId).toBe(firstPlanId);
      });

      test("should create separate plans for monthly and yearly", async () => {
        const planResult = await PlanFactory.createPaid("gold");
        const tier = PlanFactory.getFirstTier(planResult);

        const monthlyPlanId = await PagarmePlanService.ensurePlan(
          tier.id,
          "monthly"
        );

        const yearlyPlanId = await PagarmePlanService.ensurePlan(
          tier.id,
          "yearly"
        );

        expect(monthlyPlanId).toStartWith("plan_");
        expect(yearlyPlanId).toStartWith("plan_");
        expect(monthlyPlanId).not.toBe(yearlyPlanId);

        // Verify both were saved
        const [tierAfter] = await db
          .select({
            pagarmePlanIdMonthly: schema.planPricingTiers.pagarmePlanIdMonthly,
            pagarmePlanIdYearly: schema.planPricingTiers.pagarmePlanIdYearly,
          })
          .from(schema.planPricingTiers)
          .where(eq(schema.planPricingTiers.id, tier.id))
          .limit(1);

        expect(tierAfter.pagarmePlanIdMonthly).toBe(monthlyPlanId);
        expect(tierAfter.pagarmePlanIdYearly).toBe(yearlyPlanId);
      });
    }
  );
});
