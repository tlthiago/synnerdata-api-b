import type { PagarmeWebhookPayload } from "@/modules/payments/pagarme/pagarme.types";

type CustomerData = {
  id?: string;
  name?: string;
  email?: string;
  document?: string;
  phone?: string;
};

type PeriodData = {
  startAt?: Date;
  endAt?: Date;
};

type CardData = {
  id?: string;
  lastFourDigits?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
};

/**
 * Builder for creating Pagarme webhook payloads using fluent API.
 *
 * @example
 * // Create a charge.paid webhook payload
 * const payload = new WebhookPayloadBuilder()
 *   .chargePaid()
 *   .withSubscriptionId("sub_123")
 *   .withOrganizationId(orgId)
 *   .build();
 *
 * // Create a subscription.created payload from payment link
 * const payload = new WebhookPayloadBuilder()
 *   .subscriptionCreated()
 *   .withPaymentLinkCode("pl_abc123")
 *   .withCustomer({ name: "John Doe", email: "john@example.com" })
 *   .build();
 */
export class WebhookPayloadBuilder {
  private eventId: string;
  private eventType: PagarmeWebhookPayload["type"] = "charge.paid";
  private readonly createdAt: string;
  private subscriptionId: string;
  private readonly chargeId: string;
  private organizationId?: string;
  private planId?: string;
  private pricingTierId?: string;
  private billingCycle?: string;
  private paymentLinkCode?: string;
  private customer?: CustomerData;
  private period: PeriodData;
  private amount = 9900;
  private chargeStatus = "paid";
  private subscriptionStatus = "active";
  private updatedAt?: string;
  private gatewayMessage = "Insufficient funds";
  private card?: CardData;

