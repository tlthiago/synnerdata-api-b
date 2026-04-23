/**
 * Subscription Renewal Test
 *
 * Testa o fluxo de renovação de assinatura via webhook charge.paid
 * quando a assinatura já está ativa.
 *
 * Cenários:
 * 1. charge.paid atualiza currentPeriodStart e currentPeriodEnd
 * 2. Status permanece active após renovação
 * 3. Renovação de assinatura em past_due restaura para active
 * 4. Múltiplas renovações consecutivas funcionam corretamente
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type { ProcessWebhook } from "@/modules/payments/webhook/webhook.model";
import { WebhookService } from "@/modules/payments/webhook/webhook.service";
import { WebhookPayloadBuilder } from "@/test/builders/webhook-payload.builder";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function createValidAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

describe("Subscription Renewal: charge.paid Updates Period", () => {
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

  describe("Fase 1: Basic Renewal", () => {
    test("should update period dates on charge.paid during active subscription", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const pagarmeSubId = `sub_${crypto.randomUUID()}`;

      // Create active subscription with period ending soon
      const now = new Date();
      const currentPeriodStart = new Date(now.getTime() - 25 * MS_PER_DAY);
      const currentPeriodEnd = new Date(now.getTime() + 5 * MS_PER_DAY);

      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
          currentPeriodStart,
          currentPeriodEnd,
        }
      );

      // Verify initial period
      let [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      const initialPeriodEnd = subscription.currentPeriodEnd;

      // Simulate renewal payment - new period starts now, ends in 30 days
      const newPeriodStart = new Date();
      const newPeriodEnd = new Date(now.getTime() + 30 * MS_PER_DAY);

      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(newPeriodStart, newPeriodEnd)
        .build();

      await WebhookService.process(
        payload as ProcessWebhook,
        createValidAuthHeader()
      );

      // Verify period was updated
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.currentPeriodEnd).not.toEqual(initialPeriodEnd);
      expect(subscription.currentPeriodEnd?.getTime()).toBeGreaterThan(
        initialPeriodEnd?.getTime() ?? 0
      );
    });

    test("should maintain active status after renewal", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const pagarmeSubId = `sub_${crypto.randomUUID()}`;

      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const now = new Date();
      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      await WebhookService.process(
        payload as ProcessWebhook,
        createValidAuthHeader()
      );

      const access = await SubscriptionService.checkAccess(org.id);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("active");
    });
  });

  describe("Fase 2: Renewal from past_due", () => {
    test("should restore subscription from past_due to active on renewal", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      const now = new Date();

      // Create past_due subscription
      const subscriptionId = `sub-${crypto.randomUUID()}`;
      await db.insert(schema.orgSubscriptions).values({
        id: subscriptionId,
        organizationId: org.id,
        planId: diamondPlanResult.plan.id,
        status: "past_due",
        pagarmeSubscriptionId: pagarmeSubId,
        pastDueSince: new Date(now.getTime() - 5 * MS_PER_DAY),
        gracePeriodEnds: new Date(now.getTime() + 10 * MS_PER_DAY),
        currentPeriodStart: new Date(now.getTime() - 35 * MS_PER_DAY),
        currentPeriodEnd: new Date(now.getTime() - 5 * MS_PER_DAY),
        trialUsed: true,
        seats: 1,
      });

      // Verify past_due
      let [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("past_due");

      // Simulate successful payment
      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      await WebhookService.process(
        payload as ProcessWebhook,
        createValidAuthHeader()
      );

      // Verify restoration
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.gracePeriodEnds).toBeNull();
    });

    test("should clear grace period fields on successful renewal", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      const now = new Date();

      // Create past_due subscription with grace period
      await db.insert(schema.orgSubscriptions).values({
        id: `sub-${crypto.randomUUID()}`,
        organizationId: org.id,
        planId: diamondPlanResult.plan.id,
        status: "past_due",
        pagarmeSubscriptionId: pagarmeSubId,
        pastDueSince: new Date(now.getTime() - 5 * MS_PER_DAY),
        gracePeriodEnds: new Date(now.getTime() + 10 * MS_PER_DAY),
        trialUsed: true,
        seats: 1,
      });

      // Verify grace period fields are set
      let [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.pastDueSince).not.toBeNull();
      expect(subscription.gracePeriodEnds).not.toBeNull();

      // Simulate successful payment
      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      await WebhookService.process(
        payload as ProcessWebhook,
        createValidAuthHeader()
      );

      // Verify grace period fields are cleared
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.gracePeriodEnds).toBeNull();
    });
  });

  describe("Fase 3: Multiple Renewals", () => {
    test("should handle multiple consecutive renewals", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const pagarmeSubId = `sub_${crypto.randomUUID()}`;

      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const authHeader = createValidAuthHeader();
      const periods: Array<{ start: Date; end: Date }> = [];

      // Simulate 3 monthly renewals
      for (let month = 0; month < 3; month++) {
        const start = new Date(Date.now() + month * 30 * MS_PER_DAY);
        const end = new Date(start.getTime() + 30 * MS_PER_DAY);
        periods.push({ start, end });

        const payload = new WebhookPayloadBuilder()
          .chargePaid()
          .withSubscriptionId(pagarmeSubId)
          .withOrganizationId(org.id)
          .withPeriod(start, end)
          .build();

        await WebhookService.process(payload as ProcessWebhook, authHeader);

        // Verify subscription is active after each renewal
        const access = await SubscriptionService.checkAccess(org.id);
        expect(access.hasAccess).toBe(true);
        expect(access.status).toBe("active");
      }

      // Verify final period matches last renewal
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      const [lastPeriod] = periods.slice(-1);
      expect(subscription.currentPeriodEnd?.getTime()).toBeCloseTo(
        lastPeriod?.end.getTime() ?? 0,
        -3 // Allow 1 second difference due to timing
      );
    });
  });

  describe("Fase 4: Period Validation", () => {
    test("should update pagarmeSubscriptionId if different", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create subscription without pagarmeSubscriptionId
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const newPagarmeSubId = `sub_new_${crypto.randomUUID()}`;
      const now = new Date();

      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withSubscriptionId(newPagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      await WebhookService.process(
        payload as ProcessWebhook,
        createValidAuthHeader()
      );

      // Verify pagarmeSubscriptionId was set
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.pagarmeSubscriptionId).toBe(newPagarmeSubId);
    });

    test("should record renewal event", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      const eventId = `evt_renewal_${crypto.randomUUID()}`;

      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const now = new Date();
      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withEventId(eventId)
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      await WebhookService.process(
        payload as ProcessWebhook,
        createValidAuthHeader()
      );

      // Verify event was recorded
      const [event] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId))
        .limit(1);

      expect(event).toBeDefined();
      expect(event.eventType).toBe("charge.paid");
      expect(event.processedAt).toBeInstanceOf(Date);
    });
  });

  describe("Fase 5: Edge Cases", () => {
    test("should handle renewal with same period (idempotent)", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      const eventId = `evt_same_${crypto.randomUUID()}`;

      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const now = new Date();
      const periodStart = now;
      const periodEnd = new Date(now.getTime() + 30 * MS_PER_DAY);

      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withEventId(eventId)
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(periodStart, periodEnd)
        .build();

      const authHeader = createValidAuthHeader();

      // Process same webhook twice
      await WebhookService.process(payload as ProcessWebhook, authHeader);

      await WebhookService.process(payload as ProcessWebhook, authHeader);

      // Should only have one event recorded
      const events = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId));

      expect(events.length).toBe(1);

      // Subscription should still be active
      const access = await SubscriptionService.checkAccess(org.id);
      expect(access.hasAccess).toBe(true);
    });

    test("should handle renewal for subscription found by organization_id", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create subscription WITHOUT pagarmeSubscriptionId
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const now = new Date();
      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withOrganizationId(org.id) // Only organization_id, no matching pagarmeSubscriptionId
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      await WebhookService.process(
        payload as ProcessWebhook,
        createValidAuthHeader()
      );

      // Verify subscription is still active
      const access = await SubscriptionService.checkAccess(org.id);
      expect(access.hasAccess).toBe(true);
    });
  });
});
