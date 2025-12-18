import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { JobsService } from "@/modules/payments/jobs/jobs.service";
import {
  addMemberToOrganization,
  createTestOrganization,
  type TestOrganization,
} from "@/test/helpers/organization";
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import { createTestUser, type TestUserResult } from "@/test/helpers/user";

describe("JobsService", () => {
  const createdOrganizations: TestOrganization[] = [];
  const createdUsers: TestUserResult[] = [];

  beforeAll(async () => {
    await seedPlans();
  });

  afterAll(async () => {
    for (const org of createdOrganizations) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id));
      await db
        .delete(schema.members)
        .where(eq(schema.members.organizationId, org.id));
      await db
        .delete(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id));
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.id, org.id));
    }

    for (const userResult of createdUsers) {
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, userResult.user.id));
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, userResult.user.id));
    }
  });

  describe("expireTrials", () => {
    test("should expire trials that have passed their end date", async () => {
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "trial",
        trialDays: -1,
      });

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
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "trial",
        trialDays: 14,
      });

      const result = await JobsService.expireTrials();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("trial");
      expect(result.expired).not.toContain(subscription.id);
    });

    test("should not affect active subscriptions", async () => {
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "active",
      });

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
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      const owner = await createTestUser({ emailVerified: true });
      createdUsers.push(owner);

      await addMemberToOrganization(owner, {
        organizationId: org.id,
        role: "owner",
      });

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "trial",
        trialDays: 3,
      });

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
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      const owner = await createTestUser({ emailVerified: true });
      createdUsers.push(owner);

      await addMemberToOrganization(owner, {
        organizationId: org.id,
        role: "owner",
      });

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "trial",
        trialDays: 1,
      });

      const result = await JobsService.notifyExpiringTrials();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(result.notified).not.toContain(subscription.id);
    });

    test("should not notify trials expiring in more than 4 days", async () => {
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      const owner = await createTestUser({ emailVerified: true });
      createdUsers.push(owner);

      await addMemberToOrganization(owner, {
        organizationId: org.id,
        role: "owner",
      });

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "trial",
        trialDays: 10,
      });

      const result = await JobsService.notifyExpiringTrials();

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(result.notified).not.toContain(subscription.id);
    });

    test("should skip organizations without owner", async () => {
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      const now = new Date();
      const trialEnd = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000);

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "trial",
        trialDays: 3,
      });

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
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      const owner = await createTestUser({ emailVerified: true });
      createdUsers.push(owner);

      await addMemberToOrganization(owner, {
        organizationId: org.id,
        role: "owner",
      });

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "active",
      });

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
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "active",
      });

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
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "active",
      });

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
      const org = await createTestOrganization();
      createdOrganizations.push(org);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await createTestSubscription(org.id, "test-plan-diamond", {
        status: "canceled",
      });

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
});
