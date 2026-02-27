import { env } from "@/env";
import {
  CheckoutError,
  PagarmeApiError,
  PagarmeTimeoutError,
} from "@/modules/payments/errors";
import type {
  CreateAccessTokenResponse,
  CreateCustomerRequest,
  CreateOrderRequest,
  CreatePaymentLinkRequest,
  CreatePlanRequest,
  CreateSubscriptionRequest,
  ListCustomersResponse,
  ListInvoicesResponse,
  ListSubscriptionsResponse,
  PagarmeApiErrorResponse,
  PagarmeCheckout,
  PagarmeCustomer,
  PagarmeInvoice,
  PagarmeOrder,
  PagarmePaymentLink,
  PagarmePlan,
  PagarmeSubscription,
  UpdateSubscriptionItemRequest,
} from "./pagarme.types";

const PAGARME_BASE_URL = env.PAGARME_BASE_URL;
const PAGARME_PAYMENTLINKS_URL = env.PAGARME_SECRET_KEY.startsWith("sk_test_")
  ? "https://sdx-api.pagar.me/core/v5"
  : env.PAGARME_BASE_URL;

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Standardized retry configuration for Pagarme API calls.
 * Use PAGARME_RETRY_READ for read operations (GET) and
 * PAGARME_RETRY_WRITE for write operations (POST/PUT/PATCH).
 */
export const PAGARME_RETRY_CONFIG = {
  /** For read operations (listing, fetching) - more retries, shorter delay */
  READ: { maxAttempts: 3, delayMs: 500 },
  /** For write operations (create, update) - fewer retries, longer delay */
  WRITE: { maxAttempts: 3, delayMs: 1000 },
} as const;

