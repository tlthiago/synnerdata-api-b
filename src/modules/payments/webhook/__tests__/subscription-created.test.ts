import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  organizationProfiles,
  orgSubscriptions,
  subscriptionEvents,
} from "@/db/schema";
import { env } from "@/env";
import { proPlan } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createPendingCheckout } from "@/test/helpers/checkout";
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { createWebhookRequest, webhookPayloads } from "@/test/helpers/webhook";

const BASE_URL = env.API_URL;
const WEBHOOK_URL = `${BASE_URL}/v1/payments/webhooks/pagarme`;

describe("POST /v1/payments/webhooks/pagarme - subscription.created", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  afterAll(async () => {
    // Clean up test events
    await db
      .delete(subscriptionEvents)
      .where(eq(subscriptionEvents.eventType, "subscription.created"));
  });

  test("should activate subscription on subscription.created webhook", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    // Create trial subscription
    await createTestSubscription(orgId, proPlan.id, "trial");

    // Verify subscription is in trial
    const [beforeSub] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1);

    expect(beforeSub.status).toBe("trial");

    // Send subscription.created webhook
    const payload = webhookPayloads.subscriptionCreated(orgId, proPlan.id);
    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);

    // Verify subscription is now active
    const [afterSub] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1);

    expect(afterSub.status).toBe("active");
    expect(afterSub.pagarmeSubscriptionId).toStartWith("sub_");
    expect(afterSub.trialUsed).toBe(true);
    expect(afterSub.currentPeriodStart).toBeDefined();
    expect(afterSub.currentPeriodEnd).toBeDefined();
  });

  test("should store pagarmeCustomerId in subscription", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    await createTestSubscription(orgId, proPlan.id, "trial");

    // Send webhook with customer data
    const customerId = `cus_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const payload = webhookPayloads.subscriptionCreated(orgId, proPlan.id, {
      id: customerId,
      name: "John Doe",
      email: "john@example.com",
      document: "12345678909",
    });

    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);

    // Verify customer ID was stored
    const [subscription] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1);

    expect(subscription.pagarmeCustomerId).toBe(customerId);
  });

  test("should sync customer data to organization profile (empty fields only)", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    await createTestSubscription(orgId, proPlan.id, "trial");

    // Get current profile to verify existing data
    const [beforeProfile] = await db
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, orgId))
      .limit(1);

    // Clear legalName to test sync
    await db
      .update(organizationProfiles)
      .set({ legalName: "" })
      .where(eq(organizationProfiles.organizationId, orgId));

    // Send webhook with customer data
    const customerName = "New Legal Name from Pagarme";
    const customerId = `cus_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const payload = webhookPayloads.subscriptionCreated(orgId, proPlan.id, {
      id: customerId,
      name: customerName,
      email: "customer@example.com",
      document: "98765432100",
    });

    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);

    // Verify profile was updated
    const [afterProfile] = await db
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, orgId))
      .limit(1);

    // legalName should be synced (was empty)
    expect(afterProfile.legalName).toBe(customerName);

    // taxId should NOT be synced (already had value)
    expect(afterProfile.taxId).toBe(beforeProfile.taxId);

    // pagarmeCustomerId should be stored
    expect(afterProfile.pagarmeCustomerId).toBe(customerId);
  });

  test("should sync phone number from webhook", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    await createTestSubscription(orgId, proPlan.id, "trial");

    // Clear mobile to test sync
    await db
      .update(organizationProfiles)
      .set({ mobile: "" })
      .where(eq(organizationProfiles.organizationId, orgId));

    // Send webhook with phone data
    const payload = webhookPayloads.subscriptionCreated(orgId, proPlan.id, {
      name: "Phone Test Customer",
      phone: "11987654321", // Will be split into area_code + number
    });

    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);

    // Verify phone was synced
    const [profile] = await db
      .select({ mobile: organizationProfiles.mobile })
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, orgId))
      .limit(1);

    // Phone should be formatted as +country_code + area_code + number
    expect(profile.mobile).toBe("+5511987654321");
  });

  test("should not overwrite existing profile data", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    await createTestSubscription(orgId, proPlan.id, "trial");

    // Get existing profile data
    const [existingProfile] = await db
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, orgId))
      .limit(1);

    const originalTaxId = existingProfile.taxId;
    const originalMobile = existingProfile.mobile;

    // Send webhook with different data
    const payload = webhookPayloads.subscriptionCreated(orgId, proPlan.id, {
      name: "Different Name",
      document: "00000000000", // Different document
      phone: "21999999999", // Different phone
    });

    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);

    // Verify existing data was preserved
    const [afterProfile] = await db
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, orgId))
      .limit(1);

    expect(afterProfile.taxId).toBe(originalTaxId);
    expect(afterProfile.mobile).toBe(originalMobile);
  });

  test("should handle webhook without customer data", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    await createTestSubscription(orgId, proPlan.id, "trial");

    // Send webhook without customer
    const payload = webhookPayloads.subscriptionCreated(orgId, proPlan.id);
    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);

    // Subscription should still be activated
    const [subscription] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1);

    expect(subscription.status).toBe("active");
  });

  test("should ignore webhook without organization_id in metadata", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    await createTestSubscription(orgId, proPlan.id, "trial");

    // Create payload without organization_id
    const payload = {
      id: `evt-${crypto.randomUUID()}`,
      type: "subscription.created" as const,
      created_at: new Date().toISOString(),
      data: {
        id: `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        status: "active",
        metadata: {
          plan_id: proPlan.id,
          // No organization_id
        },
      },
    };

    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);

    // Subscription should remain in trial (not changed)
    const [subscription] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1);

    expect(subscription.status).toBe("trial");
  });

  test("should be idempotent - processing same event twice", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    await createTestSubscription(orgId, proPlan.id, "trial");

    // Create webhook with fixed event ID
    const eventId = `evt-idempotent-${crypto.randomUUID()}`;
    const payload = webhookPayloads.subscriptionCreated(orgId, proPlan.id);
    (payload as { id: string }).id = eventId;

    // Send first time
    const request1 = createWebhookRequest(WEBHOOK_URL, payload);
    const response1 = await app.handle(request1);
    expect(response1.status).toBe(200);

    // Verify subscription activated
    const [afterFirst] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1);
    expect(afterFirst.status).toBe("active");

    // Send second time with same event ID
    const request2 = createWebhookRequest(WEBHOOK_URL, payload);
    const response2 = await app.handle(request2);
    expect(response2.status).toBe(200);

    // Count events with this ID - should be only 1
    const events = await db
      .select()
      .from(subscriptionEvents)
      .where(eq(subscriptionEvents.pagarmeEventId, eventId));

    expect(events.length).toBe(1);
    expect(events[0].processedAt).toBeDefined();
  });

  test("should activate subscription via pending_checkout lookup (real Pagarme flow)", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    // Create trial subscription
    await createTestSubscription(orgId, proPlan.id, "trial");

    // Create pending checkout (simulating CheckoutService.create)
    const { paymentLinkId } = await createPendingCheckout(orgId, proPlan.id);

    // Send webhook with code (payment link ID) for precise lookup
    const payload =
      webhookPayloads.subscriptionCreatedFromPaymentLink(paymentLinkId);
    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);

    // Verify subscription is now active
    const [subscription] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1);

    expect(subscription.status).toBe("active");
    expect(subscription.pagarmeSubscriptionId).toBeDefined();
    expect(subscription.trialUsed).toBe(true);
  });

  test("should mark pending_checkout as completed after successful activation", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    await createTestSubscription(orgId, proPlan.id, "trial");

    // Create pending checkout
    const { id: checkoutId, paymentLinkId } = await createPendingCheckout(
      orgId,
      proPlan.id
    );

    // Send webhook with code (payment link ID)
    const payload =
      webhookPayloads.subscriptionCreatedFromPaymentLink(paymentLinkId);
    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);

    // Verify pending checkout was marked as completed
    const { pendingCheckouts } = await import("@/db/schema");
    const [checkout] = await db
      .select()
      .from(pendingCheckouts)
      .where(eq(pendingCheckouts.id, checkoutId))
      .limit(1);

    expect(checkout.status).toBe("completed");
    expect(checkout.completedAt).toBeInstanceOf(Date);
  });

  test("should ignore webhook with unknown payment link code", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!(orgId && proPlan)) {
      throw new Error("Test setup failed");
    }

    await createTestSubscription(orgId, proPlan.id, "trial");

    // NO pending checkout created - simulates webhook for unknown payment link

    // Send webhook with unknown code
    const payload = webhookPayloads.subscriptionCreatedFromPaymentLink(
      "pl_unknown_payment_link"
    );
    const request = createWebhookRequest(WEBHOOK_URL, payload);
    const response = await app.handle(request);

    expect(response.status).toBe(200);

    // Subscription should remain in trial (no matching pending checkout)
    const [subscription] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1);

    expect(subscription.status).toBe("trial");
  });
});
