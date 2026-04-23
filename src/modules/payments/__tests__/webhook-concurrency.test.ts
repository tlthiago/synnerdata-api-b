/**
 * Webhook Concurrency Test
 *
 * Testa idempotência de webhooks quando o mesmo evento é recebido
 * múltiplas vezes simultaneamente.
 *
 * Cenários:
 * 1. Dois webhooks idênticos simultâneos: apenas um é processado
 * 2. Constraint de unique no pagarmeEventId previne duplicatas
 * 3. Estado da assinatura permanece consistente
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

describe("Webhook Concurrency: Idempotency with Simultaneous Events", () => {
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

  describe("Fase 1: Duplicate Event Detection", () => {
    test("should process only one event when same event ID is sent twice", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const eventId = `evt_duplicate_${crypto.randomUUID()}`;
      const payload = new WebhookPayloadBuilder()
        .chargePaymentFailed()
        .withEventId(eventId)
        .withOrganizationId(org.id)
        .build();

      const authHeader = createValidAuthHeader();

      // Send same webhook twice
      await WebhookService.process(payload as ProcessWebhook, authHeader);

      await WebhookService.process(payload as ProcessWebhook, authHeader);

      // Should only have one event record
      const events = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId));

      expect(events.length).toBe(1);
    });

    test("should maintain consistent subscription state after duplicate events", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const eventId = `evt_consistent_${crypto.randomUUID()}`;
      const payload = new WebhookPayloadBuilder()
        .chargePaymentFailed()
        .withEventId(eventId)
        .withOrganizationId(org.id)
        .build();

      const authHeader = createValidAuthHeader();

      // Send webhook 3 times
      await WebhookService.process(payload as ProcessWebhook, authHeader);

      await WebhookService.process(payload as ProcessWebhook, authHeader);

      await WebhookService.process(payload as ProcessWebhook, authHeader);

      // Status should be past_due (only processed once)
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });
  });

  describe("Fase 2: Concurrent Webhook Processing", () => {
    test("should handle concurrent webhooks with same event ID", async () => {
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

      const eventId = `evt_concurrent_${crypto.randomUUID()}`;
      const now = new Date();

      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withEventId(eventId)
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      const authHeader = createValidAuthHeader();

      // Send webhooks concurrently
      const results = await Promise.allSettled([
        WebhookService.process(payload as ProcessWebhook, authHeader),
        WebhookService.process(payload as ProcessWebhook, authHeader),
        WebhookService.process(payload as ProcessWebhook, authHeader),
      ]);

      // At least one should succeed (the first one)
      const fulfilledCount = results.filter(
        (r) => r.status === "fulfilled"
      ).length;
      expect(fulfilledCount).toBeGreaterThanOrEqual(1);

      // Only one event should be recorded (idempotency)
      const events = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId));

      expect(events.length).toBe(1);

      // Subscription should be in correct state
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
    });

    test("should handle concurrent different events correctly", async () => {
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

      const eventId1 = `evt_diff_1_${crypto.randomUUID()}`;
      const eventId2 = `evt_diff_2_${crypto.randomUUID()}`;
      const now = new Date();

      const payload1 = new WebhookPayloadBuilder()
        .chargePaid()
        .withEventId(eventId1)
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      const payload2 = new WebhookPayloadBuilder()
        .chargePaid()
        .withEventId(eventId2)
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      const authHeader = createValidAuthHeader();

      // Send different events concurrently
      await Promise.all([
        WebhookService.process(payload1 as ProcessWebhook, authHeader),
        WebhookService.process(payload2 as ProcessWebhook, authHeader),
      ]);

      // Both events should be recorded (different event IDs)
      const [event1] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId1));

      const [event2] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId2));

      expect(event1).toBeDefined();
      expect(event2).toBeDefined();
    });
  });

  describe("Fase 3: Event Type Specific Idempotency", () => {
    test("should be idempotent for charge.payment_failed", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const eventId = `evt_fail_idem_${crypto.randomUUID()}`;
      const payload = new WebhookPayloadBuilder()
        .chargePaymentFailed()
        .withEventId(eventId)
        .withOrganizationId(org.id)
        .withGatewayResponse("Insufficient funds")
        .build();

      const authHeader = createValidAuthHeader();

      // Process twice
      await WebhookService.process(payload as ProcessWebhook, authHeader);

      await WebhookService.process(payload as ProcessWebhook, authHeader);

      // Verify idempotency
      const events = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId));

      expect(events.length).toBe(1);

      // Verify grace period was set only once
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
      expect(subscription.pastDueSince).toBeInstanceOf(Date);
    });

    test("should be idempotent for subscription.created", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      // Create trial subscription first
      const trialPlanResult = await PlanFactory.createTrial();
      await SubscriptionFactory.createTrial(org.id, trialPlanResult.plan.id);

      const eventId = `evt_created_idem_${crypto.randomUUID()}`;
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      const now = new Date();

      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withEventId(eventId)
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPlanId(diamondPlanResult.plan.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      const authHeader = createValidAuthHeader();

      // Process twice
      await WebhookService.process(payload as ProcessWebhook, authHeader);

      await WebhookService.process(payload as ProcessWebhook, authHeader);

      // Only one event recorded
      const events = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId));

      expect(events.length).toBe(1);
    });

    test("should be idempotent for subscription.canceled", async () => {
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

      const eventId = `evt_canceled_idem_${crypto.randomUUID()}`;
      const payload = new WebhookPayloadBuilder()
        .subscriptionCanceled()
        .withEventId(eventId)
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .build();

      const authHeader = createValidAuthHeader();

      // Process twice
      await WebhookService.process(payload as ProcessWebhook, authHeader);

      await WebhookService.process(payload as ProcessWebhook, authHeader);

      // Only one event recorded
      const events = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId));

      expect(events.length).toBe(1);

      // Status should be canceled
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });
  });

  describe("Fase 4: Race Condition Scenarios", () => {
    test("should handle fail then success race condition", async () => {
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
      const authHeader = createValidAuthHeader();

      // Failure event
      const failEventId = `evt_fail_${crypto.randomUUID()}`;
      const failPayload = new WebhookPayloadBuilder()
        .chargePaymentFailed()
        .withEventId(failEventId)
        .withOrganizationId(org.id)
        .build();

      // Success event (retry succeeded)
      const successEventId = `evt_success_${crypto.randomUUID()}`;
      const successPayload = new WebhookPayloadBuilder()
        .chargePaid()
        .withEventId(successEventId)
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      // Process both (simulating race condition where they arrive close together)
      await Promise.all([
        WebhookService.process(failPayload as ProcessWebhook, authHeader),
        // Small delay to simulate realistic timing
        new Promise((resolve) => setTimeout(resolve, 10)).then(() =>
          WebhookService.process(successPayload as ProcessWebhook, authHeader)
        ),
      ]);

      // Final state should be active (success wins)
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");

      // Both events should be recorded
      const [failEvent] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, failEventId));

      const [successEvent] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, successEventId));

      expect(failEvent).toBeDefined();
      expect(successEvent).toBeDefined();
    });
  });

  describe("Fase 5: Edge Cases", () => {
    test("should handle high volume of concurrent duplicates", async () => {
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

      const eventId = `evt_volume_${crypto.randomUUID()}`;
      const now = new Date();

      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withEventId(eventId)
        .withSubscriptionId(pagarmeSubId)
        .withOrganizationId(org.id)
        .withPeriod(now, new Date(now.getTime() + 30 * MS_PER_DAY))
        .build();

      const authHeader = createValidAuthHeader();

      // Send 10 concurrent requests with same event ID
      const requests = new Array(10)
        .fill(null)
        .map(() =>
          WebhookService.process(payload as ProcessWebhook, authHeader)
        );

      await Promise.allSettled(requests);

      // Only one event should be recorded
      const events = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId));

      expect(events.length).toBe(1);

      // Subscription should be active
      const access = await SubscriptionService.checkAccess(org.id);
      expect(access.hasAccess).toBe(true);
    });

    test("should record event metadata correctly on first process", async () => {
      const org = await OrganizationFactory.create();
      createdOrgIds.push(org.id);

      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const eventId = `evt_meta_${crypto.randomUUID()}`;
      const payload = new WebhookPayloadBuilder()
        .chargePaymentFailed()
        .withEventId(eventId)
        .withOrganizationId(org.id)
        .build();

      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload as ProcessWebhook, authHeader);

      // Verify event metadata
      const [event] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId))
        .limit(1);

      expect(event.eventType).toBe("charge.payment_failed");
      expect(event.pagarmeEventId).toBe(eventId);
      expect(event.processedAt).toBeInstanceOf(Date);
      expect(event.payload).toBeDefined();
    });
  });
});