export abstract class PagarmeClient {
  private static get headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${env.PAGARME_SECRET_KEY}:`).toString("base64")}`,
    };
  }

  private static async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      idempotencyKey?: string;
      baseUrl?: string;
    }
  ): Promise<T> {
    const { body, idempotencyKey, baseUrl = PAGARME_BASE_URL } = options ?? {};
    const headers: Record<string, string> = { ...PagarmeClient.headers };

    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error: PagarmeApiErrorResponse = await response
          .json()
          .catch(() => ({
            message: "Unknown Pagarme API error",
          }));
        throw new PagarmeApiError(response.status, error);
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new PagarmeTimeoutError(path);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static async createCustomer(
    data: CreateCustomerRequest,
    idempotencyKey?: string
  ): Promise<PagarmeCustomer> {
    return PagarmeClient.request("POST", "/customers", {
      body: data,
      idempotencyKey,
    });
  }

  static async getCustomer(customerId: string): Promise<PagarmeCustomer> {
    return PagarmeClient.request("GET", `/customers/${customerId}`);
  }

  static async updateCustomer(
    customerId: string,
    data: Partial<CreateCustomerRequest>,
    idempotencyKey?: string
  ): Promise<PagarmeCustomer> {
    return PagarmeClient.request("PUT", `/customers/${customerId}`, {
      body: data,
      idempotencyKey,
    });
  }

  static async getCustomers(params: {
    name?: string;
    email?: string;
    document?: string;
    page?: number;
    size?: number;
  }): Promise<ListCustomersResponse> {
    const searchParams = new URLSearchParams();

    if (params.name) {
      searchParams.set("name", params.name);
    }
    if (params.email) {
      searchParams.set("email", params.email);
    }
    if (params.document) {
      searchParams.set("document", params.document);
    }
    searchParams.set("page", String(params.page ?? 1));
    searchParams.set("size", String(params.size ?? 10));

    return PagarmeClient.request(
      "GET",
      `/customers?${searchParams.toString()}`
    );
  }

  static async createSubscription(
    data: CreateSubscriptionRequest,
    idempotencyKey?: string
  ): Promise<PagarmeSubscription> {
    return PagarmeClient.request("POST", "/subscriptions", {
      body: data,
      idempotencyKey,
    });
  }

  static async getSubscription(
    subscriptionId: string
  ): Promise<PagarmeSubscription> {
    return PagarmeClient.request("GET", `/subscriptions/${subscriptionId}`);
  }

  static async getSubscriptions(params: {
    planId?: string;
    status?: string;
    page?: number;
    size?: number;
  }): Promise<ListSubscriptionsResponse> {
    const searchParams = new URLSearchParams();

    if (params.planId) {
      searchParams.set("plan_id", params.planId);
    }
    if (params.status) {
      searchParams.set("status", params.status);
    }
    searchParams.set("page", String(params.page ?? 1));
    searchParams.set("size", String(params.size ?? 20));

    return PagarmeClient.request(
      "GET",
      `/subscriptions?${searchParams.toString()}`
    );
  }

  static async cancelSubscription(
    subscriptionId: string,
    cancelPendingInvoices = true,
    idempotencyKey?: string
  ): Promise<PagarmeSubscription> {
    return PagarmeClient.request("DELETE", `/subscriptions/${subscriptionId}`, {
      body: { cancel_pending_invoices: cancelPendingInvoices },
      idempotencyKey,
    });
  }

  static async updateSubscriptionCard(
    subscriptionId: string,
    cardId: string,
    idempotencyKey?: string
  ): Promise<PagarmeSubscription> {
    return PagarmeClient.request(
      "PATCH",
      `/subscriptions/${subscriptionId}/card`,
      { body: { card_id: cardId }, idempotencyKey }
    );
  }

  static async updateSubscriptionItem(
    subscriptionId: string,
    itemId: string,
    data: UpdateSubscriptionItemRequest,
    idempotencyKey?: string
  ): Promise<PagarmeSubscription> {
    return PagarmeClient.request(
      "PUT",
      `/subscriptions/${subscriptionId}/items/${itemId}`,
      { body: data, idempotencyKey }
    );
  }

  static async createOrder(
    data: CreateOrderRequest,
    idempotencyKey?: string
  ): Promise<PagarmeOrder> {
    return PagarmeClient.request("POST", "/orders", {
      body: data,
      idempotencyKey,
    });
  }

  static async getOrder(orderId: string): Promise<PagarmeOrder> {
    return PagarmeClient.request("GET", `/orders/${orderId}`);
  }

  static async createCheckout(params: {
    customerId: string;
    amount: number;
    description: string;
    successUrl: string;
    expiresInMinutes?: number;
    metadata?: Record<string, string>;
  }): Promise<PagarmeCheckout> {
    const order = await PagarmeClient.createOrder(
      {
        customer_id: params.customerId,
        items: [
          {
            amount: params.amount,
            description: params.description,
            quantity: 1,
          },
        ],
        payments: [
          {
            payment_method: "checkout",
            checkout: {
              accepted_payment_methods: ["credit_card", "boleto", "pix"],
              success_url: params.successUrl,
              skip_checkout_success_page: true,
              expires_in: params.expiresInMinutes ?? 60,
            },
          },
        ],
        metadata: params.metadata,
      },
      params.metadata?.idempotencyKey
    );

    const checkout = order.checkouts?.[0];
    if (!checkout) {
      throw new CheckoutError("No checkout URL returned from Pagarme");
    }

    return checkout;
  }

  static async getInvoices(params: {
    subscriptionId?: string;
    customerId?: string;
    status?: string;
    page?: number;
    size?: number;
  }): Promise<ListInvoicesResponse> {
    const searchParams = new URLSearchParams();

    if (params.subscriptionId) {
      searchParams.set("subscription_id", params.subscriptionId);
    }
    if (params.customerId) {
      searchParams.set("customer_id", params.customerId);
    }
    if (params.status) {
      searchParams.set("status", params.status);
    }
    searchParams.set("page", String(params.page ?? 1));
    searchParams.set("size", String(params.size ?? 20));

    return PagarmeClient.request("GET", `/invoices?${searchParams.toString()}`);
  }

  static async getInvoice(invoiceId: string): Promise<PagarmeInvoice> {
    return PagarmeClient.request("GET", `/invoices/${invoiceId}`);
  }

  static async createPlan(
    data: CreatePlanRequest,
    idempotencyKey?: string
  ): Promise<PagarmePlan> {
    return PagarmeClient.request("POST", "/plans", {
      body: data,
      idempotencyKey,
    });
  }

  static async getPlan(planId: string): Promise<PagarmePlan> {
    return PagarmeClient.request("GET", `/plans/${planId}`);
  }

  static async updatePlan(
    planId: string,
    data: Partial<CreatePlanRequest>
  ): Promise<PagarmePlan> {
    return PagarmeClient.request("PUT", `/plans/${planId}`, { body: data });
  }

  static async deactivatePlan(planId: string): Promise<PagarmePlan> {
    return PagarmeClient.request("PUT", `/plans/${planId}`, {
      body: { status: "inactive" },
    });
  }

  static async createPaymentLink(
    data: CreatePaymentLinkRequest,
    idempotencyKey?: string
  ): Promise<PagarmePaymentLink> {
    return PagarmeClient.request("POST", "/paymentlinks", {
      body: data,
      idempotencyKey,
      baseUrl: PAGARME_PAYMENTLINKS_URL,
    });
  }

  static async getPaymentLink(
    paymentLinkId: string
  ): Promise<PagarmePaymentLink> {
    return PagarmeClient.request("GET", `/paymentlinks/${paymentLinkId}`, {
      baseUrl: PAGARME_PAYMENTLINKS_URL,
    });
  }

  static async createAccessToken(
    customerId: string
  ): Promise<CreateAccessTokenResponse> {
    return PagarmeClient.request(
      "POST",
      `/customers/${customerId}/access_tokens`
    );
  }
}
