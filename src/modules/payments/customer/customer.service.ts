import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationProfiles } from "@/db/schema";
import {
  CustomerCreationError,
  CustomerNotFoundError,
  MissingBillingDataError,
} from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type { BillingData, CreateCustomerInput } from "./customer.model";

export type ListCustomersParams = {
  name?: string;
  email?: string;
  document?: string;
  page?: number;
  size?: number;
};

export abstract class CustomerService {
  static async getOrCreateForCheckout(
    organizationId: string,
    billingData?: BillingData
  ): Promise<{ pagarmeCustomerId: string }> {
    const [profile] = await db
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, organizationId))
      .limit(1);

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
        .update(organizationProfiles)
        .set({
          taxId: billingData?.document ?? profile.taxId,
          phone: billingData?.phone ?? profile.phone,
          email: billingData?.billingEmail ?? profile.email,
        })
        .where(eq(organizationProfiles.organizationId, organizationId));
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

    // Parse phone number (format: +55 11 99999-9999 -> country_code: 55, area_code: 11, number: 999999999)
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
      const pagarmeCustomer = await PagarmeClient.createCustomer(
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
      );

      await db
        .update(organizationProfiles)
        .set({ pagarmeCustomerId: pagarmeCustomer.id })
        .where(eq(organizationProfiles.organizationId, organizationId));

      return { pagarmeCustomerId: pagarmeCustomer.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new CustomerCreationError(message);
    }
  }

  static async getCustomerId(organizationId: string): Promise<string | null> {
    const [profile] = await db
      .select({ pagarmeCustomerId: organizationProfiles.pagarmeCustomerId })
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, organizationId))
      .limit(1);

    return profile?.pagarmeCustomerId ?? null;
  }

  static list(params: ListCustomersParams) {
    return PagarmeClient.getCustomers({
      name: params.name,
      email: params.email,
      document: params.document,
      page: params.page ?? 1,
      size: params.size ?? 10,
    });
  }
}
