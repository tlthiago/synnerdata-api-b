import { AppError } from "@/lib/errors/base-error";
import { Retry } from "@/lib/utils/retry";
import { BillingService } from "@/modules/payments/billing/billing.service";
import {
  BillingProfileNotFoundError,
  CustomerCreationError,
  PagarmeApiError,
  PagarmeAuthorizationError,
} from "@/modules/payments/errors";
import {
  PAGARME_RETRY_CONFIG,
  PagarmeClient,
} from "@/modules/payments/pagarme/client";
import type {
  CreateCustomerInput,
  ListCustomersData,
  ListCustomersInput,
} from "./customer.model";

const AUTHORIZATION_ERROR_PATTERNS = [
  "authorization has been denied",
  "unauthorized",
  "authentication failed",
  "invalid api key",
  "access denied",
];

function isAuthorizationError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTHORIZATION_ERROR_PATTERNS.some((pattern) =>
    lower.includes(pattern)
  );
}

export abstract class CustomerService {
  /**
   * Gets or creates a Pagarme customer for checkout.
   *
   * Uses idempotency key with Pagarme and atomic DB update to prevent:
   * - Duplicate customers in Pagarme (via idempotency key)
   * - Race conditions in local DB (via setCustomerIdIfNull)
   */
  static async getOrCreateForCheckout(
    organizationId: string
  ): Promise<{ pagarmeCustomerId: string }> {
    const billingProfile = await BillingService.getProfile(organizationId);

    if (!billingProfile) {
      throw new BillingProfileNotFoundError(organizationId);
    }

    if (billingProfile.pagarmeCustomerId) {
      return { pagarmeCustomerId: billingProfile.pagarmeCustomerId };
    }

    // Create customer in Pagarme (idempotency key prevents duplicate customers)
    const customer = await CustomerService.create({
      organizationId,
      name: billingProfile.legalName,
      email: billingProfile.email,
      document: billingProfile.taxId,
      phone: billingProfile.phone,
    });

    // Atomically save customer ID only if not already set by another request
    const wasSet = await BillingService.setCustomerIdIfNull(
      organizationId,
      customer.pagarmeCustomerId
    );

    if (!wasSet) {
      // Another request already set the customer ID, fetch and return it
      const existingCustomerId =
        await BillingService.getCustomerId(organizationId);
      if (existingCustomerId) {
        return { pagarmeCustomerId: existingCustomerId };
      }
      // This shouldn't happen, but handle gracefully
      throw new CustomerCreationError(
        "Failed to get or set customer ID after race condition"
      );
    }

    return { pagarmeCustomerId: customer.pagarmeCustomerId };
  }

  /**
   * Creates a customer in Pagarme.
   * Note: Does NOT persist the customer ID - caller is responsible for saving it.
   */
  static async create(
    input: CreateCustomerInput
  ): Promise<{ pagarmeCustomerId: string }> {
    const { organizationId, name, email, document, phone } = input;

    const phoneDigits = phone.replace(/\D/g, "");
    const countryCode =
      phoneDigits.length > 11 ? phoneDigits.slice(0, 2) : "55";
    const areaCode =
      phoneDigits.length > 11
        ? phoneDigits.slice(2, 4)
        : phoneDigits.slice(0, 2);
    const phoneNumber =
      phoneDigits.length > 11 ? phoneDigits.slice(4) : phoneDigits.slice(2);

    try {
      const pagarmeCustomer = await Retry.withRetry(
        () =>
          PagarmeClient.createCustomer(
            {
              name,
              email,
              document: document.replace(/\D/g, ""),
              type: "company",
              phones: {
                mobile_phone: {
                  country_code: countryCode,
                  area_code: areaCode,
                  number: phoneNumber,
                },
              },
              metadata: {
                organization_id: organizationId,
              },
            },
            `create-customer-${organizationId}`
          ),
        PAGARME_RETRY_CONFIG.WRITE
      );

      return { pagarmeCustomerId: pagarmeCustomer.id };
    } catch (error) {
      if (
        error instanceof PagarmeApiError &&
        isAuthorizationError(error.message)
      ) {
        throw new PagarmeAuthorizationError("createCustomer");
      }

      if (error instanceof AppError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      throw new CustomerCreationError(message);
    }
  }

  static async getCustomerId(organizationId: string): Promise<string | null> {
    return await BillingService.getCustomerId(organizationId);
  }

  static async list(input: ListCustomersInput): Promise<ListCustomersData> {
    const pagarmeResponse = await Retry.withRetry(
      () =>
        PagarmeClient.getCustomers({
          name: input.name,
          email: input.email,
          document: input.document,
          page: input.page,
          size: input.size,
        }),
      PAGARME_RETRY_CONFIG.READ
    );

    return {
      customers: pagarmeResponse.data,
      paging: pagarmeResponse.paging,
    };
  }
}
