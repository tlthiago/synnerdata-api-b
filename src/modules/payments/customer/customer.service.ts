import { Retry } from "@/lib/utils/retry";
import { ProfileNotFoundError } from "@/modules/organizations/profile/errors";
import { OrganizationService } from "@/modules/organizations/profile/organization.service";
import { CustomerCreationError } from "@/modules/payments/errors";
import { PagarmeClient } from "@/modules/payments/pagarme/client";
import type {
  CreateCustomerInput,
  ListCustomersData,
  ListCustomersInput,
} from "./customer.model";

export abstract class CustomerService {
  static async getOrCreateForCheckout(
    organizationId: string
  ): Promise<{ pagarmeCustomerId: string }> {
    const profile = await OrganizationService.getProfile(organizationId);

    if (!profile) {
      throw new ProfileNotFoundError(organizationId);
    }

    if (profile.pagarmeCustomerId) {
      return { pagarmeCustomerId: profile.pagarmeCustomerId };
    }

    const phone = profile.phone ?? profile.mobile;

    const customer = await CustomerService.create({
      organizationId,
      name: profile.tradeName,
      email: profile.email ?? "",
      document: profile.taxId as string,
      phone: phone as string,
    });

    return { pagarmeCustomerId: customer.pagarmeCustomerId };
  }

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
        { maxAttempts: 3, delayMs: 1000 }
      );

      await OrganizationService.setCustomerId(
        organizationId,
        pagarmeCustomer.id
      );

      return { pagarmeCustomerId: pagarmeCustomer.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new CustomerCreationError(message);
    }
  }

  static async getCustomerId(organizationId: string): Promise<string | null> {
    const profile = await OrganizationService.getProfile(organizationId);
    return profile?.pagarmeCustomerId ?? null;
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
      { maxAttempts: 3, delayMs: 500 }
    );

    return {
      customers: pagarmeResponse.data,
      paging: pagarmeResponse.paging,
    };
  }
}
