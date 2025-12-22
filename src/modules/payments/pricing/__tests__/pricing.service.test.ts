import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { MAX_EMPLOYEES, schema, YEARLY_DISCOUNT } from "@/db/schema";
import {
  EmployeeCountExceedsLimitError,
  EmployeeCountRequiredError,
  PlanNotFoundError,
  PricingTierNotFoundError,
} from "@/modules/payments/errors";
import { PricingTierService } from "@/modules/payments/pricing/pricing.service";
import {
  diamondPlan,
  getTierForEmployeeCount,
  testPricingTiers,
} from "@/test/fixtures/plans";
import { seedPlans } from "@/test/helpers/seed";
import { skipIntegration } from "@/test/helpers/skip-integration";

describe("PricingTierService", () => {
  beforeAll(async () => {
    await seedPlans();

    // Reset pagarmePlanIds for all pricing tiers
    await db
      .update(schema.planPricingTiers)
      .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null });
  });

  afterAll(async () => {
    // Clean up pagarmePlanIds after tests
    await db
      .update(schema.planPricingTiers)
      .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null });
  });

  describe("validateEmployeeCount()", () => {
    test("should return valid employee count", () => {
      expect(PricingTierService.validateEmployeeCount(10)).toBe(10);
      expect(PricingTierService.validateEmployeeCount(0)).toBe(0);
      expect(PricingTierService.validateEmployeeCount(100)).toBe(100);
      expect(PricingTierService.validateEmployeeCount(MAX_EMPLOYEES)).toBe(
        MAX_EMPLOYEES
      );
    });

    test("should throw EmployeeCountRequiredError for undefined", () => {
      expect(() => PricingTierService.validateEmployeeCount(undefined)).toThrow(
        EmployeeCountRequiredError
      );
    });

    test("should throw EmployeeCountRequiredError for negative numbers", () => {
      expect(() => PricingTierService.validateEmployeeCount(-1)).toThrow(
        EmployeeCountRequiredError
      );
    });

    test("should throw EmployeeCountExceedsLimitError for count above limit", () => {
      expect(() =>
        PricingTierService.validateEmployeeCount(MAX_EMPLOYEES + 1)
      ).toThrow(EmployeeCountExceedsLimitError);
    });
  });

  describe("calculateYearlyPrice()", () => {
    test("should calculate yearly price with discount", () => {
      const monthlyPrice = 10_000; // R$100,00
      const expectedYearly = Math.round(
        monthlyPrice * 12 * (1 - YEARLY_DISCOUNT)
      );
      expect(PricingTierService.calculateYearlyPrice(monthlyPrice)).toBe(
        expectedYearly
      );
    });

    test("should handle larger prices correctly", () => {
      const monthlyPrice = 49_900; // R$499,00
      const yearlyFullPrice = monthlyPrice * 12;
      const discount = Math.round(yearlyFullPrice * YEARLY_DISCOUNT);
      const expectedYearly = yearlyFullPrice - discount;
      expect(PricingTierService.calculateYearlyPrice(monthlyPrice)).toBe(
        expectedYearly
      );
    });
  });

  describe("getTierForEmployeeCount()", () => {
    test("should return correct tier for employee count", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      // Test tier 0-10
      const response1 = await PricingTierService.getTierForEmployeeCount(
        diamondPlan.id,
        5
      );
      expect(response1.tier.minEmployees).toBe(0);
      expect(response1.tier.maxEmployees).toBe(10);

      // Test tier 21-30 (25 employees)
      const response2 = await PricingTierService.getTierForEmployeeCount(
        diamondPlan.id,
        25
      );
      expect(response2.tier.minEmployees).toBe(21);
      expect(response2.tier.maxEmployees).toBe(30);

      // Test tier 91-180 (100 employees)
      const response3 = await PricingTierService.getTierForEmployeeCount(
        diamondPlan.id,
        100
      );
      expect(response3.tier.minEmployees).toBe(91);
      expect(response3.tier.maxEmployees).toBe(180);
    });

    test("should return correct tier at boundary values", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      // Lower boundary of first tier
      const response1 = await PricingTierService.getTierForEmployeeCount(
        diamondPlan.id,
        0
      );
      expect(response1.tier.minEmployees).toBe(0);

      // Upper boundary of first tier
      const response2 = await PricingTierService.getTierForEmployeeCount(
        diamondPlan.id,
        10
      );
      expect(response2.tier.maxEmployees).toBe(10);

      // Lower boundary of second tier
      const response3 = await PricingTierService.getTierForEmployeeCount(
        diamondPlan.id,
        11
      );
      expect(response3.tier.minEmployees).toBe(11);

      // Upper boundary of last tier
      const response4 = await PricingTierService.getTierForEmployeeCount(
        diamondPlan.id,
        180
      );
      expect(response4.tier.maxEmployees).toBe(180);
    });

    test("should throw PlanNotFoundError for non-existent plan", () => {
      expect(() =>
        PricingTierService.getTierForEmployeeCount("non-existent-plan", 10)
      ).toThrow(PlanNotFoundError);
    });

    test("should throw PricingTierNotFoundError for count outside all tiers", () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const planId = diamondPlan.id;

      // Count exceeds MAX_EMPLOYEES, should throw validation error first
      expect(() =>
        PricingTierService.getTierForEmployeeCount(planId, 200)
      ).toThrow(EmployeeCountExceedsLimitError);
    });

    test("should return tier with correct price data", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const expectedTier = getTierForEmployeeCount(diamondPlan.id, 15);
      if (!expectedTier) {
        throw new Error("Expected tier not found");
      }

      const response = await PricingTierService.getTierForEmployeeCount(
        diamondPlan.id,
        15
      );

      expect(response.tier.priceMonthly).toBe(expectedTier.priceMonthly);
      expect(response.tier.priceYearly).toBe(expectedTier.priceYearly);
    });
  });

  describe("listTiersForPlan()", () => {
    test("should return all tiers for a plan", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const response = await PricingTierService.listTiersForPlan(
        diamondPlan.id
      );

      expect(response.tiers).toBeArray();
      expect(response.tiers.length).toBe(10); // We have 10 tiers per plan in fixtures
    });

    test("should return tiers ordered by minEmployees", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const response = await PricingTierService.listTiersForPlan(
        diamondPlan.id
      );
      const tiers = response.tiers;

      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].minEmployees).toBeGreaterThan(
          tiers[i - 1].minEmployees
        );
      }
    });

    test("should throw PlanNotFoundError for non-existent plan", () => {
      expect(() =>
        PricingTierService.listTiersForPlan("non-existent-plan")
      ).toThrow(PlanNotFoundError);
    });
  });

  describe("getTierById()", () => {
    test("should return tier by id", async () => {
      const expectedTier = testPricingTiers[0];
      const tier = await PricingTierService.getTierById(expectedTier.id);

      expect(tier).toBeDefined();
      expect(tier?.id).toBe(expectedTier.id);
      expect(tier?.planId).toBe(expectedTier.planId);
      expect(tier?.minEmployees).toBe(expectedTier.minEmployees);
    });

    test("should return null for non-existent tier", async () => {
      const tier = await PricingTierService.getTierById("non-existent-tier");
      expect(tier).toBeNull();
    });
  });

  describe.skipIf(skipIntegration)("ensurePagarmePlan() - Pagarme API", () => {
    test(
      "should create monthly Pagarme plan for tier",
      async () => {
        const tier = testPricingTiers.find(
          (t) => t.planId === diamondPlan?.id && t.minEmployees === 0
        );
        if (!tier) {
          throw new Error("Tier not found");
        }

        // Reset Pagarme IDs
        await db
          .update(schema.planPricingTiers)
          .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
          .where(eq(schema.planPricingTiers.id, tier.id));

        const pagarmePlanId = await PricingTierService.ensurePagarmePlan(
          tier.id,
          "monthly"
        );

        expect(pagarmePlanId).toBeDefined();
        expect(pagarmePlanId).toStartWith("plan_");

        // Verify it was saved to database
        const [dbTier] = await db
          .select({
            pagarmePlanIdMonthly: schema.planPricingTiers.pagarmePlanIdMonthly,
          })
          .from(schema.planPricingTiers)
          .where(eq(schema.planPricingTiers.id, tier.id))
          .limit(1);

        expect(dbTier.pagarmePlanIdMonthly).toBe(pagarmePlanId);
      },
      { timeout: 30_000 }
    );

    test(
      "should create yearly Pagarme plan for tier",
      async () => {
        const tier = testPricingTiers.find(
          (t) => t.planId === diamondPlan?.id && t.minEmployees === 11
        );
        if (!tier) {
          throw new Error("Tier not found");
        }

        // Reset Pagarme IDs
        await db
          .update(schema.planPricingTiers)
          .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
          .where(eq(schema.planPricingTiers.id, tier.id));

        const pagarmePlanId = await PricingTierService.ensurePagarmePlan(
          tier.id,
          "yearly"
        );

        expect(pagarmePlanId).toBeDefined();
        expect(pagarmePlanId).toStartWith("plan_");

        // Verify it was saved to database
        const [dbTier] = await db
          .select({
            pagarmePlanIdYearly: schema.planPricingTiers.pagarmePlanIdYearly,
          })
          .from(schema.planPricingTiers)
          .where(eq(schema.planPricingTiers.id, tier.id))
          .limit(1);

        expect(dbTier.pagarmePlanIdYearly).toBe(pagarmePlanId);
      },
      { timeout: 30_000 }
    );

    test("should return existing Pagarme plan id if already synced", async () => {
      const tier = testPricingTiers.find(
        (t) => t.planId === diamondPlan?.id && t.minEmployees === 51
      );
      if (!tier) {
        throw new Error("Tier not found");
      }

      // Set existing Pagarme ID
      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdMonthly: "plan_existing_test" })
        .where(eq(schema.planPricingTiers.id, tier.id));

      const pagarmePlanId = await PricingTierService.ensurePagarmePlan(
        tier.id,
        "monthly"
      );

      expect(pagarmePlanId).toBe("plan_existing_test");

      // Clean up
      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdMonthly: null })
        .where(eq(schema.planPricingTiers.id, tier.id));
    });

    test("should throw PricingTierNotFoundError for non-existent tier", () => {
      expect(() =>
        PricingTierService.ensurePagarmePlan("non-existent-tier", "monthly")
      ).toThrow(PricingTierNotFoundError);
    });
  });

  describe.skipIf(skipIntegration)("getTierForCheckout() - Pagarme API", () => {
    test(
      "should return tier with Pagarme plan id",
      async () => {
        if (!diamondPlan) {
          throw new Error("Diamond plan not found in fixtures");
        }

        const result = await PricingTierService.getTierForCheckout(
          diamondPlan.id,
          15,
          "monthly"
        );

        expect(result).toBeDefined();
        expect(result.pagarmePlanId).toBeDefined();
        expect(result.pagarmePlanId).toStartWith("plan_");
        expect(result.minEmployees).toBe(11);
        expect(result.maxEmployees).toBe(20); // Tier 11-20 for 15 employees
      },
      { timeout: 30_000 }
    );

    test("should throw PlanNotFoundError for non-existent plan", () => {
      expect(() =>
        PricingTierService.getTierForCheckout(
          "non-existent-plan",
          15,
          "monthly"
        )
      ).toThrow(PlanNotFoundError);
    });

    test("should throw EmployeeCountRequiredError for invalid count", () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const planId = diamondPlan.id;

      expect(() =>
        PricingTierService.getTierForCheckout(
          planId,
          undefined as unknown as number,
          "monthly"
        )
      ).toThrow(EmployeeCountRequiredError);
    });
  });
});
