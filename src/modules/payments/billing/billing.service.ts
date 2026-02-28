import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type BillingProfile, type PlanLimits, schema } from "@/db/schema";
import { billingProfiles } from "@/db/schema/billing-profiles";
import { Retry } from "@/lib/utils/retry";
import {
  BillingNotAvailableForTrialError,
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

async function syncCustomerToPagarme(
  existing: BillingProfile,
  input: UpdateProfileInput,
  organizationId: string
): Promise<void> {
  const document =
    input.taxId?.replace(/\D/g, "") ?? existing.taxId?.replace(/\D/g, "");
  const type = document && document.length === 11 ? "individual" : "company";

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

export abstract class BillingService {
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

  static async getProfileOrThrow(
    organizationId: string
  ): Promise<BillingProfile> {
    const profile = await BillingService.getProfile(organizationId);

    if (!profile) {
      throw new BillingProfileNotFoundError(organizationId);
    }

    return profile;
  }

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

  static async updateProfile(
    organizationId: string,
    input: UpdateProfileInput
  ): Promise<BillingProfile> {
    const existing = await BillingService.getProfileOrThrow(organizationId);

    const [updated] = await db
      .update(billingProfiles)
      .set({
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
      .where(eq(billingProfiles.id, existing.id))
      .returning();

    if (existing.pagarmeCustomerId) {
      await syncCustomerToPagarme(existing, input, organizationId);
    }

    return updated;
  }

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

  static async getCustomerId(organizationId: string): Promise<string | null> {
    const profile = await BillingService.getProfile(organizationId);
    return profile?.pagarmeCustomerId ?? null;
  }

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
      throw new BillingNotAvailableForTrialError(organizationId);
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

  static async updateCard(input: UpdateCardInput): Promise<UpdateCardData> {
    const { organizationId, cardId } = input;

    const subscription =
      await SubscriptionService.findByOrganizationId(organizationId);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    if (!subscription.pagarmeSubscriptionId) {
      throw new BillingNotAvailableForTrialError(organizationId);
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
