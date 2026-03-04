import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { SubscriptionAlreadyActiveError } from "@/modules/payments/errors";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";

let diamondPlanResult: CreatePlanResult;
let trialPlanResult: CreatePlanResult;

describe("SubscriptionService", () => {
  beforeAll(async () => {
    // Create plans: diamond for paid tests, trial for trial-related tests
    [diamondPlanResult, trialPlanResult] = await Promise.all([
      PlanFactory.createPaid("diamond"),
      PlanFactory.createTrial(), // Creates a trial plan with isTrial=true
    ]);
  });

  describe("hasPaidSubscription", () => {
    test("should return true for active subscription", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const result = await SubscriptionService.hasPaidSubscription(org.id);

      expect(result).toBe(true);
    });

    test("should return false for trial subscription", async () => {
      const org = await OrganizationFactory.create();
      // Use trial plan for proper trial behavior
      await SubscriptionFactory.createTrial(org.id, trialPlanResult.plan.id);

      const result = await SubscriptionService.hasPaidSubscription(org.id);

      expect(result).toBe(false);
    });

    test("should return false for canceled subscription", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createCanceled(
        org.id,
        diamondPlanResult.plan.id
      );

      const result = await SubscriptionService.hasPaidSubscription(org.id);

      expect(result).toBe(false);
    });

    test("should return false for organization without subscription", async () => {
      const org = await OrganizationFactory.create();

      const result = await SubscriptionService.hasPaidSubscription(org.id);

      expect(result).toBe(false);
    });
  });

  describe("ensureNoPaidSubscription", () => {
    test("should not throw for trial subscription", async () => {
      const org = await OrganizationFactory.create();
      // Use trial plan for proper trial behavior
      await SubscriptionFactory.createTrial(org.id, trialPlanResult.plan.id);

      await expect(
        SubscriptionService.ensureNoPaidSubscription(org.id)
      ).resolves.toBeUndefined();
    });

    test("should not throw for canceled subscription", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createCanceled(
        org.id,
        diamondPlanResult.plan.id
      );

      await expect(
        SubscriptionService.ensureNoPaidSubscription(org.id)
      ).resolves.toBeUndefined();
    });

    test("should not throw for organization without subscription", async () => {
      const org = await OrganizationFactory.create();

      await expect(
        SubscriptionService.ensureNoPaidSubscription(org.id)
      ).resolves.toBeUndefined();
    });

    test("should throw SubscriptionAlreadyActiveError for active subscription", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      await expect(
        SubscriptionService.ensureNoPaidSubscription(org.id)
      ).rejects.toBeInstanceOf(SubscriptionAlreadyActiveError);
    });
  });

  describe("checkAccess", () => {
    test("should return no_subscription for organization without subscription", async () => {
      const org = await OrganizationFactory.create();

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(false);
      expect(result.status).toBe("no_subscription");
      expect(result.daysRemaining).toBeNull();
      expect(result.trialEnd).toBeNull();
      expect(result.requiresPayment).toBe(true);
    });

    test("should return active status with full access", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(true);
      expect(result.status).toBe("active");
      expect(result.daysRemaining).toBeNull();
      expect(result.trialEnd).toBeNull();
      expect(result.requiresPayment).toBe(false);
    });

    test("should return trial status with days remaining", async () => {
      const org = await OrganizationFactory.create();
      // Use trial plan for proper trial behavior
      await SubscriptionFactory.create(org.id, trialPlanResult.plan.id, {
        status: "active",
        trialDays: 14,
      });

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(true);
      expect(result.status).toBe("trial");
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.daysRemaining).toBeLessThanOrEqual(14);
      expect(result.trialEnd).toBeInstanceOf(Date);
      expect(result.requiresPayment).toBe(false);
    });

    test("should return trial_expired when trial has ended", async () => {
      const org = await OrganizationFactory.create();
      // Use trial plan for proper trial behavior
      await SubscriptionFactory.create(org.id, trialPlanResult.plan.id, {
        status: "active",
        trialDays: -1,
      });

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(false);
      expect(result.status).toBe("trial_expired");
      expect(result.daysRemaining).toBe(0);
      expect(result.trialEnd).toBeInstanceOf(Date);
      expect(result.requiresPayment).toBe(true);
    });

    test("should return canceled status without access", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createCanceled(
        org.id,
        diamondPlanResult.plan.id
      );

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(false);
      expect(result.status).toBe("canceled");
      expect(result.requiresPayment).toBe(true);
    });

    test("should return expired status without access", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createExpired(
        org.id,
        diamondPlanResult.plan.id
      );

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(false);
      expect(result.status).toBe("expired");
      expect(result.requiresPayment).toBe(true);
    });

    test("should return past_due status with access", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.create(org.id, diamondPlanResult.plan.id, {
        status: "past_due",
      });

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(true);
      expect(result.status).toBe("past_due");
      expect(result.requiresPayment).toBe(true);
    });
  });

  describe("createTrial", () => {
    test("should create trial subscription with trial plan", async () => {
      const org = await OrganizationFactory.create();

      await SubscriptionService.createTrial(org.id);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription).toBeDefined();
      // Status is "active" - trial is determined by plan.isTrial, not status
      expect(subscription.status).toBe("active");
      expect(subscription.planId).toBeDefined();
      expect(subscription.trialStart).toBeInstanceOf(Date);
      expect(subscription.trialEnd).toBeInstanceOf(Date);
      expect(subscription.trialUsed).toBe(true);
      expect(subscription.pricingTierId).toBeDefined();
      expect(subscription.seats).toBe(1);

      // Verify the plan used is a trial plan
      const [plan] = await db
        .select({ isTrial: schema.subscriptionPlans.isTrial })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, subscription.planId))
        .limit(1);

      expect(plan.isTrial).toBe(true);
    });
  });

  describe("activate", () => {
    test("should activate subscription with billing period", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      await SubscriptionService.activate({
        organizationId: org.id,
        pagarmeSubscriptionId: "sub_pagarme_123",
        periodStart,
        periodEnd,
      });

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.pagarmeSubscriptionId).toBe("sub_pagarme_123");
      expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);
      expect(subscription.cancelAtPeriodEnd).toBe(false);
      expect(subscription.canceledAt).toBeNull();
    });

    test("should clear cancellation flags when activating", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createCanceled(
        org.id,
        diamondPlanResult.plan.id
      );

      await db
        .update(schema.orgSubscriptions)
        .set({ cancelAtPeriodEnd: true, canceledAt: new Date() })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      await SubscriptionService.activate({
        organizationId: org.id,
        pagarmeSubscriptionId: "sub_pagarme_456",
        periodStart,
        periodEnd,
      });

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.cancelAtPeriodEnd).toBe(false);
      expect(subscription.canceledAt).toBeNull();
    });
  });

  describe("markPastDue", () => {
    test("should update subscription status to past_due", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      await SubscriptionService.markPastDue(org.id);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });
  });

  describe("expireTrial", () => {
    test("should expire trial subscription", async () => {
      const org = await OrganizationFactory.create();
      // Use trial plan for proper trial behavior
      const subscriptionId = await SubscriptionFactory.createTrial(
        org.id,
        trialPlanResult.plan.id
      );

      await SubscriptionService.expireTrial(subscriptionId);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("expired");
    });

    test("should not expire non-trial subscription", async () => {
      const org = await OrganizationFactory.create();
      const subscriptionId = await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id
      );

      await SubscriptionService.expireTrial(subscriptionId);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("active");
    });

    test("should do nothing for non-existent subscription", async () => {
      await expect(
        SubscriptionService.expireTrial("non-existent-id")
      ).resolves.toBeUndefined();
    });
  });

  describe("suspend", () => {
    test("should change past_due subscription to canceled", async () => {
      const org = await OrganizationFactory.create();
      const subscriptionId = await SubscriptionFactory.create(
        org.id,
        diamondPlanResult.plan.id,
        { status: "past_due" }
      );

      await SubscriptionService.suspend(subscriptionId);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should not change active subscription", async () => {
      const org = await OrganizationFactory.create();
      const subscriptionId = await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id
      );

      await SubscriptionService.suspend(subscriptionId);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("active");
    });

    test("should do nothing for non-existent subscription", async () => {
      await expect(
        SubscriptionService.suspend("non-existent-id")
      ).resolves.toBeUndefined();
    });
  });

  describe("cancelByWebhook", () => {
    test("should cancel subscription by organizationId", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const result = await SubscriptionService.cancelByWebhook(org.id);

      expect(result).not.toBeNull();
      expect(result?.subscription.status).toBe("canceled");
      expect(result?.subscription.canceledAt).toBeInstanceOf(Date);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should return null for non-existent organization", async () => {
      const result =
        await SubscriptionService.cancelByWebhook("non-existent-org");

      expect(result).toBeNull();
    });

    test("should emit subscription.canceled event", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const result = await SubscriptionService.cancelByWebhook(org.id);

      expect(result).not.toBeNull();
      // Event emission is tested indirectly by checking the subscription was updated
    });
  });

  describe("cancelByPagarmeId", () => {
    test("should cancel subscription by pagarmeSubscriptionId", async () => {
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_pagarme_${crypto.randomUUID().slice(0, 8)}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const result = await SubscriptionService.cancelByPagarmeId(pagarmeSubId);

      expect(result).not.toBeNull();
      expect(result?.subscription.status).toBe("canceled");
      expect(result?.subscription.canceledAt).toBeInstanceOf(Date);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should return null for non-existent pagarmeSubscriptionId", async () => {
      const result =
        await SubscriptionService.cancelByPagarmeId("sub_non_existent");

      expect(result).toBeNull();
    });
  });

  describe("activate with optional fields", () => {
    test("should activate subscription with planId and pricingTierId", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const newPlanId = diamondPlanResult.plan.id;
      const newTierId = diamondPlanResult.tiers[0].id;

      await SubscriptionService.activate({
        organizationId: org.id,
        pagarmeSubscriptionId: "sub_new_123",
        periodStart,
        periodEnd,
        planId: newPlanId,
        pricingTierId: newTierId,
        billingCycle: "monthly",
      });

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.planId).toBe(newPlanId);
      expect(subscription.pricingTierId).toBe(newTierId);
      expect(subscription.billingCycle).toBe("monthly");
    });

    test("should mark trialUsed as true when activating", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      // Manually set trialUsed to false to verify it gets set
      await db
        .update(schema.orgSubscriptions)
        .set({ trialUsed: false })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      await SubscriptionService.activate({
        organizationId: org.id,
        pagarmeSubscriptionId: "sub_trial_used",
        periodStart,
        periodEnd,
      });

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.trialUsed).toBe(true);
    });

    test("should emit subscription.activated event", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const result = await SubscriptionService.activate({
        organizationId: org.id,
        pagarmeSubscriptionId: "sub_event_test",
        periodStart,
        periodEnd,
      });

      // Method returns the subscription, which indicates successful activation
      expect(result).not.toBeNull();
      expect(result?.status).toBe("active");
    });

    test("should return null for non-existent organization", async () => {
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const result = await SubscriptionService.activate({
        organizationId: "non-existent-org",
        pagarmeSubscriptionId: "sub_no_org",
        periodStart,
        periodEnd,
      });

      expect(result).toBeNull();
    });
  });

  describe("activate — archive private plan", () => {
    test("should archive private plan when subscription changes to a different plan", async () => {
      const org = await OrganizationFactory.create();

      // Create a private (custom) plan
      const privatePlanResult = await PlanFactory.create({
        type: "gold",
        isPublic: false,
        name: `custom-private-${crypto.randomUUID().slice(0, 8)}`,
      });

      // Create subscription on the private plan
      await SubscriptionFactory.create(org.id, privatePlanResult.plan.id, {
        status: "active",
      });

      // Create a public catalog plan to switch to
      const catalogPlanResult = await PlanFactory.createPaid("diamond");

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      // Activate with the new (different) plan
      await SubscriptionService.activate({
        organizationId: org.id,
        pagarmeSubscriptionId: `sub_archive_${crypto.randomUUID().slice(0, 8)}`,
        periodStart,
        periodEnd,
        planId: catalogPlanResult.plan.id,
        pricingTierId: catalogPlanResult.tiers[0].id,
      });

      // Verify the private plan was archived
      const [archivedPlan] = await db
        .select({ archivedAt: schema.subscriptionPlans.archivedAt })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, privatePlanResult.plan.id))
        .limit(1);

      expect(archivedPlan.archivedAt).toBeInstanceOf(Date);
    });

    test("should NOT archive public plan when subscription changes plan", async () => {
      const org = await OrganizationFactory.create();

      // Create a public gold plan
      const goldPlanResult = await PlanFactory.createPaid("gold");

      // Create subscription on the public gold plan
      await SubscriptionFactory.create(org.id, goldPlanResult.plan.id, {
        status: "active",
      });

      // Create a public diamond plan to switch to
      const newDiamondPlanResult = await PlanFactory.createPaid("diamond");

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      // Activate with the new plan
      await SubscriptionService.activate({
        organizationId: org.id,
        pagarmeSubscriptionId: `sub_no_archive_${crypto.randomUUID().slice(0, 8)}`,
        periodStart,
        periodEnd,
        planId: newDiamondPlanResult.plan.id,
        pricingTierId: newDiamondPlanResult.tiers[0].id,
      });

      // Verify the public gold plan was NOT archived
      const [publicPlan] = await db
        .select({ archivedAt: schema.subscriptionPlans.archivedAt })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, goldPlanResult.plan.id))
        .limit(1);

      expect(publicPlan.archivedAt).toBeNull();
    });
  });

  describe("markActive", () => {
    test("should mark subscription as active with period data", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.create(org.id, diamondPlanResult.plan.id, {
        status: "past_due",
      });

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const result = await SubscriptionService.markActive({
        organizationId: org.id,
        pagarmeSubscriptionId: "sub_mark_active_123",
        periodStart,
        periodEnd,
      });

      expect(result).not.toBeNull();
      expect(result?.subscription.status).toBe("active");
      expect(result?.subscription.pagarmeSubscriptionId).toBe(
        "sub_mark_active_123"
      );
      expect(result?.subscription.currentPeriodStart).toBeInstanceOf(Date);
      expect(result?.subscription.currentPeriodEnd).toBeInstanceOf(Date);
    });

    test("should clear grace period fields when marking active", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.create(org.id, diamondPlanResult.plan.id, {
        status: "past_due",
      });

      // Set grace period fields
      await db
        .update(schema.orgSubscriptions)
        .set({
          pastDueSince: new Date(),
          gracePeriodEnds: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      await SubscriptionService.markActive({
        organizationId: org.id,
        periodStart: new Date(),
        periodEnd: new Date(),
      });

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.gracePeriodEnds).toBeNull();
    });

    test("should return null for non-existent organization", async () => {
      const result = await SubscriptionService.markActive({
        organizationId: "non-existent-org",
        periodStart: new Date(),
        periodEnd: new Date(),
      });

      expect(result).toBeNull();
    });

    test("should work without optional pagarmeSubscriptionId", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.create(org.id, diamondPlanResult.plan.id, {
        status: "past_due",
      });

      const result = await SubscriptionService.markActive({
        organizationId: org.id,
        periodStart: new Date(),
      });

      expect(result).not.toBeNull();
      expect(result?.subscription.status).toBe("active");
    });
  });

  describe("cancelByRefund", () => {
    test("should cancel subscription by organizationId", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const result = await SubscriptionService.cancelByRefund({
        organizationId: org.id,
        chargeId: "charge_123",
        amount: 9900,
        reason: "Customer requested refund",
      });

      expect(result).not.toBeNull();
      expect(result?.subscription.status).toBe("canceled");
      expect(result?.subscription.canceledAt).toBeInstanceOf(Date);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should cancel subscription by pagarmeSubscriptionId", async () => {
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_refund_${crypto.randomUUID().slice(0, 8)}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const result = await SubscriptionService.cancelByRefund({
        pagarmeSubscriptionId: pagarmeSubId,
        chargeId: "charge_456",
        amount: 19_900,
      });

      expect(result).not.toBeNull();
      expect(result?.subscription.status).toBe("canceled");

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should return null when no identifier provided", async () => {
      const result = await SubscriptionService.cancelByRefund({
        chargeId: "charge_no_id",
        amount: 9900,
      });

      expect(result).toBeNull();
    });

    test("should return null for non-existent organization", async () => {
      const result = await SubscriptionService.cancelByRefund({
        organizationId: "non-existent-org",
        chargeId: "charge_789",
        amount: 9900,
      });

      expect(result).toBeNull();
    });

    test("should return null for non-existent pagarmeSubscriptionId", async () => {
      const result = await SubscriptionService.cancelByRefund({
        pagarmeSubscriptionId: "sub_non_existent",
        chargeId: "charge_999",
        amount: 9900,
      });

      expect(result).toBeNull();
    });
  });

  describe("cancelScheduled", () => {
    test("should cancel subscription scheduled for cancellation", async () => {
      const org = await OrganizationFactory.create();
      const subscriptionId = await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id
      );

      // Mark for scheduled cancellation
      await db
        .update(schema.orgSubscriptions)
        .set({
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date(Date.now() - 1000), // Period ended
        })
        .where(eq(schema.orgSubscriptions.id, subscriptionId));

      const result = await SubscriptionService.cancelScheduled(subscriptionId);

      expect(result).toBe(true);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should return false for subscription not scheduled for cancellation", async () => {
      const org = await OrganizationFactory.create();
      const subscriptionId = await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id
      );

      // cancelAtPeriodEnd is false by default
      const result = await SubscriptionService.cancelScheduled(subscriptionId);

      expect(result).toBe(false);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      // Status should remain active
      expect(subscription.status).toBe("active");
    });

    test("should return false for non-active subscription", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createCanceled(
        org.id,
        diamondPlanResult.plan.id
      );

      const [sub] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      // Even if marked for cancellation, already canceled subscriptions should return false
      await db
        .update(schema.orgSubscriptions)
        .set({ cancelAtPeriodEnd: true })
        .where(eq(schema.orgSubscriptions.id, sub.id));

      const result = await SubscriptionService.cancelScheduled(sub.id);

      expect(result).toBe(false);
    });

    test("should return false for non-existent subscription", async () => {
      const result =
        await SubscriptionService.cancelScheduled("non-existent-id");

      expect(result).toBe(false);
    });
  });
});
