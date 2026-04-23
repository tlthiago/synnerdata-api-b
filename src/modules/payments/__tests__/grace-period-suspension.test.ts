/**
 * Grace Period Suspension Test
 *
 * Testa o job suspendExpiredGracePeriods() que suspende assinaturas
 * após 15 dias de grace period expirado.
 *
 * Cenários:
 * 1. Falha de pagamento marca como past_due com grace period
 * 2. Job suspendExpiredGracePeriods() suspende após gracePeriodEnds
 * 3. Acesso negado após suspensão
 * 4. Assinaturas dentro do grace period NÃO são suspensas
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { JobsService } from "@/modules/payments/jobs/jobs.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type { ProcessWebhook } from "@/modules/payments/webhook/webhook.model";
import { WebhookService } from "@/modules/payments/webhook/webhook.service";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_DAYS = 15;

function createValidAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function createPaymentFailedPayload(organizationId: string): ProcessWebhook {
  return {
    id: `evt_${crypto.randomUUID()}`,
    type: "charge.payment_failed",
    created_at: new Date().toISOString(),
    data: {
      metadata: { organization_id: organizationId },
      invoice: { id: `inv_${crypto.randomUUID()}` },
      last_transaction: {
        gateway_response: { message: "Insufficient funds" },
      },
    },
  };
}

describe("Grace Period Suspension: past_due → Job → canceled", () => {
  let diamondPlanResult: CreatePlanResult;
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    diamondPlanResult = await PlanFactory.createPaid("diamond");
  });

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, orgId));
    }
  });

  describe("Fase 1: Payment Failure Sets Grace Period", () => {
    test("should set pastDueSince and gracePeriodEnds on payment failure", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = createPaymentFailedPayload(org.id);
      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
      expect(subscription.pastDueSince).toBeInstanceOf(Date);
      expect(subscription.gracePeriodEnds).toBeInstanceOf(Date);

      // Grace period should be 15 days
      if (subscription.pastDueSince && subscription.gracePeriodEnds) {
        const graceDays = Math.round(
          (subscription.gracePeriodEnds.getTime() -
            subscription.pastDueSince.getTime()) /
            MS_PER_DAY
        );
        expect(graceDays).toBe(GRACE_PERIOD_DAYS);
      }
    });

    test("should still have access during grace period", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = createPaymentFailedPayload(org.id);
      await WebhookService.process(payload, createValidAuthHeader());

      const access = await SubscriptionService.checkAccess(org.id);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("past_due");
    });
  });

  describe("Fase 2: suspendExpiredGracePeriods() Job", () => {
    test("should suspend subscriptions with expired grace period", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create past_due subscription with expired grace period
      const now = new Date();
      const pastDueSince = new Date(now.getTime() - 20 * MS_PER_DAY); // 20 days ago
      const gracePeriodEnds = new Date(now.getTime() - 5 * MS_PER_DAY); // Expired 5 days ago

      const subscriptionId = `sub-${crypto.randomUUID()}`;
      await db.insert(schema.orgSubscriptions).values({
        id: subscriptionId,
        organizationId: org.id,
        planId: diamondPlanResult.plan.id,
        status: "past_due",
        pastDueSince,
        gracePeriodEnds,
        currentPeriodStart: new Date(now.getTime() - 30 * MS_PER_DAY),
        currentPeriodEnd: new Date(now.getTime() - 20 * MS_PER_DAY),
        trialUsed: true,
        seats: 1,
      });

      // Verify status is past_due before job
      let [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("past_due");

      // Run the job
      const result = await JobsService.suspendExpiredGracePeriods();

      expect(result.processed).toBeGreaterThanOrEqual(1);
      expect(result.suspended).toContain(subscriptionId);

      // Verify status changed to canceled
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should NOT suspend subscriptions within grace period", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create past_due subscription with grace period still valid
      const now = new Date();
      const pastDueSince = new Date(now.getTime() - 5 * MS_PER_DAY); // 5 days ago
      const gracePeriodEnds = new Date(now.getTime() + 10 * MS_PER_DAY); // 10 days from now

      const subscriptionId = `sub-${crypto.randomUUID()}`;
      await db.insert(schema.orgSubscriptions).values({
        id: subscriptionId,
        organizationId: org.id,
        planId: diamondPlanResult.plan.id,
        status: "past_due",
        pastDueSince,
        gracePeriodEnds,
        currentPeriodStart: new Date(now.getTime() - 15 * MS_PER_DAY),
        currentPeriodEnd: new Date(now.getTime() - 5 * MS_PER_DAY),
        trialUsed: true,
        seats: 1,
      });

      // Run the job
      const result = await JobsService.suspendExpiredGracePeriods();

      // Should NOT have suspended this subscription
      expect(result.suspended).not.toContain(subscriptionId);

      // Verify status is still past_due
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("should NOT suspend active subscriptions", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create active subscription
      const subscriptionId = await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id
      );

      // Run the job
      const result = await JobsService.suspendExpiredGracePeriods();

      // Should NOT have suspended this subscription
      expect(result.suspended).not.toContain(subscriptionId);

      // Verify status is still active
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("active");
    });
  });

  describe("Fase 3: Access Denied After Suspension", () => {
    test("should deny access after grace period suspension", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create canceled subscription (simulating post-suspension state)
      const now = new Date();
      await db.insert(schema.orgSubscriptions).values({
        id: `sub-${crypto.randomUUID()}`,
        organizationId: org.id,
        planId: diamondPlanResult.plan.id,
        status: "canceled",
        pastDueSince: new Date(now.getTime() - 20 * MS_PER_DAY),
        gracePeriodEnds: new Date(now.getTime() - 5 * MS_PER_DAY),
        trialUsed: true,
        seats: 1,
      });

      const access = await SubscriptionService.checkAccess(org.id);

      expect(access.hasAccess).toBe(false);
      expect(access.status).toBe("canceled");
    });
  });

  describe("Fase 4: Recovery Before Suspension", () => {
    test("should clear grace period fields when payment succeeds", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);
      const authHeader = createValidAuthHeader();

      // Step 1: Payment fails
      const failPayload = createPaymentFailedPayload(org.id);
      await WebhookService.process(failPayload, authHeader);

      // Verify past_due with grace period fields
      let [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
      expect(subscription.pastDueSince).not.toBeNull();
      expect(subscription.gracePeriodEnds).not.toBeNull();

      // Step 2: Payment succeeds
      const successPayload: ProcessWebhook = {
        id: `evt_${crypto.randomUUID()}`,
        type: "charge.paid",
        created_at: new Date().toISOString(),
        data: {
          metadata: { organization_id: org.id },
          subscription: { id: `sub_${crypto.randomUUID()}` },
          current_period: {
            start_at: new Date().toISOString(),
            end_at: new Date(Date.now() + 30 * MS_PER_DAY).toISOString(),
          },
        },
      };

      await WebhookService.process(successPayload, authHeader);

      // Verify recovery: status active, grace period fields cleared
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.gracePeriodEnds).toBeNull();
    });
  });

  describe("Fase 5: Edge Cases", () => {
    test("should handle grace period ending exactly now", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const now = new Date();
      const pastDueSince = new Date(
        now.getTime() - GRACE_PERIOD_DAYS * MS_PER_DAY
      );
      const gracePeriodEnds = new Date(now.getTime() - 1000); // 1 second ago

      const subscriptionId = `sub-${crypto.randomUUID()}`;
      await db.insert(schema.orgSubscriptions).values({
        id: subscriptionId,
        organizationId: org.id,
        planId: diamondPlanResult.plan.id,
        status: "past_due",
        pastDueSince,
        gracePeriodEnds,
        trialUsed: true,
        seats: 1,
      });

      // Run the job
      const result = await JobsService.suspendExpiredGracePeriods();

      expect(result.suspended).toContain(subscriptionId);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should suspend multiple subscriptions in a single job run", async () => {
      const orgs = await Promise.all([
        OrganizationFactory.create(),
        OrganizationFactory.create(),
        OrganizationFactory.create(),
      ]);

      for (const org of orgs) {
        createdOrgIds.push(org.id);
      }

      const now = new Date();
      const pastDueSince = new Date(now.getTime() - 20 * MS_PER_DAY);
      const gracePeriodEnds = new Date(now.getTime() - 5 * MS_PER_DAY);

      const subscriptionIds: string[] = [];
      for (const org of orgs) {
        const subscriptionId = `sub-${crypto.randomUUID()}`;
        subscriptionIds.push(subscriptionId);

        await db.insert(schema.orgSubscriptions).values({
          id: subscriptionId,
          organizationId: org.id,
          planId: diamondPlanResult.plan.id,
          status: "past_due",
          pastDueSince,
          gracePeriodEnds,
          trialUsed: true,
          seats: 1,
        });
      }

      // Run the job
      const result = await JobsService.suspendExpiredGracePeriods();

      // Should have suspended all 3
      expect(result.suspended.length).toBeGreaterThanOrEqual(3);

      // Verify all are canceled
      for (const subscriptionId of subscriptionIds) {
        const [subscription] = await db
          .select()
          .from(schema.orgSubscriptions)
          .where(eq(schema.orgSubscriptions.id, subscriptionId))
          .limit(1);

        expect(subscription.status).toBe("canceled");
      }
    });

    test("should be idempotent - running job twice has no effect", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const now = new Date();
      const subscriptionId = `sub-${crypto.randomUUID()}`;
      await db.insert(schema.orgSubscriptions).values({
        id: subscriptionId,
        organizationId: org.id,
        planId: diamondPlanResult.plan.id,
        status: "past_due",
        pastDueSince: new Date(now.getTime() - 20 * MS_PER_DAY),
        gracePeriodEnds: new Date(now.getTime() - 5 * MS_PER_DAY),
        trialUsed: true,
        seats: 1,
      });

      // Run job first time
      const result1 = await JobsService.suspendExpiredGracePeriods();
      expect(result1.suspended).toContain(subscriptionId);

      // Run job second time
      const result2 = await JobsService.suspendExpiredGracePeriods();

      // Should not process the same subscription again (it's already canceled)
      expect(result2.suspended).not.toContain(subscriptionId);

      // Status should still be canceled
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });
  });
});
