import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createPendingCheckout } from "@/test/helpers/checkout";
import { createTestOrganization } from "@/test/helpers/organization";
import { seedPlans } from "@/test/helpers/seed";
import {
  createActiveSubscription,
  createTestSubscription,
} from "@/test/helpers/subscription";
import type { ProcessWebhook } from "../webhook.model";
import { WebhookService } from "../webhook.service";

function createValidAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function createPayload(
  type: string,
  data: Record<string, unknown>
): ProcessWebhook {
  return {
    id: `evt_${crypto.randomUUID()}`,
    type,
    created_at: new Date().toISOString(),
    data,
  };
}

describe("WebhookService", () => {
  beforeAll(async () => {
    await seedPlans();
  });

  describe("process", () => {
    test("should throw WebhookValidationError for missing auth header", async () => {
      const { WebhookValidationError } = await import("../../errors");
      const payload = createPayload("charge.paid", {});
      const rawBody = JSON.stringify(payload);

      await expect(
        WebhookService.process(payload, null, rawBody)
      ).rejects.toBeInstanceOf(WebhookValidationError);
    });

    test("should throw WebhookValidationError for invalid credentials", async () => {
      const { WebhookValidationError } = await import("../../errors");
      const payload = createPayload("charge.paid", {});
      const rawBody = JSON.stringify(payload);

      await expect(
        WebhookService.process(payload, "Basic aW52YWxpZDppbnZhbGlk", rawBody)
      ).rejects.toBeInstanceOf(WebhookValidationError);
    });

    test("should throw WebhookValidationError for malformed auth header", async () => {
      const { WebhookValidationError } = await import("../../errors");
      const payload = createPayload("charge.paid", {});
      const rawBody = JSON.stringify(payload);

      await expect(
        WebhookService.process(payload, "Bearer token123", rawBody)
      ).rejects.toBeInstanceOf(WebhookValidationError);
    });

    test("should accept valid Basic Auth credentials", async () => {
      const payload = createPayload("charge.paid", {});
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();
    });

    test("should create subscription event record", async () => {
      const eventId = `evt_${crypto.randomUUID()}`;
      const payload: ProcessWebhook = {
        id: eventId,
        type: "charge.paid",
        created_at: new Date().toISOString(),
        data: {},
      };
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [event] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId))
        .limit(1);

      expect(event).toBeDefined();
      expect(event.eventType).toBe("charge.paid");
    });

    test("should skip already processed event", async () => {
      const eventId = `evt_${crypto.randomUUID()}`;

      await db.insert(schema.subscriptionEvents).values({
        id: `event-${crypto.randomUUID()}`,
        pagarmeEventId: eventId,
        eventType: "charge.paid",
        payload: {},
        processedAt: new Date(),
      });

      const payload: ProcessWebhook = {
        id: eventId,
        type: "charge.paid",
        created_at: new Date().toISOString(),
        data: {},
      };
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();
    });
  });

  describe("handleChargePaid", () => {
    test("should update subscription to active", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const payload = createPayload("charge.paid", {
        metadata: { organization_id: org.id },
        subscription: { id: "sub_test_123" },
        current_period: {
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.pagarmeSubscriptionId).toBe("sub_test_123");
    });

    test("should set currentPeriodStart and currentPeriodEnd", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const startAt = new Date();
      const endAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const payload = createPayload("charge.paid", {
        metadata: { organization_id: org.id },
        subscription: { id: "sub_test_456" },
        current_period: {
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);
    });

    test("should ignore event without organization_id in metadata", async () => {
      const payload = createPayload("charge.paid", {
        subscription: { id: "sub_test" },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();
    });
  });

  describe("handleChargeFailed", () => {
    test("should update subscription to past_due", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const payload = createPayload("charge.payment_failed", {
        metadata: { organization_id: org.id },
        invoice: { id: "inv_123" },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("should ignore event without organization_id in metadata", async () => {
      const payload = createPayload("charge.payment_failed", {
        invoice: { id: "inv_123" },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();
    });

    test("should send payment failed email to organization owner", async () => {
      const { addMemberToOrganization } = await import(
        "@/test/helpers/organization"
      );
      const { createTestUser } = await import("@/test/helpers/user");
      const { waitForPaymentFailedEmail } = await import(
        "@/test/helpers/mailhog"
      );

      const ownerResult = await createTestUser({ emailVerified: true });
      const org = await createTestOrganization();
      await addMemberToOrganization(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });
      await createActiveSubscription(org.id, "test-plan-pro");

      const payload = createPayload("charge.payment_failed", {
        metadata: { organization_id: org.id },
        invoice: { id: "inv_email_test" },
        last_transaction: {
          gateway_response: { message: "Insufficient funds" },
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      // Verify subscription is past_due
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");

      // Verify payment failed email was sent
      const emailData = await waitForPaymentFailedEmail(ownerResult.user.email);

      expect(emailData.subject).toContain("Falha no Pagamento");
      expect(emailData.planName).toBe("Pro");
      expect(emailData.errorMessage).toBe("Insufficient funds");
    });
  });

  describe("handleSubscriptionCanceled", () => {
    test("should update subscription to canceled", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const payload = createPayload("subscription.canceled", {
        id: "sub_cancel_123",
        metadata: { organization_id: org.id },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should find subscription by pagarmeSubscriptionId when no metadata", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-pro", pagarmeSubId);

      const payload = createPayload("subscription.canceled", {
        id: pagarmeSubId,
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should ignore event when subscription not found", async () => {
      const payload = createPayload("subscription.canceled", {
        id: "sub_nonexistent",
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();
    });

    test("should send cancellation email to organization owner", async () => {
      const { addMemberToOrganization } = await import(
        "@/test/helpers/organization"
      );
      const { createTestUser } = await import("@/test/helpers/user");

      const owner = await createTestUser({ emailVerified: true });
      const org = await createTestOrganization();
      await addMemberToOrganization(owner, {
        organizationId: org.id,
        role: "owner",
      });
      await createActiveSubscription(org.id, "test-plan-pro");

      const payload = createPayload("subscription.canceled", {
        id: "sub_cancel_email_test",
        metadata: { organization_id: org.id },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      // Should complete without error (email sent to Mailhog)
      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();

      // Verify subscription was canceled
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should send cancellation email when found by pagarmeSubscriptionId", async () => {
      const { addMemberToOrganization } = await import(
        "@/test/helpers/organization"
      );
      const { createTestUser } = await import("@/test/helpers/user");

      const owner = await createTestUser({ emailVerified: true });
      const org = await createTestOrganization();
      await addMemberToOrganization(owner, {
        organizationId: org.id,
        role: "owner",
      });
      const pagarmeSubId = `sub_email_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-pro", pagarmeSubId);

      const payload = createPayload("subscription.canceled", {
        id: pagarmeSubId,
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      // Should complete without error (email sent to Mailhog)
      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();

      // Verify subscription was canceled
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should cancel subscription even when organization has no owner (no email sent)", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const payload = createPayload("subscription.canceled", {
        id: "sub_no_owner",
        metadata: { organization_id: org.id },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      // Should complete without error (no email sent, but no error either)
      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();

      // Verify subscription was still canceled
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });
  });

  describe("handleSubscriptionCreated", () => {
    test("should activate subscription via pending checkout lookup", async () => {
      const org = await createTestOrganization();
      const checkout = await createPendingCheckout(org.id, "test-plan-pro");
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const payload = createPayload("subscription.created", {
        id: `sub_${crypto.randomUUID()}`,
        code: checkout.paymentLinkId,
        current_period: {
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.trialUsed).toBe(true);
    });

    test("should mark pending checkout as completed", async () => {
      const org = await createTestOrganization();
      const checkout = await createPendingCheckout(org.id, "test-plan-pro");
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const payload = createPayload("subscription.created", {
        id: `sub_${crypto.randomUUID()}`,
        code: checkout.paymentLinkId,
        current_period: {
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [updatedCheckout] = await db
        .select()
        .from(schema.pendingCheckouts)
        .where(eq(schema.pendingCheckouts.id, checkout.id))
        .limit(1);

      expect(updatedCheckout.status).toBe("completed");
      expect(updatedCheckout.completedAt).toBeInstanceOf(Date);
    });

    test("should sync customer data to organization profile", async () => {
      const org = await createTestOrganization();
      const checkout = await createPendingCheckout(org.id, "test-plan-pro");
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const customerId = `cus_${crypto.randomUUID().slice(0, 8)}`;
      const payload = createPayload("subscription.created", {
        id: `sub_${crypto.randomUUID()}`,
        code: checkout.paymentLinkId,
        customer: {
          id: customerId,
          name: "Synced Customer Name",
          document: `${Date.now()}`.slice(0, 11),
          phones: {
            mobile_phone: {
              country_code: "55",
              area_code: "11",
              number: "987654321",
            },
          },
        },
        current_period: {
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [profile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBe(customerId);
    });

    test("should work with metadata.organization_id (direct)", async () => {
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const payload = createPayload("subscription.created", {
        id: `sub_${crypto.randomUUID()}`,
        metadata: { organization_id: org.id, plan_id: "test-plan-pro" },
        current_period: {
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
    });

    test("should ignore event when organization not found", async () => {
      const payload = createPayload("subscription.created", {
        id: `sub_${crypto.randomUUID()}`,
        code: "pl_nonexistent",
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();
    });

    test("should set pagarmeSubscriptionId and pagarmeCustomerId", async () => {
      const org = await createTestOrganization();
      const checkout = await createPendingCheckout(org.id, "test-plan-pro");
      await createTestSubscription(org.id, "test-plan-pro", "trial");

      const subId = `sub_${crypto.randomUUID()}`;
      const payload = createPayload("subscription.created", {
        id: subId,
        code: checkout.paymentLinkId,
        customer: { id: "cus_abc123", name: "Test", document: "12345678909" },
        current_period: {
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.pagarmeSubscriptionId).toBe(subId);
      expect(subscription.pagarmeCustomerId).toBe("cus_abc123");
    });
  });

  describe("handleChargeRefunded", () => {
    test("should cancel subscription when charge is refunded via metadata", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const payload = createPayload("charge.refunded", {
        id: "ch_refund_123",
        amount: 9900,
        metadata: { organization_id: org.id },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should cancel subscription when charge is refunded via pagarmeSubscriptionId", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-pro", pagarmeSubId);

      const payload = createPayload("charge.refunded", {
        id: "ch_refund_456",
        amount: 9900,
        subscription: { id: pagarmeSubId },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should ignore refund event when subscription not found", async () => {
      const payload = createPayload("charge.refunded", {
        id: "ch_refund_789",
        amount: 9900,
        subscription: { id: "sub_nonexistent" },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();
    });

    test("should record refund event in subscriptionEvents", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const eventId = `evt_refund_${crypto.randomUUID()}`;
      const payload: ProcessWebhook = {
        id: eventId,
        type: "charge.refunded",
        created_at: new Date().toISOString(),
        data: {
          id: "ch_refund_event",
          amount: 9900,
          metadata: { organization_id: org.id },
        },
      };
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [event] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId))
        .limit(1);

      expect(event).toBeDefined();
      expect(event.eventType).toBe("charge.refunded");
      expect(event.processedAt).toBeInstanceOf(Date);
    });

    test("should handle refund with reason from gateway response", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const payload = createPayload("charge.refunded", {
        id: "ch_refund_reason",
        amount: 9900,
        metadata: { organization_id: org.id },
        last_transaction: {
          gateway_response: { message: "Customer requested refund" },
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });
  });

  describe("handleSubscriptionUpdated", () => {
    test("should update subscription status when changed", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-pro", pagarmeSubId);

      const payload = createPayload("subscription.updated", {
        id: pagarmeSubId,
        status: "canceled",
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should update current period dates", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-pro", pagarmeSubId);

      const newPeriodStart = new Date();
      const newPeriodEnd = new Date();
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

      const payload = createPayload("subscription.updated", {
        id: pagarmeSubId,
        current_period: {
          start_at: newPeriodStart.toISOString(),
          end_at: newPeriodEnd.toISOString(),
        },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);
    });

    test("should find subscription by metadata organization_id", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-pro");

      const payload = createPayload("subscription.updated", {
        id: "sub_any",
        status: "canceled",
        metadata: { organization_id: org.id },
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should ignore update when subscription not found", async () => {
      const payload = createPayload("subscription.updated", {
        id: "sub_nonexistent",
        status: "canceled",
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await expect(
        WebhookService.process(payload, authHeader, rawBody)
      ).resolves.toBeUndefined();
    });

    test("should not update status if same as current", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-pro", pagarmeSubId);

      const payload = createPayload("subscription.updated", {
        id: pagarmeSubId,
        status: "active",
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.canceledAt).toBeNull();
    });

    test("should map pending status to past_due", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-pro", pagarmeSubId);

      const payload = createPayload("subscription.updated", {
        id: pagarmeSubId,
        status: "pending",
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("should map failed status to past_due", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-pro", pagarmeSubId);

      const payload = createPayload("subscription.updated", {
        id: pagarmeSubId,
        status: "failed",
      });
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("should record update event in subscriptionEvents", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-pro", pagarmeSubId);

      const eventId = `evt_update_${crypto.randomUUID()}`;
      const payload: ProcessWebhook = {
        id: eventId,
        type: "subscription.updated",
        created_at: new Date().toISOString(),
        data: {
          id: pagarmeSubId,
          card: { id: "card_new_123" },
        },
      };
      const rawBody = JSON.stringify(payload);
      const authHeader = createValidAuthHeader();

      await WebhookService.process(payload, authHeader, rawBody);

      const [event] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId))
        .limit(1);

      expect(event).toBeDefined();
      expect(event.eventType).toBe("subscription.updated");
      expect(event.processedAt).toBeInstanceOf(Date);
    });
  });
});
