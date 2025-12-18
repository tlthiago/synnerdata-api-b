import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  NoScheduledChangeError,
  PlanChangeInProgressError,
  SameBillingCycleError,
  SamePlanError,
  SubscriptionNotActiveError,
} from "@/modules/payments/errors";
import { PlanChangeService } from "@/modules/payments/plan-change/plan-change.service";
import { createTestOrganization } from "@/test/helpers/organization";
import { seedPlans } from "@/test/helpers/seed";
import {
  createActiveSubscription,
  createTestSubscription,
} from "@/test/helpers/subscription";

describe("PlanChangeService", () => {
  beforeAll(async () => {
    await seedPlans();
  });

  describe("getChangeType", () => {
    test("should return upgrade for higher price", () => {
      const result = PlanChangeService.getChangeType({
        currentPlanPrice: 5000,
        newPlanPrice: 10_000,
        currentBillingCycle: "monthly",
        newBillingCycle: "monthly",
      });

      expect(result).toBe("upgrade");
    });

    test("should return downgrade for lower price", () => {
      const result = PlanChangeService.getChangeType({
        currentPlanPrice: 10_000,
        newPlanPrice: 5000,
        currentBillingCycle: "monthly",
        newBillingCycle: "monthly",
      });

      expect(result).toBe("downgrade");
    });

    test("should return upgrade for monthly to yearly (same plan)", () => {
      const result = PlanChangeService.getChangeType({
        currentPlanPrice: 5000,
        newPlanPrice: 50_000,
        currentBillingCycle: "monthly",
        newBillingCycle: "yearly",
      });

      expect(result).toBe("upgrade");
    });

    test("should return downgrade for yearly to monthly (same plan)", () => {
      const result = PlanChangeService.getChangeType({
        currentPlanPrice: 50_000,
        newPlanPrice: 5000,
        currentBillingCycle: "yearly",
        newBillingCycle: "monthly",
      });

      expect(result).toBe("downgrade");
    });

    test("should normalize yearly prices to monthly equivalent", () => {
      // Yearly at 12000 = monthly equivalent of 1000
      // Monthly at 900 = monthly equivalent of 900
      // So yearly to monthly at lower price is downgrade
      const result = PlanChangeService.getChangeType({
        currentPlanPrice: 12_000,
        newPlanPrice: 900,
        currentBillingCycle: "yearly",
        newBillingCycle: "monthly",
      });

      expect(result).toBe("downgrade");
    });

    test("should detect upgrade when yearly equivalent is higher", () => {
      // Current: monthly at 1000
      // New: yearly at 24000 = monthly equivalent of 2000
      const result = PlanChangeService.getChangeType({
        currentPlanPrice: 1000,
        newPlanPrice: 24_000,
        currentBillingCycle: "monthly",
        newBillingCycle: "yearly",
      });

      expect(result).toBe("upgrade");
    });
  });

  describe("calculateProration", () => {
    test("should return full price difference for first day of period", () => {
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const result = PlanChangeService.calculateProration({
        currentPlanPrice: 5000,
        newPlanPrice: 10_000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      // On first day, almost full price difference
      expect(result).toBeGreaterThan(4500);
      expect(result).toBeLessThanOrEqual(5000);
    });

    test("should return half price difference for middle of period", () => {
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 15);
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 15);

      const result = PlanChangeService.calculateProration({
        currentPlanPrice: 5000,
        newPlanPrice: 10_000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      // Around middle, should be around half
      expect(result).toBeGreaterThan(2000);
      expect(result).toBeLessThan(3000);
    });

    test("should return near zero for last day of period", () => {
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 29);
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 1);

      const result = PlanChangeService.calculateProration({
        currentPlanPrice: 5000,
        newPlanPrice: 10_000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      // Near end, should be very small
      expect(result).toBeLessThan(500);
    });

    test("should return zero for downgrade (new price lower)", () => {
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const result = PlanChangeService.calculateProration({
        currentPlanPrice: 10_000,
        newPlanPrice: 5000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result).toBe(0);
    });

    test("should return zero for same price", () => {
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const result = PlanChangeService.calculateProration({
        currentPlanPrice: 5000,
        newPlanPrice: 5000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result).toBe(0);
    });

    test("should return zero when period has ended", () => {
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 31);
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() - 1);

      const result = PlanChangeService.calculateProration({
        currentPlanPrice: 5000,
        newPlanPrice: 10_000,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result).toBe(0);
    });
  });

  describe("getScheduledChange", () => {
    test("should return hasScheduledChange false when no change is scheduled", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      const result = await PlanChangeService.getScheduledChange(org.id);

      expect(result.hasScheduledChange).toBe(false);
      expect(result.change).toBeUndefined();
    });

    test("should return scheduled change details when change is pending", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 30);

      await db
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: "test-plan-gold",
          pendingBillingCycle: "monthly",
          planChangeAt: scheduledAt,
        })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await PlanChangeService.getScheduledChange(org.id);

      expect(result.hasScheduledChange).toBe(true);
      expect(result.change?.pendingPlanId).toBe("test-plan-gold");
      expect(result.change?.pendingBillingCycle).toBe("monthly");
    });
  });

  describe("cancelScheduledChange", () => {
    test("should cancel a scheduled plan change", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 30);

      await db
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: "test-plan-gold",
          pendingBillingCycle: "monthly",
          planChangeAt: scheduledAt,
        })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await PlanChangeService.cancelScheduledChange({
        userId: "test-user",
        organizationId: org.id,
      });

      expect(result.canceled).toBe(true);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.pendingPlanId).toBeNull();
      expect(subscription.pendingBillingCycle).toBeNull();
      expect(subscription.planChangeAt).toBeNull();
    });

    test("should throw NoScheduledChangeError when no change is scheduled", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      await expect(
        PlanChangeService.cancelScheduledChange({
          userId: "test-user",
          organizationId: org.id,
        })
      ).rejects.toBeInstanceOf(NoScheduledChangeError);
    });
  });

  describe("changePlan validation", () => {
    test("should throw SamePlanError for same plan", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      await expect(
        PlanChangeService.changePlan({
          userId: "test-user",
          organizationId: org.id,
          newPlanId: "test-plan-diamond",
          successUrl: "https://example.com/success",
        })
      ).rejects.toBeInstanceOf(SamePlanError);
    });

    test("should throw SubscriptionNotActiveError for trial subscription", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-diamond", "trial");

      await expect(
        PlanChangeService.changePlan({
          userId: "test-user",
          organizationId: org.id,
          newPlanId: "test-plan-gold",
          successUrl: "https://example.com/success",
        })
      ).rejects.toBeInstanceOf(SubscriptionNotActiveError);
    });

    test("should throw PlanChangeInProgressError when change is already scheduled", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 30);

      await db
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: "test-plan-gold",
          planChangeAt: scheduledAt,
        })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      await expect(
        PlanChangeService.changePlan({
          userId: "test-user",
          organizationId: org.id,
          newPlanId: "test-plan-platinum",
          successUrl: "https://example.com/success",
        })
      ).rejects.toBeInstanceOf(PlanChangeInProgressError);
    });

    test("should throw SubscriptionNotActiveError when cancelAtPeriodEnd is true", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      await db
        .update(schema.orgSubscriptions)
        .set({ cancelAtPeriodEnd: true })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      await expect(
        PlanChangeService.changePlan({
          userId: "test-user",
          organizationId: org.id,
          newPlanId: "test-plan-gold",
          successUrl: "https://example.com/success",
        })
      ).rejects.toBeInstanceOf(SubscriptionNotActiveError);
    });
  });

  describe("changeBillingCycle validation", () => {
    test("should throw SameBillingCycleError for same billing cycle", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      await expect(
        PlanChangeService.changeBillingCycle({
          userId: "test-user",
          organizationId: org.id,
          newBillingCycle: "monthly",
          successUrl: "https://example.com/success",
        })
      ).rejects.toBeInstanceOf(SameBillingCycleError);
    });
  });
});
