import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { WebhookService } from "@/modules/payments/webhook/webhook.service";
import { WebhookPayloadBuilder } from "@/test/builders/webhook-payload.builder";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { CheckoutFactory } from "@/test/factories/payments/checkout.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { waitForPaymentFailedEmail } from "@/test/support/mailhog";

let diamondPlanResult: CreatePlanResult;

function createValidAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

describe("WebhookService", () => {
  beforeAll(async () => {
    // Register payment listeners for email tests
    const { registerPaymentListeners } = await import(
      "@/modules/payments/hooks/listeners"
    );
    registerPaymentListeners();
    diamondPlanResult = await PlanFactory.createPaid("diamond");
  });

  describe("process", () => {
    test("should throw WebhookValidationError for missing auth header", async () => {
      const { WebhookValidationError } = await import("../../errors");
      const payload = new WebhookPayloadBuilder().chargePaid().build();

      await expect(
        WebhookService.process(payload, null)
      ).rejects.toBeInstanceOf(WebhookValidationError);
    });

    test("should throw WebhookValidationError for invalid credentials", async () => {
      const { WebhookValidationError } = await import("../../errors");
      const payload = new WebhookPayloadBuilder().chargePaid().build();

      await expect(
        WebhookService.process(payload, "Basic aW52YWxpZDppbnZhbGlk")
      ).rejects.toBeInstanceOf(WebhookValidationError);
    });

    test("should throw WebhookValidationError for malformed auth header", async () => {
      const { WebhookValidationError } = await import("../../errors");
      const payload = new WebhookPayloadBuilder().chargePaid().build();

      await expect(
        WebhookService.process(payload, "Bearer token123")
      ).rejects.toBeInstanceOf(WebhookValidationError);
    });

    test("should accept valid Basic Auth credentials", async () => {
      const payload = new WebhookPayloadBuilder().chargePaid().build();

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();
    });

    test("should create subscription event record", async () => {
      const eventId = `evt_${crypto.randomUUID()}`;
      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withEventId(eventId)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

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

      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withEventId(eventId)
        .build();

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();
    });
  });

  describe("handleChargePaid", () => {
    test("should update subscription to active", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withOrganizationId(org.id)
        .withSubscriptionId("sub_test_123")
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.pagarmeSubscriptionId).toBe("sub_test_123");
    });

    test("should set currentPeriodStart and currentPeriodEnd", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      const startAt = new Date();
      const endAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withOrganizationId(org.id)
        .withSubscriptionId("sub_test_456")
        .withPeriod(startAt, endAt)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);
    });

    test("should ignore event without organization_id in metadata", async () => {
      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withSubscriptionId("sub_test")
        .build();

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();
    });
  });

  describe("handleChargeFailed", () => {
    test("should update subscription to past_due", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .chargePaymentFailed()
        .withOrganizationId(org.id)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("should ignore event without organization_id in metadata", async () => {
      const payload = new WebhookPayloadBuilder().chargePaymentFailed().build();

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();
    });

    test("should send payment failed email to organization owner", async () => {
      const ownerResult = await UserFactory.create({ emailVerified: true });
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(ownerResult, {
        organizationId: org.id,
        role: "owner",
      });
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .chargePaymentFailed()
        .withOrganizationId(org.id)
        .withGatewayResponse("Insufficient funds")
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

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
      expect(emailData.planName).toBe(diamondPlanResult.plan.displayName);
      expect(emailData.errorMessage).toBe("Insufficient funds");
    });
  });

  describe("handleSubscriptionCanceled", () => {
    test("should update subscription to canceled", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCanceled()
        .withSubscriptionId("sub_cancel_123")
        .withOrganizationId(org.id)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should find subscription by pagarmeSubscriptionId when no metadata", async () => {
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const payload = new WebhookPayloadBuilder()
        .subscriptionCanceled()
        .withSubscriptionId(pagarmeSubId)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should ignore event when subscription not found", async () => {
      const payload = new WebhookPayloadBuilder()
        .subscriptionCanceled()
        .withSubscriptionId("sub_nonexistent")
        .build();

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();
    });

    test("should send cancellation email to organization owner", async () => {
      const owner = await UserFactory.create({ emailVerified: true });
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(owner, {
        organizationId: org.id,
        role: "owner",
      });
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCanceled()
        .withSubscriptionId("sub_cancel_email_test")
        .withOrganizationId(org.id)
        .build();

      // Should complete without error (email sent to Mailhog)
      await expect(
        WebhookService.process(payload, createValidAuthHeader())
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
      const owner = await UserFactory.create({ emailVerified: true });
      const org = await OrganizationFactory.create();
      await OrganizationFactory.addMember(owner, {
        organizationId: org.id,
        role: "owner",
      });
      const pagarmeSubId = `sub_email_${crypto.randomUUID()}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const payload = new WebhookPayloadBuilder()
        .subscriptionCanceled()
        .withSubscriptionId(pagarmeSubId)
        .build();

      // Should complete without error (email sent to Mailhog)
      await expect(
        WebhookService.process(payload, createValidAuthHeader())
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
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCanceled()
        .withSubscriptionId("sub_no_owner")
        .withOrganizationId(org.id)
        .build();

      // Should complete without error (no email sent, but no error either)
      await expect(
        WebhookService.process(payload, createValidAuthHeader())
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
      const org = await OrganizationFactory.create();
      const checkout = await CheckoutFactory.create(
        org.id,
        diamondPlanResult.plan.id
      );
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withPaymentLinkCode(checkout.paymentLinkId)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.trialUsed).toBe(true);
    });

    test("should mark pending checkout as completed", async () => {
      const org = await OrganizationFactory.create();
      const checkout = await CheckoutFactory.create(
        org.id,
        diamondPlanResult.plan.id
      );
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withPaymentLinkCode(checkout.paymentLinkId)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [updatedCheckout] = await db
        .select()
        .from(schema.pendingCheckouts)
        .where(eq(schema.pendingCheckouts.id, checkout.id))
        .limit(1);

      expect(updatedCheckout.status).toBe("completed");
      expect(updatedCheckout.completedAt).toBeInstanceOf(Date);
    });

    // Note: syncCustomerData was removed - customer data comes from billing profile
    // and should not be overwritten by webhook

    test("should work with metadata.organization_id (direct)", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withOrganizationId(org.id)
        .withPlanId(diamondPlanResult.plan.id)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
    });

    test("should ignore event when organization not found", async () => {
      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withPaymentLinkCode("pl_nonexistent")
        .build();

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();
    });

    test("should set pagarmeSubscriptionId", async () => {
      const org = await OrganizationFactory.create();
      const checkout = await CheckoutFactory.create(
        org.id,
        diamondPlanResult.plan.id
      );
      await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

      const subId = `sub_${crypto.randomUUID()}`;
      const payload = new WebhookPayloadBuilder()
        .subscriptionCreated()
        .withSubscriptionId(subId)
        .withPaymentLinkCode(checkout.paymentLinkId)
        .withCustomer({
          id: "cus_abc123",
          name: "Test",
          document: "12345678909",
        })
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.pagarmeSubscriptionId).toBe(subId);
      // Note: pagarmeCustomerId is now stored in billing_profiles, not org_subscriptions
    });
  });

  describe("handleChargeRefunded", () => {
    test("should cancel subscription when charge is refunded via metadata", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .chargeRefunded()
        .withOrganizationId(org.id)
        .withAmount(9900)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should cancel subscription when charge is refunded via pagarmeSubscriptionId", async () => {
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const payload = new WebhookPayloadBuilder()
        .chargeRefunded()
        .withSubscriptionId(pagarmeSubId)
        .withAmount(9900)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should ignore refund event when subscription not found", async () => {
      const payload = new WebhookPayloadBuilder()
        .chargeRefunded()
        .withSubscriptionId("sub_nonexistent")
        .withAmount(9900)
        .build();

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();
    });

    test("should record refund event in subscriptionEvents", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const eventId = `evt_refund_${crypto.randomUUID()}`;
      const payload = new WebhookPayloadBuilder()
        .chargeRefunded()
        .withEventId(eventId)
        .withOrganizationId(org.id)
        .withAmount(9900)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

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
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .chargeRefunded()
        .withOrganizationId(org.id)
        .withAmount(9900)
        .withGatewayResponse("Customer requested refund")
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

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
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const payload = new WebhookPayloadBuilder()
        .subscriptionUpdated()
        .withSubscriptionId(pagarmeSubId)
        .withStatus("canceled")
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });

    test("should update current period dates", async () => {
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const newPeriodStart = new Date();
      const newPeriodEnd = new Date();
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

      const payload = new WebhookPayloadBuilder()
        .subscriptionUpdated()
        .withSubscriptionId(pagarmeSubId)
        .withPeriod(newPeriodStart, newPeriodEnd)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);
    });

    test("should find subscription by metadata organization_id", async () => {
      const org = await OrganizationFactory.create();
      await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

      const payload = new WebhookPayloadBuilder()
        .subscriptionUpdated()
        .withSubscriptionId("sub_any")
        .withStatus("canceled")
        .withOrganizationId(org.id)
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });

    test("should ignore update when subscription not found", async () => {
      const payload = new WebhookPayloadBuilder()
        .subscriptionUpdated()
        .withSubscriptionId("sub_nonexistent")
        .withStatus("canceled")
        .build();

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();
    });

    test("should not update status if same as current", async () => {
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const payload = new WebhookPayloadBuilder()
        .subscriptionUpdated()
        .withSubscriptionId(pagarmeSubId)
        .withStatus("active")
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.canceledAt).toBeNull();
    });

    test("should map pending status to past_due", async () => {
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const payload = new WebhookPayloadBuilder()
        .subscriptionUpdated()
        .withSubscriptionId(pagarmeSubId)
        .withStatus("pending")
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("should map failed status to past_due", async () => {
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const payload = new WebhookPayloadBuilder()
        .subscriptionUpdated()
        .withSubscriptionId(pagarmeSubId)
        .withStatus("failed")
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("should record update event in subscriptionEvents", async () => {
      const org = await OrganizationFactory.create();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await SubscriptionFactory.createActive(
        org.id,
        diamondPlanResult.plan.id,
        {
          pagarmeSubscriptionId: pagarmeSubId,
        }
      );

      const eventId = `evt_update_${crypto.randomUUID()}`;
      const payload = new WebhookPayloadBuilder()
        .subscriptionUpdated()
        .withEventId(eventId)
        .withSubscriptionId(pagarmeSubId)
        .withCard({ id: "card_new_123" })
        .build();

      await WebhookService.process(payload, createValidAuthHeader());

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
