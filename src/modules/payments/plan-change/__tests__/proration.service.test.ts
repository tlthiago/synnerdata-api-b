import { describe, expect, test } from "bun:test";
import { ProrationService } from "../proration.service";

describe("ProrationService", () => {
  describe("getChangeType", () => {
    test("should return upgrade when new price is higher (same billing cycle)", () => {
      const result = ProrationService.getChangeType({
        currentPlanPrice: 1000,
        newPlanPrice: 2000,
        currentBillingCycle: "monthly",
        newBillingCycle: "monthly",
      });

      expect(result).toBe("upgrade");
    });

    test("should return downgrade when new price is lower (same billing cycle)", () => {
      const result = ProrationService.getChangeType({
        currentPlanPrice: 2000,
        newPlanPrice: 1000,
        currentBillingCycle: "monthly",
        newBillingCycle: "monthly",
      });

      expect(result).toBe("downgrade");
    });

    test("should return upgrade when switching from monthly to yearly", () => {
      const result = ProrationService.getChangeType({
        currentPlanPrice: 1000,
        newPlanPrice: 1000,
        currentBillingCycle: "monthly",
        newBillingCycle: "yearly",
      });

      expect(result).toBe("upgrade");
    });

    test("should return downgrade when switching from yearly to monthly", () => {
      const result = ProrationService.getChangeType({
        currentPlanPrice: 1000,
        newPlanPrice: 1000,
        currentBillingCycle: "yearly",
        newBillingCycle: "monthly",
      });

      expect(result).toBe("downgrade");
    });

    test("should prioritize billing cycle change over price (monthly to yearly is upgrade)", () => {
      const result = ProrationService.getChangeType({
        currentPlanPrice: 2000,
        newPlanPrice: 1000,
        currentBillingCycle: "monthly",
        newBillingCycle: "yearly",
      });

      expect(result).toBe("upgrade");
    });

    test("should prioritize billing cycle change over price (yearly to monthly is downgrade)", () => {
      const result = ProrationService.getChangeType({
        currentPlanPrice: 1000,
        newPlanPrice: 2000,
        currentBillingCycle: "yearly",
        newBillingCycle: "monthly",
      });

      expect(result).toBe("downgrade");
    });

    test("should return upgrade when prices are equal (same billing cycle)", () => {
      const result = ProrationService.getChangeType({
        currentPlanPrice: 1000,
        newPlanPrice: 1000,
        currentBillingCycle: "monthly",
        newBillingCycle: "monthly",
      });

      expect(result).toBe("upgrade");
    });
  });

  describe("calculateProration", () => {
    test("should return full price difference when at start of period", () => {
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const result = ProrationService.calculateProration({
        currentPlanPrice: 1000,
        newPlanPrice: 2000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result).toBe(1000);
    });

    test("should return approximately half when halfway through period", () => {
      const now = new Date();
      const periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 15);
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 15);

      const result = ProrationService.calculateProration({
        currentPlanPrice: 1000,
        newPlanPrice: 2000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result).toBeGreaterThan(400);
      expect(result).toBeLessThan(600);
    });

    test("should return 0 for downgrade (new price lower)", () => {
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const result = ProrationService.calculateProration({
        currentPlanPrice: 2000,
        newPlanPrice: 1000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result).toBe(0);
    });

    test("should return 0 when prices are equal", () => {
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const result = ProrationService.calculateProration({
        currentPlanPrice: 1000,
        newPlanPrice: 1000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result).toBe(0);
    });

    test("should return 0 when period has ended", () => {
      const now = new Date();
      const periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 30);
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() - 1);

      const result = ProrationService.calculateProration({
        currentPlanPrice: 1000,
        newPlanPrice: 2000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result).toBe(0);
    });

    test("should handle yearly period correctly", () => {
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);

      const result = ProrationService.calculateProration({
        currentPlanPrice: 10_000,
        newPlanPrice: 20_000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result).toBe(10_000);
    });
  });

  describe("calculatePeriodEnd", () => {
    test("should add 1 month for monthly billing cycle", () => {
      const start = new Date("2024-01-15");
      const result = ProrationService.calculatePeriodEnd(start, "monthly");

      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(15);
    });

    test("should add 1 year for yearly billing cycle", () => {
      const start = new Date("2024-01-15");
      const result = ProrationService.calculatePeriodEnd(start, "yearly");

      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(15);
    });
  });

  describe("getCurrentPrice", () => {
    test("should return monthly price for monthly billing cycle", () => {
      const tier = { priceMonthly: 1000, priceYearly: 10_000 };
      const result = ProrationService.getCurrentPrice(tier, "monthly");

      expect(result).toBe(1000);
    });

    test("should return yearly price for yearly billing cycle", () => {
      const tier = { priceMonthly: 1000, priceYearly: 10_000 };
      const result = ProrationService.getCurrentPrice(tier, "yearly");

      expect(result).toBe(10_000);
    });
  });
});
