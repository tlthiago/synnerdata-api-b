import { env } from "@/env";
import type {
  CreateAccessTokenResponse,
  CreateCustomerRequest,
  CreateOrderRequest,
  CreatePaymentLinkRequest,
  CreatePlanRequest,
  CreateSubscriptionRequest,
  ListCustomersResponse,
  ListInvoicesResponse,
  PagarmeCheckout,
  PagarmeCustomer,
  PagarmeInvoice,
  PagarmeOrder,
  PagarmePaymentLink,
  PagarmePlan,
  PagarmeSubscription,
} from "./pagarme.types";

const PAGARME_BASE_URL = env.PAGARME_BASE_URL;

// Payment links use a different base URL for sandbox (sk_test_ keys)
const PAGARME_PAYMENTLINKS_URL = env.PAGARME_SECRET_KEY.startsWith("sk_test_")
  ? "https://sdx-api.pagar.me/core/v5"
  : env.PAGARME_BASE_URL;

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
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const headers: Record<string, string> = { ...PagarmeClient.headers };

    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch(`${PAGARME_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: "Unknown Pagarme API error",
      }));
      throw new Error(
        `Pagarme API error: ${response.status} - ${JSON.stringify(error)}`
      );
    }

    return response.json();
  }

  // ============================================================
  // CUSTOMERS
  // ============================================================

  static async createCustomer(
    data: CreateCustomerRequest,
    idempotencyKey?: string
  ): Promise<PagarmeCustomer> {
    return PagarmeClient.request("POST", "/customers", data, idempotencyKey);
  }

  static async getCustomer(customerId: string): Promise<PagarmeCustomer> {
    return PagarmeClient.request("GET", `/customers/${customerId}`);
  }

  static async updateCustomer(
    customerId: string,
    data: Partial<CreateCustomerRequest>
  ): Promise<PagarmeCustomer> {
    return PagarmeClient.request("PUT", `/customers/${customerId}`, data);
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

  // ============================================================
  // SUBSCRIPTIONS
  // ============================================================

  static async createSubscription(
    data: CreateSubscriptionRequest,
    idempotencyKey?: string
  ): Promise<PagarmeSubscription> {
    return PagarmeClient.request(
      "POST",
      "/subscriptions",
      data,
      idempotencyKey
    );
  }

  static async getSubscription(
    subscriptionId: string
  ): Promise<PagarmeSubscription> {
    return PagarmeClient.request("GET", `/subscriptions/${subscriptionId}`);
  }

  static async cancelSubscription(
    subscriptionId: string,
    cancelPendingInvoices = true
  ): Promise<PagarmeSubscription> {
    return PagarmeClient.request("DELETE", `/subscriptions/${subscriptionId}`, {
      cancel_pending_invoices: cancelPendingInvoices,
    });
  }

  static async updateSubscriptionCard(
    subscriptionId: string,
    cardId: string
  ): Promise<PagarmeSubscription> {
    return PagarmeClient.request(
      "PATCH",
      `/subscriptions/${subscriptionId}/card`,
      {
        card_id: cardId,
      }
    );
  }

  // ============================================================
  // ORDERS / CHECKOUT
  // ============================================================

  static async createOrder(
    data: CreateOrderRequest,
    idempotencyKey?: string
  ): Promise<PagarmeOrder> {
    return PagarmeClient.request("POST", "/orders", data, idempotencyKey);
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
      throw new Error("Failed to create checkout - no checkout URL returned");
    }

    return checkout;
  }

  // ============================================================
  // INVOICES
  // ============================================================

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

  // ============================================================
  // PLANS
  // ============================================================

  static async createPlan(
    data: CreatePlanRequest,
    idempotencyKey?: string
  ): Promise<PagarmePlan> {
    return PagarmeClient.request("POST", "/plans", data, idempotencyKey);
  }

  static async getPlan(planId: string): Promise<PagarmePlan> {
    return PagarmeClient.request("GET", `/plans/${planId}`);
  }

  static async updatePlan(
    planId: string,
    data: Partial<CreatePlanRequest>
  ): Promise<PagarmePlan> {
    return PagarmeClient.request("PUT", `/plans/${planId}`, data);
  }

  // ============================================================
  // PAYMENT LINKS
  // ============================================================

  private static async requestPaymentLink<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const headers: Record<string, string> = { ...PagarmeClient.headers };

    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch(`${PAGARME_PAYMENTLINKS_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: "Unknown Pagarme API error",
      }));
      throw new Error(
        `Pagarme API error: ${response.status} - ${JSON.stringify(error)}`
      );
    }

    return response.json();
  }

  static async createPaymentLink(
    data: CreatePaymentLinkRequest,
    idempotencyKey?: string
  ): Promise<PagarmePaymentLink> {
    return PagarmeClient.requestPaymentLink(
      "POST",
      "/paymentlinks",
      data,
      idempotencyKey
    );
  }

  static async getPaymentLink(
    paymentLinkId: string
  ): Promise<PagarmePaymentLink> {
    return PagarmeClient.requestPaymentLink(
      "GET",
      `/paymentlinks/${paymentLinkId}`
    );
  }

  // ============================================================
  // CUSTOMER PORTAL (ACCESS TOKEN)
  // ============================================================

  static async createAccessToken(
    customerId: string
  ): Promise<CreateAccessTokenResponse> {
    return PagarmeClient.request(
      "POST",
      `/customers/${customerId}/access_tokens`
    );
  }
}
