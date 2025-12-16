import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import {
  CustomerCreationError,
  CustomerNotFoundError,
  MissingBillingDataError,
} from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type {
  BillingData,
  CreateCustomerInput,
  ListCustomersData,
  ListCustomersInput,
} from "./customer.model";

export abstract class CustomerService {
  private static async findProfileByOrganizationId(organizationId: string) {
    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    return profile ?? null;
  }

  static async getOrCreateForCheckout(
    organizationId: string,
    billingData?: BillingData
  ): Promise<{ pagarmeCustomerId: string }> {
    const profile =
      await CustomerService.findProfileByOrganizationId(organizationId);

    if (!profile) {
      throw new CustomerNotFoundError(organizationId);
    }

    const document = billingData?.document ?? profile.taxId;
    const phone = billingData?.phone ?? profile.phone ?? profile.mobile;
    const email = billingData?.billingEmail ?? profile.email;

    const missingFields: string[] = [];
    if (!document) {
      missingFields.push("document (CNPJ)");
    }
    if (!phone) {
      missingFields.push("phone");
    }

    if (missingFields.length > 0) {
      throw new MissingBillingDataError(missingFields);
    }

    if (
      billingData?.document ||
      billingData?.phone ||
      billingData?.billingEmail
    ) {
      await db
        .update(schema.organizationProfiles)
        .set({
          taxId: billingData?.document ?? profile.taxId,
          phone: billingData?.phone ?? profile.phone,
          email: billingData?.billingEmail ?? profile.email,
        })
        .where(eq(schema.organizationProfiles.organizationId, organizationId));
    }

    if (profile.pagarmeCustomerId) {
      return { pagarmeCustomerId: profile.pagarmeCustomerId };
    }

    const customer = await CustomerService.create({
      organizationId,
      name: profile.tradeName,
      email: email ?? "",
      document: document as string,
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

      await db
        .update(schema.organizationProfiles)
        .set({ pagarmeCustomerId: pagarmeCustomer.id })
        .where(eq(schema.organizationProfiles.organizationId, organizationId));

      return { pagarmeCustomerId: pagarmeCustomer.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new CustomerCreationError(message);
    }
  }

  static async getCustomerId(organizationId: string): Promise<string | null> {
    const profile =
      await CustomerService.findProfileByOrganizationId(organizationId);

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
