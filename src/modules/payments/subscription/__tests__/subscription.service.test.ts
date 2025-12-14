import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestOrganization } from "@/test/helpers/organization";
import { seedPlans } from "@/test/helpers/seed";
import {
  createActiveSubscription,
  createCanceledSubscription,
  createExpiredSubscription,
  createTestSubscription,
} from "@/test/helpers/subscription";
import { SubscriptionAlreadyActiveError } from "../../errors";
import { SubscriptionService } from "../subscription.service";

describe("SubscriptionService", () => {
  beforeAll(async () => {
    await seedPlans();
  });

  describe("hasActiveSubscription", () => {
    test("should return true for active subscription", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.hasActiveSubscription(org.id);

      expect(result).toBe(true);
    });

    test("should return true for trial subscription", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const result = await SubscriptionService.hasActiveSubscription(org.id);

      expect(result).toBe(true);
    });

    test("should return false for canceled subscription", async () => {
      const org = await createTestOrganization();
      await createCanceledSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.hasActiveSubscription(org.id);

      expect(result).toBe(false);
    });

    test("should return false for expired subscription", async () => {
      const org = await createTestOrganization();
      await createExpiredSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.hasActiveSubscription(org.id);

      expect(result).toBe(false);
    });

    test("should return false for organization without subscription", async () => {
      const org = await createTestOrganization();

      const result = await SubscriptionService.hasActiveSubscription(org.id);

      expect(result).toBe(false);
    });
  });

  describe("hasPaidSubscription", () => {
    test("should return true for active subscription", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.hasPaidSubscription(org.id);

      expect(result).toBe(true);
    });

    test("should return false for trial subscription", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const result = await SubscriptionService.hasPaidSubscription(org.id);

      expect(result).toBe(false);
    });

    test("should return false for canceled subscription", async () => {
      const org = await createTestOrganization();
      await createCanceledSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.hasPaidSubscription(org.id);

      expect(result).toBe(false);
    });

    test("should return false for organization without subscription", async () => {
      const org = await createTestOrganization();

      const result = await SubscriptionService.hasPaidSubscription(org.id);

      expect(result).toBe(false);
    });
  });

  describe("ensureNoPaidSubscription", () => {
    test("should not throw for trial subscription", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      await expect(
        SubscriptionService.ensureNoPaidSubscription(org.id)
      ).resolves.toBeUndefined();
    });

    test("should not throw for canceled subscription", async () => {
      const org = await createTestOrganization();
      await createCanceledSubscription(org.id, "test-plan-pro");

      await expect(
        SubscriptionService.ensureNoPaidSubscription(org.id)
      ).resolves.toBeUndefined();
    });

    test("should not throw for organization without subscription", async () => {
      const org = await createTestOrganization();

      await expect(
        SubscriptionService.ensureNoPaidSubscription(org.id)
      ).resolves.toBeUndefined();
    });

    test("should throw SubscriptionAlreadyActiveError for active subscription", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      await expect(
        SubscriptionService.ensureNoPaidSubscription(org.id)
      ).rejects.toBeInstanceOf(SubscriptionAlreadyActiveError);
    });
  });

  describe("checkAccess", () => {
    test("should return no_subscription for organization without subscription", async () => {
      const org = await createTestOrganization();

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(false);
      expect(result.status).toBe("no_subscription");
      expect(result.daysRemaining).toBeNull();
      expect(result.trialEnd).toBeNull();
      expect(result.requiresPayment).toBe(true);
    });

    test("should return active status with full access", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(true);
      expect(result.status).toBe("active");
      expect(result.daysRemaining).toBeNull();
      expect(result.trialEnd).toBeNull();
      expect(result.requiresPayment).toBe(false);
    });

    test("should return trial status with days remaining", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", {
        status: "trial",
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
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", {
        status: "trial",
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
      const org = await createTestOrganization();
      await createCanceledSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(false);
      expect(result.status).toBe("canceled");
      expect(result.requiresPayment).toBe(true);
    });

    test("should return expired status without access", async () => {
      const org = await createTestOrganization();
      await createExpiredSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(false);
      expect(result.status).toBe("expired");
      expect(result.requiresPayment).toBe(true);
    });

    test("should return past_due status with access", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", {
        status: "past_due",
      });

      const result = await SubscriptionService.checkAccess(org.id);

      expect(result.hasAccess).toBe(true);
      expect(result.status).toBe("past_due");
      expect(result.requiresPayment).toBe(true);
    });
  });

  describe("canUseTrial", () => {
    test("should return true for organization without subscription", async () => {
      const org = await createTestOrganization();

      const result = await SubscriptionService.canUseTrial(org.id);

      expect(result).toBe(true);
    });

    test("should return false when trial was already used", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.canUseTrial(org.id);

      expect(result).toBe(false);
    });

    test("should return false for current trial subscription", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const result = await SubscriptionService.canUseTrial(org.id);

      expect(result).toBe(true);
    });
  });

  describe("createTrial", () => {
    test("should create trial subscription with correct dates", async () => {
      const org = await createTestOrganization();

      await SubscriptionService.createTrial(org.id, "test-plan-pro");

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription).toBeDefined();
      expect(subscription.status).toBe("trial");
      expect(subscription.planId).toBe("test-plan-pro");
      expect(subscription.trialStart).toBeInstanceOf(Date);
      expect(subscription.trialEnd).toBeInstanceOf(Date);
      expect(subscription.trialUsed).toBe(true);
      expect(subscription.seats).toBe(1);
    });

    test("should throw PlanNotFoundError for non-existent plan", async () => {
      const { PlanNotFoundError } = await import("../../errors");
      const org = await createTestOrganization();

      await expect(
        SubscriptionService.createTrial(org.id, "non-existent-plan")
      ).rejects.toBeInstanceOf(PlanNotFoundError);
    });
  });

  describe("activate", () => {
    test("should activate subscription with billing period", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      await SubscriptionService.activate(
        org.id,
        "sub_pagarme_123",
        periodStart,
        periodEnd
      );

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
      const org = await createTestOrganization();
      await createCanceledSubscription(org.id, "test-plan-pro");

      await db
        .update(schema.orgSubscriptions)
        .set({ cancelAtPeriodEnd: true, canceledAt: new Date() })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      await SubscriptionService.activate(
        org.id,
        "sub_pagarme_456",
        periodStart,
        periodEnd
      );

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
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

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
      const org = await createTestOrganization();
      const subscriptionId = await createTestSubscription(
        org.id,
        "test-plan-pro",
        "trial"
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
      const org = await createTestOrganization();
      const subscriptionId = await createActiveSubscription(
        org.id,
        "test-plan-pro"
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

  describe("cancel", () => {
    test("should set cancelAtPeriodEnd without changing status (soft cancel)", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      await SubscriptionService.cancel({
        organizationId: org.id,
        userId: "test-user",
      });

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.cancelAtPeriodEnd).toBe(true);
      expect(subscription.canceledAt).toBeInstanceOf(Date);
      expect(subscription.status).toBe("active");
    });

    test("should cancel trial subscription without changing status", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      await SubscriptionService.cancel({
        organizationId: org.id,
        userId: "test-user",
      });

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.cancelAtPeriodEnd).toBe(true);
      expect(subscription.canceledAt).toBeInstanceOf(Date);
      expect(subscription.status).toBe("trial");
    });

    test("should return cancelAtPeriodEnd true and currentPeriodEnd", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const result = await SubscriptionService.cancel({
        organizationId: org.id,
        userId: "test-user",
      });

      expect(result.success).toBe(true);
      expect(result.data.cancelAtPeriodEnd).toBe(true);
      expect(result.data.currentPeriodEnd).toBeDefined();
    });
  });

  describe("restore", () => {
    test("should clear cancellation flags", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      await db
        .update(schema.orgSubscriptions)
        .set({ cancelAtPeriodEnd: true, canceledAt: new Date() })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      await SubscriptionService.restore({
        organizationId: org.id,
        userId: "test-user",
      });

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.cancelAtPeriodEnd).toBe(false);
      expect(subscription.canceledAt).toBeNull();
      expect(subscription.status).toBe("active");
    });

    test("should return restored true", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      await db
        .update(schema.orgSubscriptions)
        .set({ cancelAtPeriodEnd: true, canceledAt: new Date() })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await SubscriptionService.restore({
        organizationId: org.id,
        userId: "test-user",
      });

      expect(result.success).toBe(true);
      expect(result.data.restored).toBe(true);
    });

    test("should throw error when not scheduled for cancellation", async () => {
      const { SubscriptionNotRestorableError } = await import("../../errors");
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      await expect(
        SubscriptionService.restore({
          organizationId: org.id,
          userId: "test-user",
        })
      ).rejects.toBeInstanceOf(SubscriptionNotRestorableError);
    });

    test("should throw error for canceled subscription", async () => {
      const { SubscriptionNotRestorableError } = await import("../../errors");
      const org = await createTestOrganization();
      await createCanceledSubscription(org.id, "test-plan-pro");

      await expect(
        SubscriptionService.restore({
          organizationId: org.id,
          userId: "test-user",
        })
      ).rejects.toBeInstanceOf(SubscriptionNotRestorableError);
    });
  });
});
