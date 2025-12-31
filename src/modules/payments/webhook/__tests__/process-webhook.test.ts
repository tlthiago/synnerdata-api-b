import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { type CreatePlanResult, createPaidPlan } from "@/test/factories/plan";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createPendingCheckout } from "@/test/helpers/checkout";
import { createTestOrganization } from "@/test/helpers/organization";
import { createTestSubscription } from "@/test/helpers/subscription";

const BASE_URL = env.API_URL;

let diamondPlanResult: CreatePlanResult;

function createWebhookAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function createWebhookPayload(
  type: string,
  data: Record<string, unknown>,
  id?: string
) {
  return {
    id: id ?? `evt_${crypto.randomUUID()}`,
    type,
    created_at: new Date().toISOString(),
    data,
  };
}

describe("POST /v1/payments/webhooks/pagarme", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    diamondPlanResult = await createPaidPlan("diamond");
  });

  test("should reject request without Authorization header", async () => {
    const payload = createWebhookPayload("charge.paid", {});

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
    const payload = createWebhookPayload("charge.paid", {});

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
    const payload = createWebhookPayload("charge.paid", {});

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
    const org = await createTestOrganization();
    await createTestSubscription(org.id, diamondPlanResult.plan.id, "trial");

    const payload = createWebhookPayload("charge.paid", {
      metadata: { organization_id: org.id },
      subscription: { id: "sub_test_123" },
      current_period: {
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    const rawBody = JSON.stringify(payload);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.received).toBe(true);
  });

  test("should create subscription_events record", async () => {
    const eventId = `evt_${crypto.randomUUID()}`;
    const payload = createWebhookPayload(
      "charge.paid",
      { metadata: { organization_id: "test-org" } },
      eventId
    );
    const rawBody = JSON.stringify(payload);
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: rawBody,
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
    const payload = createWebhookPayload("charge.paid", {}, eventId);
    const rawBody = JSON.stringify(payload);
    await db.insert(schema.subscriptionEvents).values({
      id: `event-${crypto.randomUUID()}`,
      pagarmeEventId: eventId,
      eventType: "charge.paid",
      payload: {},
      processedAt: new Date(),
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
  });

  test("should process subscription.created and activate subscription", async () => {
    const org = await createTestOrganization();
    const checkout = await createPendingCheckout(
      org.id,
      diamondPlanResult.plan.id
    );
    await createTestSubscription(org.id, diamondPlanResult.plan.id, "trial");

    const payload = createWebhookPayload("subscription.created", {
      id: `sub_${crypto.randomUUID()}`,
      code: checkout.paymentLinkId,
      metadata: { organization_id: org.id, plan_id: diamondPlanResult.plan.id },
      customer: { id: "cus_123", name: "Test", document: "12345678909" },
      current_period: {
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    const rawBody = JSON.stringify(payload);
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: rawBody,
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
    const org = await createTestOrganization();
    const checkout = await createPendingCheckout(
      org.id,
      diamondPlanResult.plan.id
    );
    await createTestSubscription(org.id, diamondPlanResult.plan.id, "trial");

    const payload = createWebhookPayload("subscription.created", {
      id: `sub_${crypto.randomUUID()}`,
      code: checkout.paymentLinkId,
      current_period: {
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    const rawBody = JSON.stringify(payload);
    await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: rawBody,
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
    const org = await createTestOrganization();
    await createTestSubscription(org.id, diamondPlanResult.plan.id, "active");

    const payload = createWebhookPayload("charge.payment_failed", {
      metadata: { organization_id: org.id },
      invoice: { id: "inv_123" },
    });
    const rawBody = JSON.stringify(payload);
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: rawBody,
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
    const org = await createTestOrganization();
    await createTestSubscription(org.id, diamondPlanResult.plan.id, "active");

    const payload = createWebhookPayload("subscription.canceled", {
      id: "sub_123",
      metadata: { organization_id: org.id },
    });
    const rawBody = JSON.stringify(payload);
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: rawBody,
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
    const payload = createWebhookPayload("unknown.event.type", {});
    const rawBody = JSON.stringify(payload);
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/webhooks/pagarme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createWebhookAuthHeader(),
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
  });
});
