import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { WebhookValidationError } from "@/modules/payments/errors";
import { PaymentHooks } from "@/modules/payments/hooks";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type { ProcessWebhook } from "./webhook.model";

type SubscriptionCreatedData = {
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

type CheckoutInfo = {
  organizationId: string;
  planId?: string;
  billingCycle: string;
  pricingTierId?: string;
  priceAtPurchase?: number;
  isCustomPrice?: boolean;
};

type SubscriptionUpdatedData = {
  id: string;
  status?: string;
  updated_at?: string;
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

export abstract class WebhookService {
  static async process(payload: ProcessWebhook, authHeader: string | null) {
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

    const organizationId = data.metadata?.organization_id;

    if (!organizationId) {
      return;
    }

    const result = await SubscriptionService.markActive({
      organizationId,
      pagarmeSubscriptionId: data.subscription?.id,
      periodStart: data.current_period?.start_at
        ? new Date(data.current_period.start_at)
        : new Date(),
      periodEnd: data.current_period?.end_at
        ? new Date(data.current_period.end_at)
        : null,
    });

    if (result?.subscription) {
      PaymentHooks.emit("charge.paid", {
        subscriptionId: result.subscription.id,
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

    await SubscriptionService.markPastDue(organizationId);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    const errorMessage =
      data.last_transaction?.gateway_response?.message ?? "Payment failed";

    if (subscription) {
      PaymentHooks.emit("charge.failed", {
        subscriptionId: subscription.id,
        invoiceId: data.invoice?.id ?? "",
        error: errorMessage,
      });
      // Email is sent via PaymentHooks listener (charge.failed)
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

    // Delegate to SubscriptionService - it handles finding by org or pagarme ID,
    // updating status, and emitting both charge.refunded and subscription.canceled events
    await SubscriptionService.cancelByRefund({
      organizationId: data.metadata?.organization_id,
      pagarmeSubscriptionId: data.subscription?.id,
      chargeId: data.id,
      amount: data.amount ?? 0,
      reason: data.last_transaction?.gateway_response?.message,
    });
  }

  /**
   * Handles subscription.updated webhook from Pagarme.
   * Uses timestamp validation to prevent out-of-order updates (idempotency).
   */
  private static async handleSubscriptionUpdated(payload: ProcessWebhook) {
    const data = payload.data as SubscriptionUpdatedData;
    const organizationId = data.metadata?.organization_id;
    const eventUpdatedAt = data.updated_at ? new Date(data.updated_at) : null;

    const result = await db.transaction(async (tx) => {
      const subscription = await WebhookService.findSubscriptionForUpdate(
        tx,
        organizationId,
        data.id
      );

      if (!subscription) {
        return null;
      }

      if (WebhookService.isOutdatedEvent(eventUpdatedAt, subscription)) {
        return null;
      }

      const { changes, newStatus } = WebhookService.calculateStatusChange(
        data,
        subscription
      );

      if (data.card?.id) {
        changes.cardUpdated = true;
      }

      const updateData = WebhookService.buildSubscriptionUpdate(
        data,
        changes,
        newStatus,
        eventUpdatedAt
      );

      if (Object.keys(updateData).length === 0) {
        return { subscription, changes };
      }

      const [updated] = await tx
        .update(schema.orgSubscriptions)
        .set(updateData)
        .where(eq(schema.orgSubscriptions.id, subscription.id))
        .returning();

      return { subscription: updated, changes };
    });

    if (result?.subscription) {
      PaymentHooks.emit("subscription.updated", {
        subscription: result.subscription,
        changes: result.changes,
      });
    }
  }

  private static async findSubscriptionForUpdate(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    organizationId: string | undefined,
    pagarmeSubscriptionId: string
  ) {
    type Subscription = typeof schema.orgSubscriptions.$inferSelect;

    const whereClause = organizationId
      ? eq(schema.orgSubscriptions.organizationId, organizationId)
      : eq(
          schema.orgSubscriptions.pagarmeSubscriptionId,
          pagarmeSubscriptionId
        );

    const [subscription] = await tx
      .select()
      .from(schema.orgSubscriptions)
      .where(whereClause);

    return subscription as Subscription | undefined;
  }

  private static isOutdatedEvent(
    eventUpdatedAt: Date | null,
    subscription: { pagarmeUpdatedAt: Date | null }
  ): boolean {
    if (!(eventUpdatedAt && subscription.pagarmeUpdatedAt)) {
      return false;
    }
    return eventUpdatedAt <= subscription.pagarmeUpdatedAt;
  }

  private static calculateStatusChange(
    data: SubscriptionUpdatedData,
    subscription: { status: string }
  ) {
    const changes: {
      cardUpdated?: boolean;
      statusChanged?: boolean;
      previousStatus?: string;
    } = {};

    const statusMap: Record<string, string> = {
      active: "active",
      canceled: "canceled",
      pending: "past_due",
      failed: "past_due",
      unpaid: "past_due",
    };

    let newStatus = subscription.status;

    if (data.status) {
      const mappedStatus = statusMap[data.status];
      if (mappedStatus && mappedStatus !== subscription.status) {
        newStatus = mappedStatus;
        changes.statusChanged = true;
        changes.previousStatus = subscription.status;
      }
    }

    return { changes, newStatus };
  }

  private static buildSubscriptionUpdate(
    data: SubscriptionUpdatedData,
    changes: { statusChanged?: boolean },
    newStatus: string,
    eventUpdatedAt: Date | null
  ): Record<string, unknown> {
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

    if (eventUpdatedAt) {
      updateData.pagarmeUpdatedAt = eventUpdatedAt;
    }

    return updateData;
  }

  private static async handleSubscriptionCanceled(payload: ProcessWebhook) {
    const data = payload.data as {
      id: string;
      metadata?: Record<string, string>;
    };

    const organizationId = data.metadata?.organization_id;

    if (!organizationId) {
      // Try to find subscription by Pagarme ID when metadata is missing
      await SubscriptionService.cancelByPagarmeId(data.id);
      return;
    }

    await SubscriptionService.cancelByWebhook(organizationId);
    // Email is sent via PaymentHooks listener (subscription.canceled)
  }

  private static async handleSubscriptionCreated(payload: ProcessWebhook) {
    const data = payload.data as SubscriptionCreatedData;
    const checkoutInfo = await WebhookService.resolveCheckoutInfo(data);

    if (!checkoutInfo) {
      return;
    }

    const { organizationId, planId, billingCycle, pricingTierId } =
      checkoutInfo;
    const { periodStart, periodEnd } =
      WebhookService.calculatePeriodDates(data);

    await SubscriptionService.activate({
      organizationId,
      planId,
      pricingTierId,
      billingCycle,
      pagarmeSubscriptionId: data.id,
      periodStart,
      periodEnd,
      priceAtPurchase: checkoutInfo.priceAtPurchase,
      isCustomPrice: checkoutInfo.isCustomPrice,
    });
  }

  private static async resolveCheckoutInfo(
    data: SubscriptionCreatedData
  ): Promise<CheckoutInfo | null> {
    const metadataInfo = WebhookService.extractMetadataInfo(data);

    let checkoutInfo: CheckoutInfo | null = null;

    if (metadataInfo.organizationId) {
      checkoutInfo = metadataInfo as CheckoutInfo;
    } else {
      checkoutInfo = await WebhookService.findCheckoutByPaymentLink(
        data.code,
        data.id
      );

      if (!checkoutInfo) {
        logger.warn({
          type: "webhook:subscription-created:checkout-not-found",
          subscriptionId: data.id,
          subscriptionCode: data.code,
          hasMetadata: !!data.metadata,
          metadataKeys: data.metadata ? Object.keys(data.metadata) : [],
          customerEmail: data.customer?.email,
        });
        return null;
      }
    }

    // Resolve price from tier catalog for non-custom checkouts
    if (
      checkoutInfo.priceAtPurchase === undefined &&
      checkoutInfo.pricingTierId
    ) {
      const [tier] = await db
        .select({
          priceMonthly: schema.planPricingTiers.priceMonthly,
          priceYearly: schema.planPricingTiers.priceYearly,
        })
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.id, checkoutInfo.pricingTierId));

      if (tier) {
        const cycle = checkoutInfo.billingCycle ?? "monthly";
        checkoutInfo.priceAtPurchase =
          cycle === "yearly" ? tier.priceYearly : tier.priceMonthly;
        checkoutInfo.isCustomPrice = false;
      }
    }

    return checkoutInfo;
  }

  private static extractMetadataInfo(
    data: SubscriptionCreatedData
  ): Partial<CheckoutInfo> {
    const isCustomPrice = data.metadata?.is_custom_price === "true";
    let priceAtPurchase: number | undefined;

    if (isCustomPrice && data.metadata) {
      const billingCycle = data.metadata.billing_cycle ?? "monthly";
      priceAtPurchase =
        billingCycle === "yearly"
          ? Number(data.metadata.custom_price_yearly)
          : Number(data.metadata.custom_price_monthly);
    }

    return {
      organizationId: data.metadata?.organization_id,
      planId: data.metadata?.plan_id,
      billingCycle: data.metadata?.billing_cycle ?? "monthly",
      pricingTierId: data.metadata?.pricing_tier_id,
      priceAtPurchase,
      isCustomPrice: isCustomPrice || undefined,
    };
  }

  private static async findCheckoutByPaymentLink(
    paymentLinkCode: string | undefined,
    subscriptionId: string
  ): Promise<CheckoutInfo | null> {
    if (!paymentLinkCode) {
      logger.info({
        type: "webhook:checkout-lookup:no-code",
        subscriptionId,
      });
      return null;
    }

    // Primary search: exact match by payment link code
    const [checkout] = await db
      .select({
        organizationId: schema.pendingCheckouts.organizationId,
        planId: schema.pendingCheckouts.planId,
        billingCycle: schema.pendingCheckouts.billingCycle,
        pricingTierId: schema.pendingCheckouts.pricingTierId,
        id: schema.pendingCheckouts.id,
        paymentLinkId: schema.pendingCheckouts.paymentLinkId,
        customPriceMonthly: schema.pendingCheckouts.customPriceMonthly,
        customPriceYearly: schema.pendingCheckouts.customPriceYearly,
      })
      .from(schema.pendingCheckouts)
      .where(
        and(
          eq(schema.pendingCheckouts.paymentLinkId, paymentLinkCode),
          eq(schema.pendingCheckouts.status, "pending")
        )
      )
      .limit(1);

    if (!checkout) {
      // Log details to help debug mismatches
      const pendingCheckouts = await db
        .select({
          id: schema.pendingCheckouts.id,
          paymentLinkId: schema.pendingCheckouts.paymentLinkId,
          status: schema.pendingCheckouts.status,
          createdAt: schema.pendingCheckouts.createdAt,
        })
        .from(schema.pendingCheckouts)
        .where(eq(schema.pendingCheckouts.status, "pending"))
        .limit(5);

      logger.warn({
        type: "webhook:checkout-lookup:not-found",
        subscriptionId,
        searchedCode: paymentLinkCode,
        pendingCheckoutsCount: pendingCheckouts.length,
        pendingCheckoutIds: pendingCheckouts.map((c) => ({
          id: c.id,
          paymentLinkId: c.paymentLinkId,
        })),
      });

      return null;
    }

    logger.info({
      type: "webhook:checkout-lookup:found",
      subscriptionId,
      checkoutId: checkout.id,
      paymentLinkId: checkout.paymentLinkId,
    });

    await db
      .update(schema.pendingCheckouts)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(schema.pendingCheckouts.id, checkout.id));

    const isCustomPrice = checkout.customPriceMonthly !== null;
    let priceAtPurchase: number | undefined;

    if (isCustomPrice) {
      const cycle = checkout.billingCycle ?? "monthly";
      priceAtPurchase =
        cycle === "yearly"
          ? (checkout.customPriceYearly ?? undefined)
          : (checkout.customPriceMonthly ?? undefined);
    }

    return {
      organizationId: checkout.organizationId,
      planId: checkout.planId,
      billingCycle: checkout.billingCycle ?? "monthly",
      pricingTierId: checkout.pricingTierId ?? undefined,
      priceAtPurchase,
      isCustomPrice: isCustomPrice || undefined,
    };
  }

  private static calculatePeriodDates(data: SubscriptionCreatedData): {
    periodStart: Date;
    periodEnd: Date;
  } {
    let periodStart: Date;

    if (data.start_at) {
      periodStart = new Date(data.start_at);
    } else if (data.current_period?.start_at) {
      periodStart = new Date(data.current_period.start_at);
    } else {
      periodStart = new Date();
    }

    let periodEnd: Date;

    if (data.current_period?.end_at) {
      periodEnd = new Date(data.current_period.end_at);
    } else {
      periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    return { periodStart, periodEnd };
  }
}
