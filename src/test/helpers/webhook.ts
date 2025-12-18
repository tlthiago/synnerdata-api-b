import { env } from "@/env";
import type { PagarmeWebhookPayload } from "@/modules/payments/pagarme/pagarme.types";

export function createWebhookAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

export function createWebhookRequest(
  url: string,
  payload: PagarmeWebhookPayload
): Request {
  const body = JSON.stringify(payload);

  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: createWebhookAuthHeader(),
    },
    body,
  });
}

export function createInvalidWebhookRequest(
  url: string,
  payload: PagarmeWebhookPayload
): Request {
  const body = JSON.stringify(payload);

  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic aW52YWxpZDppbnZhbGlk",
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
