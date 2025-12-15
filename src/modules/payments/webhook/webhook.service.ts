import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { WebhookValidationError } from "../errors";
import { PaymentHooks } from "../hooks";
import type { ProcessWebhook } from "./webhook.model";

export abstract class WebhookService {
  static async process(
    payload: ProcessWebhook,
    authHeader: string | null,
    _rawBody: string
  ) {
    WebhookService.validateBasicAuth(authHeader);

    const [existingEvent] = await db
      .select()
      .from(schema.subscriptionEvents)
      .where(eq(schema.subscriptionEvents.pagarmeEventId, payload.id))
      .limit(1);

    if (existingEvent?.processedAt) {
      return;
    }

    const eventId = `event-${crypto.randomUUID()}`;
    await db.insert(schema.subscriptionEvents).values({
      id: eventId,
      pagarmeEventId: payload.id,
      eventType: payload.type,
      payload: payload.data,
    });

    try {
      switch (payload.type) {
        case "charge.paid":
          await WebhookService.handleChargePaid(payload);
          break;
        case "charge.payment_failed":
        case "invoice.payment_failed":
          await WebhookService.handleChargeFailed(payload);
          break;
        case "subscription.canceled":
          await WebhookService.handleSubscriptionCanceled(payload);
          break;
        case "subscription.created":
          await WebhookService.handleSubscriptionCreated(payload);
          break;
        case "charge.refunded":
          await WebhookService.handleChargeRefunded(payload);
          break;
        case "subscription.updated":
          await WebhookService.handleSubscriptionUpdated(payload);
          break;
        default:
          break;
      }

      await db
        .update(schema.subscriptionEvents)
        .set({ processedAt: new Date() })
        .where(eq(schema.subscriptionEvents.id, eventId));
    } catch (error) {
      await db
        .update(schema.subscriptionEvents)
        .set({
          error: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(schema.subscriptionEvents.id, eventId));

      throw error;
    }
  }

  private static validateBasicAuth(authHeader: string | null) {
    if (!authHeader?.startsWith("Basic ")) {
      throw new WebhookValidationError();
    }

    const base64 = authHeader.slice(6);
    let decoded: string;
    try {
      decoded = Buffer.from(base64, "base64").toString("utf-8");
    } catch {
      throw new WebhookValidationError();
    }

    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      throw new WebhookValidationError();
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    const validUser = WebhookService.timingSafeCompare(
      username,
      env.PAGARME_WEBHOOK_USERNAME
    );
    const validPass = WebhookService.timingSafeCompare(
      password,
      env.PAGARME_WEBHOOK_PASSWORD
    );

    if (!(validUser && validPass)) {
      throw new WebhookValidationError();
    }
  }

  private static timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufA, Buffer.alloc(bufA.length));
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  }

  private static async handleChargePaid(payload: ProcessWebhook) {
    const data = payload.data as {
      subscription?: { id: string };
      current_period?: { start_at: string; end_at: string };
      invoice?: { id: string };
      metadata?: Record<string, string>;
    };

    const subscriptionId = data.subscription?.id;
    const organizationId = data.metadata?.organization_id;

    if (!organizationId) {
      return;
    }

    await db
      .update(schema.orgSubscriptions)
      .set({
        status: "active",
        pagarmeSubscriptionId: subscriptionId,
        currentPeriodStart: data.current_period?.start_at
          ? new Date(data.current_period.start_at)
          : new Date(),
        currentPeriodEnd: data.current_period?.end_at
          ? new Date(data.current_period.end_at)
          : null,
        // Clear grace period fields when payment succeeds
        pastDueSince: null,
        gracePeriodEnds: null,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (subscription) {
      PaymentHooks.emit("charge.paid", {
        subscriptionId: subscription.id,
        invoiceId: data.invoice?.id ?? "",
      });
    }
  }

  private static async handleChargeFailed(payload: ProcessWebhook) {
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
      return;
    }

    const { SubscriptionService } = await import(
      "../subscription/subscription.service"
    );
    await SubscriptionService.markPastDue(organizationId);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (subscription) {
      PaymentHooks.emit("charge.failed", {
        subscriptionId: subscription.id,
        invoiceId: data.invoice?.id ?? "",
        error:
          data.last_transaction?.gateway_response?.message ?? "Payment failed",
      });
    }
  }

  private static async handleChargeRefunded(payload: ProcessWebhook) {
    const data = payload.data as {
      id: string;
      amount?: number;
      subscription?: { id: string };
      metadata?: Record<string, string>;
      last_transaction?: {
        gateway_response?: { message: string };
      };
    };

    const organizationId = data.metadata?.organization_id;
    const pagarmeSubscriptionId = data.subscription?.id;

    // Try to find organization by metadata or by pagarmeSubscriptionId
    type Subscription = typeof schema.orgSubscriptions.$inferSelect;
    let subscription: Subscription | undefined;

    if (organizationId) {
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);
    } else if (pagarmeSubscriptionId) {
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(
          eq(
            schema.orgSubscriptions.pagarmeSubscriptionId,
            pagarmeSubscriptionId
          )
        )
        .limit(1);
    }

    if (!subscription) {
      return;
    }

    // Mark subscription as canceled due to refund
    await db
      .update(schema.orgSubscriptions)
      .set({
        status: "canceled",
        canceledAt: new Date(),
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    PaymentHooks.emit("charge.refunded", {
      subscriptionId: subscription.id,
      chargeId: data.id,
      amount: data.amount ?? 0,
      reason: data.last_transaction?.gateway_response?.message,
    });

    // Also emit subscription.canceled since access is being revoked
    PaymentHooks.emit("subscription.canceled", { subscription });
  }

  private static async handleSubscriptionUpdated(payload: ProcessWebhook) {
    const data = payload.data as {
      id: string;
      status?: string;
      card?: {
        id: string;
        last_four_digits: string;
        brand: string;
        exp_month: number;
        exp_year: number;
      };
      current_period?: { start_at: string; end_at: string };
      next_billing_at?: string;
      metadata?: Record<string, string>;
    };

    const organizationId = data.metadata?.organization_id;
    const pagarmeSubscriptionId = data.id;

    // Find subscription by metadata or by pagarmeSubscriptionId
    type Subscription = typeof schema.orgSubscriptions.$inferSelect;
    let subscription: Subscription | undefined;

    if (organizationId) {
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);
    } else {
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(
          eq(
            schema.orgSubscriptions.pagarmeSubscriptionId,
            pagarmeSubscriptionId
          )
        )
        .limit(1);
    }

    if (!subscription) {
      return;
    }

    const changes: {
      cardUpdated?: boolean;
      statusChanged?: boolean;
      previousStatus?: string;
    } = {};

    // Track status change
    const previousStatus = subscription.status;
    let newStatus = subscription.status;

    if (data.status) {
      const statusMap: Record<string, string> = {
        active: "active",
        canceled: "canceled",
        pending: "past_due",
        failed: "past_due",
        unpaid: "past_due",
      };

      const mappedStatus = statusMap[data.status];
      if (mappedStatus && mappedStatus !== subscription.status) {
        newStatus = mappedStatus as typeof subscription.status;
        changes.statusChanged = true;
        changes.previousStatus = previousStatus;
      }
    }

    // Track card update
    if (data.card?.id) {
      changes.cardUpdated = true;
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (changes.statusChanged) {
      updateData.status = newStatus;
      if (newStatus === "canceled") {
        updateData.canceledAt = new Date();
      }
    }

    if (data.current_period?.start_at) {
      updateData.currentPeriodStart = new Date(data.current_period.start_at);
    }

    if (data.current_period?.end_at) {
      updateData.currentPeriodEnd = new Date(data.current_period.end_at);
    }

    // Only update if there are changes
    if (Object.keys(updateData).length > 0) {
      await db
        .update(schema.orgSubscriptions)
        .set(updateData)
        .where(eq(schema.orgSubscriptions.id, subscription.id));
    }

    // Fetch updated subscription for event
    const [updatedSubscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscription.id))
      .limit(1);

    if (updatedSubscription) {
      PaymentHooks.emit("subscription.updated", {
        subscription: updatedSubscription,
        changes,
      });
    }
  }

  private static async handleSubscriptionCanceled(payload: ProcessWebhook) {
    const data = payload.data as {
      id: string;
      metadata?: Record<string, string>;
    };

    const organizationId = data.metadata?.organization_id;

    if (!organizationId) {
      const [existingSubscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.pagarmeSubscriptionId, data.id))
        .limit(1);

      if (existingSubscription) {
        const canceledAt = new Date();
        await db
          .update(schema.orgSubscriptions)
          .set({
            status: "canceled",
            canceledAt,
          })
          .where(eq(schema.orgSubscriptions.id, existingSubscription.id));

        PaymentHooks.emit("subscription.canceled", {
          subscription: existingSubscription,
        });

        await WebhookService.sendCancellationEmail(
          existingSubscription.organizationId,
          existingSubscription.planId,
          canceledAt,
          existingSubscription.currentPeriodEnd
        );
      }
      return;
    }

    const canceledAt = new Date();
    await db
      .update(schema.orgSubscriptions)
      .set({
        status: "canceled",
        canceledAt,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (subscription) {
      PaymentHooks.emit("subscription.canceled", { subscription });

      await WebhookService.sendCancellationEmail(
        organizationId,
        subscription.planId,
        canceledAt,
        subscription.currentPeriodEnd
      );
    }
  }

  private static async handleSubscriptionCreated(payload: ProcessWebhook) {
    const data = payload.data as {
      id: string;
      code?: string;
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

    let organizationId = data.metadata?.organization_id;
    let planId = data.metadata?.plan_id;
    let billingCycle = data.metadata?.billing_cycle ?? "monthly";

    if (!organizationId) {
      const paymentLinkCode = data.code;

      if (paymentLinkCode) {
        const [checkout] = await db
          .select({
            organizationId: schema.pendingCheckouts.organizationId,
            planId: schema.pendingCheckouts.planId,
            billingCycle: schema.pendingCheckouts.billingCycle,
            id: schema.pendingCheckouts.id,
          })
          .from(schema.pendingCheckouts)
          .where(
            and(
              eq(schema.pendingCheckouts.paymentLinkId, paymentLinkCode),
              eq(schema.pendingCheckouts.status, "pending")
            )
          )
          .limit(1);

        if (checkout) {
          organizationId = checkout.organizationId;
          planId = checkout.planId;
          billingCycle = checkout.billingCycle ?? "monthly";

          await db
            .update(schema.pendingCheckouts)
            .set({
              status: "completed",
              completedAt: new Date(),
            })
            .where(eq(schema.pendingCheckouts.id, checkout.id));
        }
      }
    }

    if (!organizationId) {
      return;
    }

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

    await db
      .update(schema.orgSubscriptions)
      .set({
        status: "active",
        planId: planId ?? undefined,
        pagarmeSubscriptionId: data.id,
        pagarmeCustomerId: data.customer?.id,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        billingCycle,
        trialUsed: true,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    if (data.customer) {
      await WebhookService.syncCustomerData(organizationId, data.customer);
    }

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (subscription) {
      PaymentHooks.emit("subscription.activated", { subscription });
    }

    await WebhookService.sendUpgradeEmail(
      organizationId,
      subscription?.planId ?? planId,
      periodEnd,
      data.card?.last_four_digits
    );
  }

  private static async sendUpgradeEmail(
    organizationId: string,
    planId: string | undefined,
    periodEnd: Date,
    cardLast4?: string
  ) {
    try {
      const { sendUpgradeConfirmationEmail } = await import("@/lib/email");

      const [owner] = await db
        .select({ email: schema.users.email })
        .from(schema.members)
        .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
        .where(
          and(
            eq(schema.members.organizationId, organizationId),
            eq(schema.members.role, "owner")
          )
        )
        .limit(1);

      if (!owner?.email) {
        return;
      }

      const [org] = await db
        .select({ name: schema.organizations.name })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, organizationId))
        .limit(1);

      if (!planId) {
        return;
      }

      const [plan] = await db
        .select({
          displayName: schema.subscriptionPlans.displayName,
          priceMonthly: schema.subscriptionPlans.priceMonthly,
        })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, planId))
        .limit(1);

      if (!plan) {
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
    } catch (_) {
      // Email failure should not fail the webhook
    }
  }

  private static async sendCancellationEmail(
    organizationId: string,
    planId: string,
    canceledAt: Date,
    accessUntil: Date | null
  ) {
    try {
      const { sendSubscriptionCanceledEmail } = await import("@/lib/email");

      const [owner] = await db
        .select({ email: schema.users.email })
        .from(schema.members)
        .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
        .where(
          and(
            eq(schema.members.organizationId, organizationId),
            eq(schema.members.role, "owner")
          )
        )
        .limit(1);

      if (!owner?.email) {
        return;
      }

      const [org] = await db
        .select({ name: schema.organizations.name })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, organizationId))
        .limit(1);

      const [plan] = await db
        .select({ displayName: schema.subscriptionPlans.displayName })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, planId))
        .limit(1);

      if (!plan) {
        return;
      }

      await sendSubscriptionCanceledEmail({
        to: owner.email,
        organizationName: org?.name ?? "Sua organização",
        planName: plan.displayName,
        canceledAt,
        accessUntil,
      });
    } catch (_) {
      // Email failure should not fail the webhook
    }
  }

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
    const [profile] = await db
      .select({
        legalName: schema.organizationProfiles.legalName,
        taxId: schema.organizationProfiles.taxId,
        mobile: schema.organizationProfiles.mobile,
      })
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    if (!profile) {
      return;
    }

    const mobilePhone = customer.phones?.mobile_phone;
    const phoneNumber = mobilePhone
      ? `+${mobilePhone.country_code}${mobilePhone.area_code}${mobilePhone.number}`
      : null;

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
      .update(schema.organizationProfiles)
      .set(updates)
      .where(eq(schema.organizationProfiles.organizationId, organizationId));
  }
}
