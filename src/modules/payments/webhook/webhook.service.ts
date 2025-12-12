import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSubscriptions, subscriptionEvents } from "@/db/schema";
import { env } from "@/env";
import { WebhookValidationError } from "../errors";
import { PaymentHooks } from "../hooks";
import type { WebhookPayload } from "./webhook.model";

export abstract class WebhookService {
  /**
   * Process incoming Pagarme webhook.
   */
  static async process(payload: WebhookPayload, signature: string | null) {
    // Validate HMAC signature
    WebhookService.validateSignature(payload, signature);

    // Check idempotency - skip if already processed
    const existingEvent = await db.query.subscriptionEvents.findFirst({
      where: eq(subscriptionEvents.pagarmeEventId, payload.id),
    });

    if (existingEvent?.processedAt) {
      return; // Already processed
    }

    // Create event record for idempotency
    const eventId = crypto.randomUUID();
    await db.insert(subscriptionEvents).values({
      id: eventId,
      pagarmeEventId: payload.id,
      eventType: payload.type,
      payload: payload.data,
    });

    try {
      // Process by event type
      switch (payload.type) {
        case "charge.paid":
          await WebhookService.handleChargePaid(payload);
          break;
        case "charge.payment_failed":
          await WebhookService.handleChargeFailed(payload);
          break;
        case "subscription.canceled":
          await WebhookService.handleSubscriptionCanceled(payload);
          break;
        case "order.paid":
          await WebhookService.handleOrderPaid(payload);
          break;
        case "subscription.created":
          await WebhookService.handleSubscriptionCreated(payload);
          break;
        default:
          console.log(`Unhandled webhook event type: ${payload.type}`);
      }

      // Mark as processed
      await db
        .update(subscriptionEvents)
        .set({ processedAt: new Date() })
        .where(eq(subscriptionEvents.id, eventId));
    } catch (error) {
      // Record error
      await db
        .update(subscriptionEvents)
        .set({
          error: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(subscriptionEvents.id, eventId));

      throw error;
    }
  }

  /**
   * Validate webhook signature using HMAC.
   */
  private static validateSignature(
    payload: WebhookPayload,
    signature: string | null
  ) {
    if (!signature) {
      throw new WebhookValidationError();
    }

    const expectedSignature = createHmac("sha256", env.PAGARME_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest("hex");

    // Pagarme may send signature with or without prefix
    const providedSignature = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    if (providedSignature !== expectedSignature) {
      throw new WebhookValidationError();
    }
  }

  /**
   * Handle charge.paid event - activate subscription.
   */
  private static async handleChargePaid(payload: WebhookPayload) {
    const data = payload.data as {
      subscription?: { id: string };
      current_period?: { start_at: string; end_at: string };
      invoice?: { id: string };
      metadata?: Record<string, string>;
    };

    const subscriptionId = data.subscription?.id;
    const organizationId = data.metadata?.organization_id;

    if (!organizationId) {
      console.log("charge.paid: No organization_id in metadata");
      return;
    }

    // Update subscription to active
    await db
      .update(orgSubscriptions)
      .set({
        status: "active",
        pagarmeSubscriptionId: subscriptionId,
        currentPeriodStart: data.current_period?.start_at
          ? new Date(data.current_period.start_at)
          : new Date(),
        currentPeriodEnd: data.current_period?.end_at
          ? new Date(data.current_period.end_at)
          : null,
      })
      .where(eq(orgSubscriptions.organizationId, organizationId));

    // Emit hook event
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    if (subscription) {
      PaymentHooks.emit("charge.paid", {
        subscriptionId: subscription.id,
        invoiceId: data.invoice?.id ?? "",
      });
    }
  }

  /**
   * Handle charge.payment_failed event - mark as past_due.
   */
  private static async handleChargeFailed(payload: WebhookPayload) {
    const data = payload.data as {
      subscription?: { id: string };
      invoice?: { id: string };
      last_transaction?: {
        gateway_response?: { message: string };
      };
      metadata?: Record<string, string>;
    };

    const organizationId = data.metadata?.organization_id;

    if (!organizationId) {
      console.log("charge.payment_failed: No organization_id in metadata");
      return;
    }

    // Update subscription to past_due
    await db
      .update(orgSubscriptions)
      .set({ status: "past_due" })
      .where(eq(orgSubscriptions.organizationId, organizationId));

    // Emit hook event
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    if (subscription) {
      PaymentHooks.emit("charge.failed", {
        subscriptionId: subscription.id,
        invoiceId: data.invoice?.id ?? "",
        error:
          data.last_transaction?.gateway_response?.message ?? "Payment failed",
      });
    }
  }

  /**
   * Handle subscription.canceled event.
   */
  private static async handleSubscriptionCanceled(payload: WebhookPayload) {
    const data = payload.data as {
      id: string;
      metadata?: Record<string, string>;
    };

    const organizationId = data.metadata?.organization_id;

    if (!organizationId) {
      // Try to find by Pagarme subscription ID
      const subscription = await db.query.orgSubscriptions.findFirst({
        where: eq(orgSubscriptions.pagarmeSubscriptionId, data.id),
      });

      if (subscription) {
        await db
          .update(orgSubscriptions)
          .set({
            status: "canceled",
            canceledAt: new Date(),
          })
          .where(eq(orgSubscriptions.id, subscription.id));

        PaymentHooks.emit("subscription.canceled", { subscription });
      }
      return;
    }

    await db
      .update(orgSubscriptions)
      .set({
        status: "canceled",
        canceledAt: new Date(),
      })
      .where(eq(orgSubscriptions.organizationId, organizationId));

    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    if (subscription) {
      PaymentHooks.emit("subscription.canceled", { subscription });
    }
  }

  /**
   * Handle order.paid event (for checkout flow).
   */
  private static async handleOrderPaid(payload: WebhookPayload) {
    const data = payload.data as {
      id: string;
      metadata?: Record<string, string>;
    };

    const organizationId = data.metadata?.organization_id;
    const planId = data.metadata?.plan_id;

    if (!organizationId) {
      console.log("order.paid: No organization_id in metadata");
      return;
    }

    // Update subscription to active
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1); // Default to 1 month

    await db
      .update(orgSubscriptions)
      .set({
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        planId: planId ?? undefined,
      })
      .where(eq(orgSubscriptions.organizationId, organizationId));

    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    if (subscription) {
      PaymentHooks.emit("subscription.activated", { subscription });
    }
  }

  /**
   * Handle subscription.created webhook.
   * Updates subscription status to active and syncs customer data.
   *
   * Note: Pagarme Payment Links with type="subscription" don't propagate
   * payment link metadata to the subscription. Instead, the subscription
   * has the plan's metadata (local_plan_id). We use pending_checkouts
   * to lookup the organization.
   */
  private static async handleSubscriptionCreated(payload: WebhookPayload) {
    const data = payload.data as {
      id: string;
      code?: string; // Payment link ID for checkout lookup
      status?: string;
      start_at?: string;
      current_period?: { start_at: string; end_at: string };
      plan?: {
        id: string;
        metadata?: Record<string, string>;
      };
      customer?: {
        id: string;
        name: string;
        email: string;
        document: string;
        document_type: "CPF" | "CNPJ";
        type: "individual" | "company";
        phones?: {
          mobile_phone?: {
            country_code: string;
            area_code: string;
            number: string;
          };
        };
      };
      card?: {
        id: string;
        last_four_digits: string;
        brand: string;
        exp_month: number;
        exp_year: number;
      };
      metadata?: Record<string, string>;
    };

    // Try multiple sources for organization_id:
    // 1. data.metadata.organization_id (direct, for tests)
    // 2. data.plan.metadata.local_plan_id -> lookup pending_checkouts
    let organizationId = data.metadata?.organization_id;
    let planId = data.metadata?.plan_id;

    if (!organizationId) {
      // Lookup from pending_checkouts using payment link code (unique identifier)
      const paymentLinkCode = data.code;

      if (paymentLinkCode) {
        const { pendingCheckouts } = await import("@/db/schema");

        // Find pending checkout by payment link ID (unique and precise)
        const [checkout] = await db
          .select({
            organizationId: pendingCheckouts.organizationId,
            planId: pendingCheckouts.planId,
            id: pendingCheckouts.id,
          })
          .from(pendingCheckouts)
          .where(
            and(
              eq(pendingCheckouts.paymentLinkId, paymentLinkCode),
              eq(pendingCheckouts.status, "pending")
            )
          )
          .limit(1);

        if (checkout) {
          organizationId = checkout.organizationId;
          planId = checkout.planId;

          // Mark checkout as completed
          await db
            .update(pendingCheckouts)
            .set({
              status: "completed",
              completedAt: new Date(),
            })
            .where(eq(pendingCheckouts.id, checkout.id));

          console.log(
            `subscription.created: Found org ${organizationId} via pending checkout for payment link ${paymentLinkCode}`
          );
        } else {
          console.log(
            `subscription.created: No pending checkout found for payment link ${paymentLinkCode}`
          );
        }
      }
    }

    if (!organizationId) {
      console.log("subscription.created: Could not determine organization_id");
      return;
    }

    // Calculate period dates
    const getPeriodStart = () => {
      if (data.start_at) {
        return new Date(data.start_at);
      }
      if (data.current_period?.start_at) {
        return new Date(data.current_period.start_at);
      }
      return new Date();
    };
    const periodStart = getPeriodStart();

    const periodEnd = data.current_period?.end_at
      ? new Date(data.current_period.end_at)
      : (() => {
          const end = new Date(periodStart);
          end.setMonth(end.getMonth() + 1);
          return end;
        })();

    // 1. Update subscription status to active
    await db
      .update(orgSubscriptions)
      .set({
        status: "active",
        planId: planId ?? undefined, // Update plan if upgrading
        pagarmeSubscriptionId: data.id,
        pagarmeCustomerId: data.customer?.id,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialUsed: true,
      })
      .where(eq(orgSubscriptions.organizationId, organizationId));

    // 2. Sync customer data to organization_profiles (only empty fields)
    if (data.customer) {
      await WebhookService.syncCustomerData(organizationId, data.customer);
    }

    // 3. Emit hook event
    const [subscription] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (subscription) {
      PaymentHooks.emit("subscription.activated", { subscription });
    }

    // 4. Send upgrade confirmation email to owner
    await WebhookService.sendUpgradeEmail(
      organizationId,
      subscription?.planId ?? planId,
      periodEnd,
      data.card?.last_four_digits
    );

    console.log(
      `subscription.created: Activated subscription for org ${organizationId}, plan ${planId}`
    );
  }

  /**
   * Send upgrade confirmation email to organization owner.
   */
  private static async sendUpgradeEmail(
    organizationId: string,
    planId: string | undefined,
    periodEnd: Date,
    cardLast4?: string
  ) {
    try {
      const { members, organizations, subscriptionPlans, users } = await import(
        "@/db/schema"
      );
      const { sendUpgradeConfirmationEmail } = await import("@/lib/email");

      // Get owner email
      const [owner] = await db
        .select({ email: users.email })
        .from(members)
        .innerJoin(users, eq(members.userId, users.id))
        .where(
          and(
            eq(members.organizationId, organizationId),
            eq(members.role, "owner")
          )
        )
        .limit(1);

      if (!owner?.email) {
        console.log(
          `sendUpgradeEmail: No owner found for org ${organizationId}`
        );
        return;
      }

      // Get organization name
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      // Get plan details
      if (!planId) {
        console.log(`sendUpgradeEmail: No planId for org ${organizationId}`);
        return;
      }

      const [plan] = await db
        .select({
          displayName: subscriptionPlans.displayName,
          priceMonthly: subscriptionPlans.priceMonthly,
        })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1);

      if (!plan) {
        console.log(`sendUpgradeEmail: Plan not found ${planId}`);
        return;
      }

      await sendUpgradeConfirmationEmail({
        to: owner.email,
        organizationName: org?.name ?? "Sua organização",
        planName: plan.displayName,
        planPrice: plan.priceMonthly,
        nextBillingDate: periodEnd,
        cardLast4,
      });

      console.log(
        `sendUpgradeEmail: Sent confirmation to ${owner.email} for org ${organizationId}`
      );
    } catch (error) {
      // Log but don't fail the webhook
      console.error("Failed to send upgrade confirmation email:", error);
    }
  }

