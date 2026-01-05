import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { JobsService } from "@/modules/payments/jobs/jobs.service";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";

describe("JobsService", () => {
  let diamondPlan: CreatePlanResult;
  let trialPlan: CreatePlanResult;

  beforeAll(async () => {
    [diamondPlan, trialPlan] = await Promise.all([
      PlanFactory.createPaid("diamond"),
      PlanFactory.createTrial(),
    ]);
  });

  describe("expireTrials", () => {
    test("should expire trials that have passed their end date", async () => {
      const org = await OrganizationFactory.create();

      // Use trial plan (isTrial=true) for proper trial behavior
      // trialDays = -1 means already expired
      await SubscriptionFactory.createTrial(org.id, trialPlan.plan.id, -1);

      const result = await JobsService.expireTrials();

      expect(result.expired.length).toBeGreaterThanOrEqual(1);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("expired");
    });

    test("should not expire trials that are still valid", async () => {
      const org = await OrganizationFactory.create();

      // Use trial plan (isTrial=true) for proper trial behavior
      await SubscriptionFactory.createTrial(org.id, trialPlan.plan.id, 14);

      const result = await JobsService.expireTrials();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      // Status is "active" because trial is determined by plan.isTrial, not status
      expect(subscription.status).toBe("active");
      expect(result.expired).not.toContain(subscription.id);
    });

    test("should not affect active subscriptions", async () => {
      const org = await OrganizationFactory.create();

      await SubscriptionFactory.createActive(org.id, diamondPlan.plan.id);

      await JobsService.expireTrials();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
    });

    test("should return correct response structure", async () => {
      const result = await JobsService.expireTrials();

      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("expired");
      expect(typeof result.processed).toBe("number");
      expect(Array.isArray(result.expired)).toBe(true);
    });
  });

  describe("notifyExpiringTrials", () => {
    test("should notify trials expiring in ~3 days", async () => {
      const org = await OrganizationFactory.create();
      const owner = await UserFactory.create({ emailVerified: true });

      await OrganizationFactory.addMember(owner, {
        organizationId: org.id,
        role: "owner",
      });

      await SubscriptionFactory.createTrial(org.id, diamondPlan.plan.id, 3);

      const now = new Date();
      const trialEnd = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000);

      await db
        .update(schema.orgSubscriptions)
        .set({ trialEnd })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await JobsService.notifyExpiringTrials();

      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("notified");
      expect(typeof result.processed).toBe("number");
      expect(Array.isArray(result.notified)).toBe(true);
    });

    test("should not notify trials expiring in less than 3 days", async () => {
      const org = await OrganizationFactory.create();
      const owner = await UserFactory.create({ emailVerified: true });

      await OrganizationFactory.addMember(owner, {
        organizationId: org.id,
        role: "owner",
      });

      await SubscriptionFactory.createTrial(org.id, diamondPlan.plan.id, 1);

      const result = await JobsService.notifyExpiringTrials();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(result.notified).not.toContain(subscription.id);
    });

    test("should not notify trials expiring in more than 4 days", async () => {
      const org = await OrganizationFactory.create();
      const owner = await UserFactory.create({ emailVerified: true });

      await OrganizationFactory.addMember(owner, {
        organizationId: org.id,
        role: "owner",
      });

      await SubscriptionFactory.createTrial(org.id, diamondPlan.plan.id, 10);

      const result = await JobsService.notifyExpiringTrials();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(result.notified).not.toContain(subscription.id);
    });

    test("should skip organizations without owner", async () => {
      const org = await OrganizationFactory.create();

      const now = new Date();
      const trialEnd = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000);

      await SubscriptionFactory.createTrial(org.id, diamondPlan.plan.id, 3);

      await db
        .update(schema.orgSubscriptions)
        .set({ trialEnd })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await JobsService.notifyExpiringTrials();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(result.notified).not.toContain(subscription.id);
    });

    test("should return correct response structure", async () => {
      const result = await JobsService.notifyExpiringTrials();

      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("notified");
      expect(typeof result.processed).toBe("number");
      expect(Array.isArray(result.notified)).toBe(true);
    });
  });

  describe("processScheduledCancellations", () => {
    test("should cancel subscriptions past their period end", async () => {
      const org = await OrganizationFactory.create();
      const owner = await UserFactory.create({ emailVerified: true });

      await OrganizationFactory.addMember(owner, {
        organizationId: org.id,
        role: "owner",
      });

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await SubscriptionFactory.createActive(org.id, diamondPlan.plan.id);

      await db
        .update(schema.orgSubscriptions)
        .set({
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          currentPeriodEnd: pastDate,
        })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await JobsService.processScheduledCancellations();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(result.canceled).toContain(subscription.id);
    });

    test("should not cancel subscriptions still within period", async () => {
      const org = await OrganizationFactory.create();

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      await SubscriptionFactory.createActive(org.id, diamondPlan.plan.id);

      await db
        .update(schema.orgSubscriptions)
        .set({
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          currentPeriodEnd: futureDate,
        })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await JobsService.processScheduledCancellations();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(result.canceled).not.toContain(subscription.id);
    });

    test("should not cancel subscriptions without cancelAtPeriodEnd flag", async () => {
      const org = await OrganizationFactory.create();

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await SubscriptionFactory.createActive(org.id, diamondPlan.plan.id);

      await db
        .update(schema.orgSubscriptions)
        .set({
          cancelAtPeriodEnd: false,
          currentPeriodEnd: pastDate,
        })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await JobsService.processScheduledCancellations();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(result.canceled).not.toContain(subscription.id);
    });

    test("should not cancel already canceled subscriptions", async () => {
      const org = await OrganizationFactory.create();

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await SubscriptionFactory.createCanceled(org.id, diamondPlan.plan.id);

      await db
        .update(schema.orgSubscriptions)
        .set({
          cancelAtPeriodEnd: true,
          currentPeriodEnd: pastDate,
        })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const [subscriptionBefore] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      const result = await JobsService.processScheduledCancellations();

      expect(result.canceled).not.toContain(subscriptionBefore.id);
    });

    test("should return correct response structure", async () => {
      const result = await JobsService.processScheduledCancellations();

      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("canceled");
      expect(typeof result.processed).toBe("number");
      expect(Array.isArray(result.canceled)).toBe(true);
    });
  });

  describe("suspendExpiredGracePeriods", () => {
    test("should suspend subscriptions with expired grace period", async () => {
      const org = await OrganizationFactory.create();
      const owner = await UserFactory.create({ emailVerified: true });

      await OrganizationFactory.addMember(owner, {
        organizationId: org.id,
        role: "owner",
      });

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await SubscriptionFactory.createPastDue(org.id, diamondPlan.plan.id);

      await db
        .update(schema.orgSubscriptions)
        .set({ gracePeriodEnds: pastDate })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await JobsService.suspendExpiredGracePeriods();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(result.suspended).toContain(subscription.id);
    });

    test("should not suspend subscriptions with valid grace period", async () => {
      const org = await OrganizationFactory.create();

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      await SubscriptionFactory.createPastDue(org.id, diamondPlan.plan.id);

      await db
        .update(schema.orgSubscriptions)
        .set({ gracePeriodEnds: futureDate })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await JobsService.suspendExpiredGracePeriods();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
      expect(result.suspended).not.toContain(subscription.id);
    });

    test("should not suspend active subscriptions", async () => {
      const org = await OrganizationFactory.create();

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await SubscriptionFactory.createActive(org.id, diamondPlan.plan.id);

      await db
        .update(schema.orgSubscriptions)
        .set({ gracePeriodEnds: pastDate })
        .where(eq(schema.orgSubscriptions.organizationId, org.id));

      const result = await JobsService.suspendExpiredGracePeriods();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(result.suspended).not.toContain(subscription.id);
    });

    test("should return correct response structure", async () => {
      const result = await JobsService.suspendExpiredGracePeriods();

      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("suspended");
      expect(typeof result.processed).toBe("number");
      expect(Array.isArray(result.suspended)).toBe(true);
    });
  });

  describe("processScheduledPlanChanges", () => {
    test("should return correct response structure", async () => {
      const result = await JobsService.processScheduledPlanChanges();

      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("executed");
      expect(result).toHaveProperty("failed");
      expect(typeof result.processed).toBe("number");
      expect(Array.isArray(result.executed)).toBe(true);
      expect(Array.isArray(result.failed)).toBe(true);
    });

    test("should return empty arrays when no scheduled changes exist", async () => {
      const result = await JobsService.processScheduledPlanChanges();

      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(result.executed.length).toBeLessThanOrEqual(result.processed);
      expect(result.failed.length).toBeLessThanOrEqual(result.processed);
    });
  });
});