  constructor() {
    this.eventId = `evt_${crypto.randomUUID()}`;
    this.createdAt = new Date().toISOString();
    this.subscriptionId = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    this.chargeId = `ch_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    this.period = {
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Sets the event type to charge.paid
   */
  chargePaid(): this {
    this.eventType = "charge.paid";
    this.chargeStatus = "paid";
    return this;
  }

  /**
   * Sets the event type to charge.payment_failed
   */
  chargePaymentFailed(): this {
    this.eventType = "charge.payment_failed";
    this.chargeStatus = "failed";
    this.subscriptionStatus = "pending";
    return this;
  }

  /**
   * Sets the event type to charge.refunded
   */
  chargeRefunded(): this {
    this.eventType = "charge.refunded";
    this.chargeStatus = "refunded";
    return this;
  }

  /**
   * Sets the event type to subscription.created
   */
  subscriptionCreated(): this {
    this.eventType = "subscription.created";
    this.subscriptionStatus = "active";
    return this;
  }

  /**
   * Sets the event type to subscription.canceled
   */
  subscriptionCanceled(): this {
    this.eventType = "subscription.canceled";
    this.subscriptionStatus = "canceled";
    return this;
  }

  /**
   * Sets the event type to subscription.updated
   */
  subscriptionUpdated(): this {
    this.eventType = "subscription.updated";
    return this;
  }

  /**
   * Sets a custom event type (for testing unknown events)
   */
  withEventType(type: string): this {
    this.eventType = type as PagarmeWebhookPayload["type"];
    return this;
  }

  /**
   * Sets a specific event ID (for idempotency tests)
   */
  withEventId(id: string): this {
    this.eventId = id;
    return this;
  }

  /**
   * Sets the Pagarme subscription ID
   */
  withSubscriptionId(id: string): this {
    this.subscriptionId = id;
    return this;
  }

  /**
   * Sets the organization ID in metadata
   */
  withOrganizationId(id: string): this {
    this.organizationId = id;
    return this;
  }

  /**
   * Sets the plan ID in metadata
   */
  withPlanId(id: string): this {
    this.planId = id;
    return this;
  }

  /**
   * Sets the pricing tier ID in metadata
   */
  withPricingTierId(id: string): this {
    this.pricingTierId = id;
    return this;
  }

  /**
   * Sets the billing cycle in metadata
   */
  withBillingCycle(cycle: string): this {
    this.billingCycle = cycle;
    return this;
  }

  /**
   * Sets the payment link code (for subscription.created from checkout)
   */
  withPaymentLinkCode(code: string): this {
    this.paymentLinkCode = code;
    return this;
  }

  /**
   * Sets the customer data
   */
  withCustomer(customer: CustomerData): this {
    this.customer = customer;
    return this;
  }

  /**
   * Sets the billing period
   */
  withPeriod(startAt: Date, endAt: Date): this {
    this.period = { startAt, endAt };
    return this;
  }

  /**
   * Sets the charge amount in cents
   */
  withAmount(amount: number): this {
    this.amount = amount;
    return this;
  }

  /**
   * Sets the subscription status (for subscription.updated)
   */
  withStatus(status: string): this {
    this.subscriptionStatus = status;
    return this;
  }

  /**
   * Sets the updated_at timestamp (for subscription.updated idempotency)
   */
  withUpdatedAt(date: Date): this {
    this.updatedAt = date.toISOString();
    return this;
  }

  /**
   * Sets the gateway response message (for payment_failed events)
   */
  withGatewayResponse(message: string): this {
    this.gatewayMessage = message;
    return this;
  }

  /**
   * Sets card data (for subscription.updated with card changes)
   */
  withCard(card: CardData): this {
    this.card = card;
    return this;
  }

  /**
   * Builds the webhook payload
   */
  build(): PagarmeWebhookPayload {
    if (this.eventType === "subscription.created") {
      return this.buildSubscriptionCreated();
    }

    if (this.eventType === "subscription.canceled") {
      return this.buildSubscriptionCanceled();
    }

    if (this.eventType === "subscription.updated") {
      return this.buildSubscriptionUpdated();
    }

    return this.buildChargeEvent();
  }

  private buildChargeEvent(): PagarmeWebhookPayload {
    const payload: PagarmeWebhookPayload = {
      id: this.eventId,
      type: this.eventType,
      created_at: this.createdAt,
      data: {
        id: this.chargeId,
        status: this.chargeStatus,
        amount: this.amount,
        subscription: {
          id: this.subscriptionId,
          status: this.subscriptionStatus,
        },
        current_period: {
          start_at:
            this.period.startAt?.toISOString() ?? new Date().toISOString(),
          end_at: this.period.endAt?.toISOString() ?? new Date().toISOString(),
        },
        metadata: {},
      },
    };

    if (this.organizationId) {
      payload.data.metadata = {
        ...payload.data.metadata,
        organization_id: this.organizationId,
      };
    }

    if (this.eventType === "charge.payment_failed") {
      payload.data.last_transaction = {
        id: `tr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        status: "failed",
        gateway_response: {
          code: "51",
          message: this.gatewayMessage,
        },
      };
    }

    if (this.eventType === "charge.refunded") {
      payload.data.last_transaction = {
        id: `tr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        status: "refunded",
        gateway_response: {
          code: "00",
          message: this.gatewayMessage,
        },
      };
    }

    return payload;
  }

  private buildSubscriptionCreated(): PagarmeWebhookPayload {
    const customerId =
      this.customer?.id ??
      `cus_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

    const payload: PagarmeWebhookPayload = {
      id: this.eventId,
      type: "subscription.created",
      created_at: this.createdAt,
      data: {
        id: this.subscriptionId,
        status: this.subscriptionStatus,
        start_at:
          this.period.startAt?.toISOString() ?? new Date().toISOString(),
        current_period: {
          start_at:
            this.period.startAt?.toISOString() ?? new Date().toISOString(),
          end_at: this.period.endAt?.toISOString() ?? new Date().toISOString(),
        },
        metadata: {},
      },
    };

    // Add payment link code if provided (for checkout flow)
    if (this.paymentLinkCode) {
      payload.data.code = this.paymentLinkCode;
      payload.data.plan = {
        id: `plan_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        name: "Test Plan",
        metadata: {},
      };
    }

    // Add organization_id and plan_id to metadata if provided (for direct metadata flow)
    if (this.organizationId) {
      payload.data.metadata = {
        ...payload.data.metadata,
        organization_id: this.organizationId,
      };
    }

    if (this.planId) {
      payload.data.metadata = {
        ...payload.data.metadata,
        plan_id: this.planId,
      };
    }

    if (this.pricingTierId) {
      payload.data.metadata = {
        ...payload.data.metadata,
        pricing_tier_id: this.pricingTierId,
      };
    }

    if (this.billingCycle) {
      payload.data.metadata = {
        ...payload.data.metadata,
        billing_cycle: this.billingCycle,
      };
    }

    // Add customer if provided
    if (this.customer) {
      payload.data.customer = {
        id: customerId,
        name: this.customer.name ?? "Test Customer",
        email: this.customer.email ?? "customer@example.com",
        document: this.customer.document ?? "12345678909",
        document_type: "CPF" as const,
        type: "individual" as const,
      };

      if (this.customer.phone) {
        payload.data.customer.phones = {
          mobile_phone: {
            country_code: "55",
            area_code: this.customer.phone.slice(0, 2),
            number: this.customer.phone.slice(2),
          },
        };
      }
    }

    return payload;
  }

  private buildSubscriptionCanceled(): PagarmeWebhookPayload {
    const payload: PagarmeWebhookPayload = {
      id: this.eventId,
      type: "subscription.canceled",
      created_at: this.createdAt,
      data: {
        id: this.subscriptionId,
        status: "canceled",
        metadata: {},
      },
    };

    if (this.organizationId) {
      payload.data.metadata = {
        ...payload.data.metadata,
        organization_id: this.organizationId,
      };
    }

    return payload;
  }

  private buildSubscriptionUpdated(): PagarmeWebhookPayload {
    const payload: PagarmeWebhookPayload = {
      id: this.eventId,
      type: "subscription.updated",
      created_at: this.createdAt,
      data: {
        id: this.subscriptionId,
        status: this.subscriptionStatus,
        metadata: {},
      },
    };

    if (this.updatedAt) {
      payload.data.updated_at = this.updatedAt;
    }

    if (this.organizationId) {
      payload.data.metadata = {
        ...payload.data.metadata,
        organization_id: this.organizationId,
      };
    }

    if (this.period.startAt || this.period.endAt) {
      payload.data.current_period = {
        start_at:
          this.period.startAt?.toISOString() ?? new Date().toISOString(),
        end_at: this.period.endAt?.toISOString() ?? new Date().toISOString(),
      };
    }

    if (this.card) {
      payload.data.card = {
        id:
          this.card.id ??
          `card_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        last_four_digits: this.card.lastFourDigits ?? "4242",
        brand: this.card.brand ?? "visa",
        exp_month: this.card.expMonth ?? 12,
        exp_year: this.card.expYear ?? 2030,
      };
    }

    return payload;
  }
}
