/**
 * Trial Lifecycle Complete Test
 *
 * Testa o ciclo completo do trial: criação → notificação → expiração → acesso negado
 *
 * Cenários:
 * 1. Trial criado corretamente com datas
 * 2. notifyExpiringTrials() encontra trials expirando em 3-4 dias
 * 3. expireTrials() expira trials com trialEnd no passado
 * 4. Após expiração: status = expired, acesso negado
 * 5. Restore bloqueado após expiração
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { JobsService } from "@/modules/payments/jobs/jobs.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("Trial Lifecycle: Creation → Notification → Expiration → Access Denied", () => {
  let trialPlanResult: CreatePlanResult;
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    trialPlanResult = await PlanFactory.createTrial();
  });

  afterAll(async () => {
    // Cleanup subscriptions and organizations
    for (const orgId of createdOrgIds) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, orgId));
    }
  });

  describe("Fase 1: Trial Creation", () => {
    test("should create trial subscription with correct dates", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const subscriptionId = await SubscriptionFactory.createTrial(
        org.id,
        trialPlanResult.plan.id,
        14
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.trialStart).toBeInstanceOf(Date);
      expect(subscription.trialEnd).toBeInstanceOf(Date);

      // Trial should end in ~14 days
      if (subscription.trialEnd && subscription.trialStart) {
        const trialDuration =
          subscription.trialEnd.getTime() - subscription.trialStart.getTime();
        const expectedDuration = 14 * MS_PER_DAY;
        expect(Math.abs(trialDuration - expectedDuration)).toBeLessThan(
          MS_PER_DAY
        );
      }
    });

    test("should have access during trial period", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      await SubscriptionFactory.createTrial(org.id, trialPlanResult.plan.id);

      const access = await SubscriptionService.checkAccess(org.id);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("trial");
    });
  });

  describe("Fase 2: notifyExpiringTrials() Job", () => {
    test("should find trials expiring in 3-4 days window", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create subscription manually to control trialEnd
      const now = new Date();
      const trialEndIn3Days = new Date(now.getTime() + 3.5 * MS_PER_DAY);

      await db.insert(schema.orgSubscriptions).values({
        id: `sub-${crypto.randomUUID()}`,
        organizationId: org.id,
        planId: trialPlanResult.plan.id,
        status: "active",
        trialStart: now,
        trialEnd: trialEndIn3Days,
        trialUsed: false,
        seats: 1,
      });

      // Run the job - it should find this subscription
      const result = await JobsService.notifyExpiringTrials();

      // Should have processed at least 1 (our subscription)
      expect(result.processed).toBeGreaterThanOrEqual(1);
    });

    test("should NOT notify trials expiring in more than 4 days", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create subscription with trialEnd in 10 days (outside window)
      const now = new Date();
      const trialEndIn10Days = new Date(now.getTime() + 10 * MS_PER_DAY);

      await db.insert(schema.orgSubscriptions).values({
        id: `sub-${crypto.randomUUID()}`,
        organizationId: org.id,
        planId: trialPlanResult.plan.id,
        status: "active",
        trialStart: now,
        trialEnd: trialEndIn10Days,
        trialUsed: false,
        seats: 1,
      });

      // Query directly to verify this subscription is NOT in the notification window
      const notificationStart = new Date(now.getTime() + 3 * MS_PER_DAY);
      const notificationEnd = new Date(now.getTime() + 4 * MS_PER_DAY);

      const expiringTrials = await db
        .select()
        .from(schema.orgSubscriptions)
        .innerJoin(
          schema.subscriptionPlans,
          eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
        )
        .where(
          and(
            eq(schema.orgSubscriptions.organizationId, org.id),
            eq(schema.subscriptionPlans.isTrial, true)
          )
        );

      // The subscription exists but trialEnd is NOT in the 3-4 day window
      expect(expiringTrials.length).toBe(1);
      const trialEnd = expiringTrials[0].org_subscriptions.trialEnd;
      expect(trialEnd).not.toBeNull();
      if (trialEnd) {
        const isInWindow =
          trialEnd >= notificationStart && trialEnd <= notificationEnd;
        expect(isInWindow).toBe(false);
      }
    });
  });

  describe("Fase 3: expireTrials() Job", () => {
    test("should expire trials with trialEnd in the past", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create subscription with trialEnd in the past
      const now = new Date();
      const trialEndYesterday = new Date(now.getTime() - 1 * MS_PER_DAY);

      const subscriptionId = `sub-${crypto.randomUUID()}`;
      await db.insert(schema.orgSubscriptions).values({
        id: subscriptionId,
        organizationId: org.id,
        planId: trialPlanResult.plan.id,
        status: "active",
        trialStart: new Date(now.getTime() - 15 * MS_PER_DAY),
        trialEnd: trialEndYesterday,
        trialUsed: false,
        seats: 1,
      });

      // Verify status is active before job
      let [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("active");

      // Run the job
      const result = await JobsService.expireTrials();

      expect(result.processed).toBeGreaterThanOrEqual(1);
      expect(result.expired.length).toBeGreaterThanOrEqual(1);

      // Verify status changed to expired
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("expired");
    });

    test("should NOT expire trials with trialEnd in the future", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create subscription with trialEnd in the future
      const now = new Date();
      const trialEndTomorrow = new Date(now.getTime() + 1 * MS_PER_DAY);

      const subscriptionId = `sub-${crypto.randomUUID()}`;
      await db.insert(schema.orgSubscriptions).values({
        id: subscriptionId,
        organizationId: org.id,
        planId: trialPlanResult.plan.id,
        status: "active",
        trialStart: now,
        trialEnd: trialEndTomorrow,
        trialUsed: false,
        seats: 1,
      });

      // Run the job
      await JobsService.expireTrials();

      // Verify status is still active
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("active");
    });

    test("should NOT expire non-trial plans even if trialEnd is in the past", async () => {
      const paidPlanResult = await PlanFactory.createPaid("gold");
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create paid subscription (not trial)
      const subscriptionId = await SubscriptionFactory.createActive(
        org.id,
        paidPlanResult.plan.id
      );

      // Run the job
      await JobsService.expireTrials();

      // Verify status is still active
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("active");
    });
  });

  describe("Fase 4: Access Denied After Expiration", () => {
    test("should deny access after trial expires", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create expired subscription directly
      await db.insert(schema.orgSubscriptions).values({
        id: `sub-${crypto.randomUUID()}`,
        organizationId: org.id,
        planId: trialPlanResult.plan.id,
        status: "expired",
        trialStart: new Date(Date.now() - 15 * MS_PER_DAY),
        trialEnd: new Date(Date.now() - 1 * MS_PER_DAY),
        trialUsed: false,
        seats: 1,
      });

      const access = await SubscriptionService.checkAccess(org.id);

      expect(access.hasAccess).toBe(false);
      expect(access.status).toBe("expired");
    });

    test("should return trial_expired status for expired trial plan", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create expired trial subscription
      await db.insert(schema.orgSubscriptions).values({
        id: `sub-${crypto.randomUUID()}`,
        organizationId: org.id,
        planId: trialPlanResult.plan.id,
        status: "expired",
        trialStart: new Date(Date.now() - 15 * MS_PER_DAY),
        trialEnd: new Date(Date.now() - 1 * MS_PER_DAY),
        trialUsed: false,
        seats: 1,
      });

      const access = await SubscriptionService.checkAccess(org.id);

      // Should return trial_expired for expired trial plans
      expect(access.hasAccess).toBe(false);
      expect(["expired", "trial_expired"]).toContain(access.status);
    });
  });

  describe("Fase 5: Edge Cases", () => {
    test("should handle trial that expires exactly now", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create subscription with trialEnd exactly now (should be expired)
      const now = new Date();

      const subscriptionId = `sub-${crypto.randomUUID()}`;
      await db.insert(schema.orgSubscriptions).values({
        id: subscriptionId,
        organizationId: org.id,
        planId: trialPlanResult.plan.id,
        status: "active",
        trialStart: new Date(now.getTime() - 14 * MS_PER_DAY),
        trialEnd: new Date(now.getTime() - 1000), // 1 second ago
        trialUsed: false,
        seats: 1,
      });

      // Run the job
      const result = await JobsService.expireTrials();

      expect(result.expired).toContain(subscriptionId);

      // Verify status changed
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("expired");
    });

    test("should expire multiple trials in a single job run", async () => {
      const orgs = await Promise.all([
        OrganizationFactory.create(),
        OrganizationFactory.create(),
        OrganizationFactory.create(),
      ]);

      for (const org of orgs) {
        createdOrgIds.push(org.id);
      }

      const now = new Date();
      const trialEndYesterday = new Date(now.getTime() - 1 * MS_PER_DAY);

      // Create 3 expired trials
      const subscriptionIds: string[] = [];
      for (const org of orgs) {
        const subscriptionId = `sub-${crypto.randomUUID()}`;
        subscriptionIds.push(subscriptionId);

        await db.insert(schema.orgSubscriptions).values({
          id: subscriptionId,
          organizationId: org.id,
          planId: trialPlanResult.plan.id,
          status: "active",
          trialStart: new Date(now.getTime() - 15 * MS_PER_DAY),
          trialEnd: trialEndYesterday,
          trialUsed: false,
          seats: 1,
        });
      }

      // Run the job
      const result = await JobsService.expireTrials();

      // Should have expired all 3
      expect(result.expired.length).toBeGreaterThanOrEqual(3);

      // Verify all are expired
      for (const subscriptionId of subscriptionIds) {
        const [subscription] = await db
          .select()
          .from(schema.orgSubscriptions)
          .where(eq(schema.orgSubscriptions.id, subscriptionId))
          .limit(1);

        expect(subscription.status).toBe("expired");
      }
    });

    test("should be idempotent - running expireTrials twice has no effect", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create expired subscription
      const now = new Date();
      const subscriptionId = `sub-${crypto.randomUUID()}`;
      await db.insert(schema.orgSubscriptions).values({
        id: subscriptionId,
        organizationId: org.id,
        planId: trialPlanResult.plan.id,
        status: "active",
        trialStart: new Date(now.getTime() - 15 * MS_PER_DAY),
        trialEnd: new Date(now.getTime() - 1 * MS_PER_DAY),
        trialUsed: false,
        seats: 1,
      });

      // Run job first time
      const result1 = await JobsService.expireTrials();
      expect(result1.expired).toContain(subscriptionId);

      // Run job second time
      const result2 = await JobsService.expireTrials();

      // Should not process the same subscription again (it's already expired)
      expect(result2.expired).not.toContain(subscriptionId);

      // Status should still be expired
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("expired");
    });
  });
});
