import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { WebhookPayloadBuilder } from "@/test/builders/webhook-payload.builder";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { CheckoutFactory } from "@/test/factories/payments/checkout.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

let diamondPlanResult: CreatePlanResult;

function createWebhookAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

describe("POST /v1/payments/webhooks/pagarme", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    diamondPlanResult = await PlanFactory.createPaid("diamond");
  });

  test("should reject request without Authorization header", async () => {
    const payload = new WebhookPayloadBuilder().chargePaid().build();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_WEBHOOK_CREDENTIALS");
  });

  test("should reject request with invalid credentials", async () => {
    const payload = new WebhookPayloadBuilder().chargePaid().build();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic aW52YWxpZDppbnZhbGlk",
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_WEBHOOK_CREDENTIALS");
  });

  test("should reject request with malformed auth header", async () => {
    const payload = new WebhookPayloadBuilder().chargePaid().build();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token123",
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should process valid webhook and return success response", async () => {
    const org = await OrganizationFactory.create();
    await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

    const payload = new WebhookPayloadBuilder()
      .chargePaid()
      .withOrganizationId(org.id)
      .withSubscriptionId("sub_test_123")
      .build();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.received).toBe(true);
  });

  test("should create subscription_events record", async () => {
    const eventId = `evt_${crypto.randomUUID()}`;
    const payload = new WebhookPayloadBuilder()
      .chargePaid()
      .withEventId(eventId)
      .withOrganizationId("test-org")
      .build();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);

    const [event] = await db
      .select()
      .from(schema.subscriptionEvents)
      .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId))
      .limit(1);

    expect(event).toBeDefined();
    expect(event.eventType).toBe("charge.paid");
    expect(event.processedAt).toBeInstanceOf(Date);
  });

  test("should skip already processed event (idempotency)", async () => {
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

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should process subscription.created and activate subscription", async () => {
    const org = await OrganizationFactory.create();
    const checkout = await CheckoutFactory.create(
      org.id,
      diamondPlanResult.plan.id
    );
    await SubscriptionFactory.createTrial(org.id, diamondPlanResult.plan.id);

    const payload = new WebhookPayloadBuilder()
      .subscriptionCreated()
      .withPaymentLinkCode(checkout.paymentLinkId)
      .withOrganizationId(org.id)
      .withPlanId(diamondPlanResult.plan.id)
      .withCustomer({ id: "cus_123", name: "Test", document: "12345678909" })
      .build();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);

    expect(subscription.status).toBe("active");
    expect(subscription.pagarmeSubscriptionId).toBeDefined();
  });

  test("should mark pending checkout as completed on subscription.created", async () => {
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

    await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: JSON.stringify(payload),
      })
    );

    const [updatedCheckout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.id, checkout.id))
      .limit(1);

    expect(updatedCheckout.status).toBe("completed");
    expect(updatedCheckout.completedAt).toBeInstanceOf(Date);
  });

  test("should update subscription to past_due on charge.payment_failed", async () => {
    const org = await OrganizationFactory.create();
    await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

    const payload = new WebhookPayloadBuilder()
      .chargePaymentFailed()
      .withOrganizationId(org.id)
      .build();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);

    expect(subscription.status).toBe("past_due");
  });

  test("should update subscription to canceled on subscription.canceled", async () => {
    const org = await OrganizationFactory.create();
    await SubscriptionFactory.createActive(org.id, diamondPlanResult.plan.id);

    const payload = new WebhookPayloadBuilder()
      .subscriptionCanceled()
      .withSubscriptionId("sub_123")
      .withOrganizationId(org.id)
      .build();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);

    expect(subscription.status).toBe("canceled");
    expect(subscription.canceledAt).toBeInstanceOf(Date);
  });

  test("should handle unhandled event types gracefully", async () => {
    const payload = new WebhookPayloadBuilder()
      .withEventType("unknown.event.type")
      .build();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
  });
});
