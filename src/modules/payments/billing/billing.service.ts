import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type BillingProfile, type PlanLimits, schema } from "@/db/schema";
import { billingProfiles } from "@/db/schema/billing-profiles";
import { Retry } from "@/lib/utils/retry";
import {
  BillingProfileAlreadyExistsError,
  BillingProfileNotFoundError,
  InvoiceNotFoundError,
  SubscriptionNotFoundError,
} from "@/modules/payments/errors";
import {
  PAGARME_RETRY_CONFIG,
  PagarmeClient,
} from "@/modules/payments/pagarme/client";
import { DEFAULT_TRIAL_EMPLOYEE_LIMIT } from "@/modules/payments/plans/plans.constants";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type {
  CreateProfileInput,
  DownloadInvoiceData,
  GetUsageData,
  GetUsageInput,
  InvoiceData,
  ListInvoicesData,
  ListInvoicesInput,
  UpdateCardData,
  UpdateCardInput,
  UpdateProfileInput,
} from "./billing.model";

export abstract class BillingService {
  // ============================================
  // Profile CRUD Methods
  // ============================================

  /**
   * Get billing profile by organization ID
   */
  static async getProfile(
    organizationId: string
  ): Promise<BillingProfile | null> {
    const [profile] = await db
      .select()
      .from(billingProfiles)
      .where(eq(billingProfiles.organizationId, organizationId))
      .limit(1);

    return profile ?? null;
  }

  /**
   * Get billing profile or throw if not found
   */
  static async getProfileOrThrow(
    organizationId: string
  ): Promise<BillingProfile> {
    const profile = await BillingService.getProfile(organizationId);

    if (!profile) {
      throw new BillingProfileNotFoundError(organizationId);
    }

    return profile;
  }

  /**
   * Create a new billing profile for an organization
   */
  static async createProfile(
    organizationId: string,
    input: CreateProfileInput
  ): Promise<BillingProfile> {
    const existing = await BillingService.getProfile(organizationId);

    if (existing) {
      throw new BillingProfileAlreadyExistsError(organizationId);
    }

    const id = `bp-${crypto.randomUUID()}`;

    const [profile] = await db
      .insert(billingProfiles)
      .values({
        id,
        organizationId,
        legalName: input.legalName,
        taxId: input.taxId,
        email: input.email,
        phone: input.phone,
        street: input.address?.street,
        number: input.address?.number,
        complement: input.address?.complement,
        neighborhood: input.address?.neighborhood,
        city: input.address?.city,
        state: input.address?.state,
        zipCode: input.address?.zipCode,
      })
      .returning();

    return profile;
  }

  /**
   * Update billing profile and sync with Pagarme if customer exists
   */
  static async updateProfile(
    organizationId: string,
    input: UpdateProfileInput
  ): Promise<BillingProfile> {
    const existing = await BillingService.getProfileOrThrow(organizationId);

    const updateData: Partial<BillingProfile> = {};

    // Basic fields
    if (input.legalName) {
      updateData.legalName = input.legalName;
    }
    if (input.taxId) {
      updateData.taxId = input.taxId;
    }
    if (input.email) {
      updateData.email = input.email;
    }
    if (input.phone) {
      updateData.phone = input.phone;
    }

    // Address fields
    if (input.address) {
      if (input.address.street) {
        updateData.street = input.address.street;
      }
      if (input.address.number) {
        updateData.number = input.address.number;
      }
      if (input.address.complement !== undefined) {
        updateData.complement = input.address.complement;
      }
      if (input.address.neighborhood) {
        updateData.neighborhood = input.address.neighborhood;
      }
      if (input.address.city) {
        updateData.city = input.address.city;
      }
      if (input.address.state) {
        updateData.state = input.address.state;
      }
      if (input.address.zipCode) {
        updateData.zipCode = input.address.zipCode;
      }
    }

    const [updated] = await db
      .update(billingProfiles)
      .set(updateData)
      .where(eq(billingProfiles.id, existing.id))
      .returning();

    // Sync with Pagarme if customer exists
    if (existing.pagarmeCustomerId) {
      const document =
        input.taxId?.replace(/\D/g, "") ?? existing.taxId?.replace(/\D/g, "");
      // Determine customer type: CPF (11 digits) = individual, CNPJ (14 digits) = company
      const type =
        document && document.length === 11 ? "individual" : "company";

      await Retry.withRetry(
        () =>
          PagarmeClient.updateCustomer(
            existing.pagarmeCustomerId as string,
            {
              name: input.legalName ?? existing.legalName,
              document,
              type,
            },
            `update-customer-${organizationId}-${Date.now()}`
          ),
        PAGARME_RETRY_CONFIG.WRITE
      );
    }

    return updated;
  }

