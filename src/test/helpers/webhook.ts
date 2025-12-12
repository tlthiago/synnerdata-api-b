import { createHmac } from "node:crypto";
import { env } from "@/env";
import type { PagarmeWebhookPayload } from "@/modules/payments/pagarme/pagarme.types";

/**
 * Generates a valid HMAC-SHA256 signature for Pagarme webhooks
 */
export function generateWebhookSignature(payload: string): string {
  const hmac = createHmac("sha256", env.PAGARME_WEBHOOK_SECRET);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Creates a webhook request with valid signature
 */
export function createWebhookRequest(
  url: string,
  payload: PagarmeWebhookPayload
): Request {
  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body);

  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature": signature,
    },
    body,
  });
}

/**
 * Creates a webhook request with invalid signature (for testing rejection)
 */
export function createInvalidWebhookRequest(
  url: string,
  payload: PagarmeWebhookPayload
): Request {
  const body = JSON.stringify(payload);

  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature": "sha256=invalid-signature",
    },
    body,
  });
}

/**
 * Sample webhook payloads for testing
 */
export const webhookPayloads = {
  chargePaid: (
    subscriptionId: string,
    organizationId: string
  ): PagarmeWebhookPayload => ({
    id: `evt-${crypto.randomUUID()}`,
    type: "charge.paid",
    created_at: new Date().toISOString(),
    data: {
      id: `ch-${crypto.randomUUID()}`,
      status: "paid",
      amount: 9900,
      subscription: {
        id: subscriptionId,
        status: "active",
      },
      current_period: {
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      metadata: {
        organization_id: organizationId,
      },
    },
  }),

  chargePaymentFailed: (
    subscriptionId: string,
    organizationId: string
  ): PagarmeWebhookPayload => ({
    id: `evt-${crypto.randomUUID()}`,
    type: "charge.payment_failed",
    created_at: new Date().toISOString(),
    data: {
      id: `ch-${crypto.randomUUID()}`,
      status: "failed",
      amount: 9900,
      subscription: {
        id: subscriptionId,
        status: "pending",
      },
      last_transaction: {
        id: `tr-${crypto.randomUUID()}`,
        status: "failed",
        gateway_response: {
          code: "51",
          message: "Insufficient funds",
        },
      },
      metadata: {
        organization_id: organizationId,
      },
    },
  }),

  subscriptionCanceled: (
    subscriptionId: string,
    organizationId: string
  ): PagarmeWebhookPayload => ({
    id: `evt-${crypto.randomUUID()}`,
    type: "subscription.canceled",
    created_at: new Date().toISOString(),
    data: {
      id: subscriptionId,
      status: "canceled",
      metadata: {
        organization_id: organizationId,
      },
    },
  }),

  orderPaid: (
    organizationId: string,
    planId: string
  ): PagarmeWebhookPayload => ({
    id: `evt-${crypto.randomUUID()}`,
    type: "order.paid",
    created_at: new Date().toISOString(),
    data: {
      id: `ord-${crypto.randomUUID()}`,
      code: `ORD-${Date.now()}`,
      status: "paid",
      amount: 9900,
      metadata: {
        organization_id: organizationId,
        plan_id: planId,
        annual: "false",
      },
    },
  }),

  /**
   * subscription.created payload with direct metadata (for backward compatibility tests)
   */
  subscriptionCreated: (
    organizationId: string,
    planId: string,
    customer?: {
      id?: string;
      name?: string;
      email?: string;
      document?: string;
      phone?: string;
    }
  ): PagarmeWebhookPayload => ({
    id: `evt-${crypto.randomUUID()}`,
    type: "subscription.created",
    created_at: new Date().toISOString(),
    data: {
      id: `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      status: "active",
      current_period: {
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      customer: customer
        ? {
            id:
              customer.id ??
              `cus_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
            name: customer.name ?? "Test Customer",
            email: customer.email ?? "customer@example.com",
            document: customer.document ?? "12345678909",
            document_type: "CPF" as const,
            type: "individual" as const,
            phones: customer.phone
              ? {
                  mobile_phone: {
                    country_code: "55",
                    area_code: customer.phone.slice(0, 2),
                    number: customer.phone.slice(2),
                  },
                }
              : undefined,
          }
        : undefined,
      metadata: {
        organization_id: organizationId,
        plan_id: planId,
      },
    },
  }),

  /**
   * subscription.created payload matching real Pagarme structure
   * with code (payment link ID) for precise checkout lookup
   */
  subscriptionCreatedFromPaymentLink: (
    paymentLinkCode: string,
    customer?: {
      id?: string;
      name?: string;
      email?: string;
      document?: string;
      phone?: string;
    }
  ): PagarmeWebhookPayload => ({
    id: `evt-${crypto.randomUUID()}`,
    type: "subscription.created",
    created_at: new Date().toISOString(),
    data: {
      id: `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      code: paymentLinkCode,
      status: "active",
      start_at: new Date().toISOString(),
      plan: {
        id: `plan_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        name: "Test Plan",
        metadata: {},
      },
      customer: customer
        ? {
            id:
              customer.id ??
              `cus_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
            name: customer.name ?? "Test Customer",
            email: customer.email ?? "customer@example.com",
            document: customer.document ?? "12345678909",
            document_type: "CPF" as const,
            type: "individual" as const,
            phones: customer.phone
              ? {
                  mobile_phone: {
                    country_code: "55",
                    area_code: customer.phone.slice(0, 2),
                    number: customer.phone.slice(2),
                  },
                }
              : undefined,
          }
        : undefined,
      metadata: {},
    },
  }),
};