  /**
   * Sync customer data from Pagarme to organization_profiles.
   * Only updates empty fields to preserve user-provided data.
   */
  private static async syncCustomerData(
    organizationId: string,
    customer: {
      id: string;
      name: string;
      document: string;
      phones?: {
        mobile_phone?: {
          country_code: string;
          area_code: string;
          number: string;
        };
      };
    }
  ) {
    const { organizationProfiles } = await import("@/db/schema");

    const [profile] = await db
      .select({
        legalName: organizationProfiles.legalName,
        taxId: organizationProfiles.taxId,
        mobile: organizationProfiles.mobile,
      })
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, organizationId))
      .limit(1);

    if (!profile) {
      console.log(
        `syncCustomerData: No profile found for org ${organizationId}`
      );
      return;
    }

    // Build phone number string from Pagarme format
    const mobilePhone = customer.phones?.mobile_phone;
    const phoneNumber = mobilePhone
      ? `+${mobilePhone.country_code}${mobilePhone.area_code}${mobilePhone.number}`
      : null;

    // Only update empty fields - preserve user-provided data
    const updates: Record<string, string | null> = {
      pagarmeCustomerId: customer.id,
    };

    if (!profile.legalName && customer.name) {
      updates.legalName = customer.name;
    }

    if (!profile.taxId && customer.document) {
      updates.taxId = customer.document;
    }

    if (!profile.mobile && phoneNumber) {
      updates.mobile = phoneNumber;
    }

    await db
      .update(organizationProfiles)
      .set(updates)
      .where(eq(organizationProfiles.organizationId, organizationId));

    console.log(
      `syncCustomerData: Updated profile for org ${organizationId}`,
      Object.keys(updates)
    );
  }
}