  /**
   * Set Pagarme customer ID for an organization.
   * @deprecated Use setCustomerIdIfNull for atomic operations
   */
  static async setCustomerId(
    organizationId: string,
    pagarmeCustomerId: string
  ): Promise<void> {
    const profile = await BillingService.getProfileOrThrow(organizationId);

    await db
      .update(billingProfiles)
      .set({ pagarmeCustomerId })
      .where(eq(billingProfiles.id, profile.id));
  }

  /**
   * Atomically set Pagarme customer ID only if not already set.
   * Returns true if the update was applied, false if a customer ID was already set.
   * This prevents race conditions when multiple requests try to create the same customer.
   */
  static async setCustomerIdIfNull(
    organizationId: string,
    pagarmeCustomerId: string
  ): Promise<boolean> {
    const result = await db
      .update(billingProfiles)
      .set({ pagarmeCustomerId })
      .where(
        sql`${billingProfiles.organizationId} = ${organizationId} AND ${billingProfiles.pagarmeCustomerId} IS NULL`
      )
      .returning({ id: billingProfiles.id });

    return result.length > 0;
  }

  /**
   * Get Pagarme customer ID for an organization
   */
  static async getCustomerId(organizationId: string): Promise<string | null> {
    const profile = await BillingService.getProfile(organizationId);
    return profile?.pagarmeCustomerId ?? null;
  }

  // ============================================
  // Invoice Methods
  // ============================================

  static async listInvoices(
    input: ListInvoicesInput
  ): Promise<ListInvoicesData> {
    const { organizationId, page, limit } = input;

    const subscription =
      await SubscriptionService.findByOrganizationId(organizationId);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    if (!subscription.pagarmeSubscriptionId) {
      return {
        invoices: [],
        total: 0,
        page,
        limit,
      };
    }

    const pagarmeSubId = subscription.pagarmeSubscriptionId;
    const response = await Retry.withRetry(
      () =>
        PagarmeClient.getInvoices({
          subscriptionId: pagarmeSubId,
          page,
          size: limit,
        }),
      PAGARME_RETRY_CONFIG.READ
    );

    const invoices: InvoiceData[] = response.data.map((invoice) => ({
      id: invoice.id,
      code: invoice.code,
      amount: invoice.amount,
      status: invoice.status,
      dueAt: invoice.due_at,
      paidAt: invoice.paid_at ?? null,
      url: invoice.url ?? null,
    }));

    return {
      invoices,
      total: response.paging?.total ?? response.data.length,
      page,
      limit,
    };
  }

  static async getInvoiceDownloadUrl(
    invoiceId: string,
    organizationId: string
  ): Promise<DownloadInvoiceData> {
    const subscription =
      await SubscriptionService.findByOrganizationId(organizationId);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const invoice = await Retry.withRetry(
      () => PagarmeClient.getInvoice(invoiceId),
      PAGARME_RETRY_CONFIG.READ
    );

    if (!invoice.url) {
      throw new InvoiceNotFoundError(invoiceId);
    }

    return {
      downloadUrl: invoice.url,
    };
  }

  // ============================================
  // Card Management
  // ============================================

  static async updateCard(input: UpdateCardInput): Promise<UpdateCardData> {
    const { organizationId, cardId } = input;

    const subscription =
      await SubscriptionService.findByOrganizationId(organizationId);

    if (!subscription?.pagarmeSubscriptionId) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const pagarmeSubId = subscription.pagarmeSubscriptionId;
    await Retry.withRetry(
      () =>
        PagarmeClient.updateSubscriptionCard(
          pagarmeSubId,
          cardId,
          `update-card-${organizationId}-${Date.now()}`
        ),
      PAGARME_RETRY_CONFIG.WRITE
    );

    return {
      updated: true as const,
    };
  }

  // ============================================
  // Usage
  // ============================================

  static async getUsage(input: GetUsageInput): Promise<GetUsageData> {
    const { organizationId } = input;

    const [result] = await db
      .select({
        subscription: schema.orgSubscriptions,
        plan: schema.subscriptionPlans,
        tier: schema.planPricingTiers,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .leftJoin(
        schema.planPricingTiers,
        eq(schema.orgSubscriptions.pricingTierId, schema.planPricingTiers.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!result) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const limits = result.plan.limits as PlanLimits | null;

    const [membersCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.members)
      .where(eq(schema.members.organizationId, organizationId));

    const membersCurrent = Number(membersCount.count);
    // Use tier's maxEmployees as member limit, fallback to default trial limit
    const membersLimit =
      result.tier?.maxEmployees ?? DEFAULT_TRIAL_EMPLOYEE_LIMIT;

    return {
      plan: {
        name: result.plan.name,
        displayName: result.plan.displayName,
      },
      usage: {
        members: {
          current: membersCurrent,
          limit: membersLimit,
          percentage: membersLimit
            ? Math.round((membersCurrent / membersLimit) * 100)
            : null,
        },
      },
      features: limits?.features ?? [],
    };
  }
}
