import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type OrgSubscription, type PlanLimits, schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import {
  CustomerNotFoundError,
  InvoiceNotFoundError,
  SubscriptionNotFoundError,
} from "@/modules/payments/errors";
import { PagarmeClient } from "@/modules/payments/pagarme/client";
import { DEFAULT_TRIAL_EMPLOYEE_LIMIT } from "@/modules/payments/plans/plans.constants";
import type {
  DownloadInvoiceData,
  GetUsageData,
  GetUsageInput,
  InvoiceData,
  ListInvoicesData,
  ListInvoicesInput,
  UpdateBillingInfoData,
  UpdateBillingInfoInput,
  UpdateCardData,
  UpdateCardInput,
} from "./billing.model";

export abstract class BillingService {
  private static async findSubscriptionByOrganizationId(
    organizationId: string
  ): Promise<OrgSubscription | null> {
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    return subscription ?? null;
  }

  private static async findProfileByOrganizationId(organizationId: string) {
    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    return profile ?? null;
  }

  static async listInvoices(
    input: ListInvoicesInput
  ): Promise<ListInvoicesData> {
    const { organizationId, page, limit } = input;

    const subscription =
      await BillingService.findSubscriptionByOrganizationId(organizationId);

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
      { maxAttempts: 3, delayMs: 500 }
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
      await BillingService.findSubscriptionByOrganizationId(organizationId);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const invoice = await Retry.withRetry(
      () => PagarmeClient.getInvoice(invoiceId),
      { maxAttempts: 3, delayMs: 500 }
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
      await BillingService.findSubscriptionByOrganizationId(organizationId);

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
      { maxAttempts: 2, delayMs: 1000 }
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

  static async updateBillingInfo(
    input: UpdateBillingInfoInput
  ): Promise<UpdateBillingInfoData> {
    const { organizationId, address, ...data } = input;

    const profile =
      await BillingService.findProfileByOrganizationId(organizationId);

    if (!profile) {
      throw new CustomerNotFoundError(organizationId);
    }

    await db
      .update(schema.organizationProfiles)
      .set({
        taxId: data.taxId ?? profile.taxId,
        legalName: data.legalName ?? profile.legalName,
        email: data.billingEmail ?? profile.email,
        phone: data.phone ?? profile.phone,
        street: address?.street ?? profile.street,
        number: address?.number ?? profile.number,
        complement: address?.complement ?? profile.complement,
        neighborhood: address?.neighborhood ?? profile.neighborhood,
        city: address?.city ?? profile.city,
        state: address?.state ?? profile.state,
        zipCode: address?.zipCode ?? profile.zipCode,
        updatedAt: new Date(),
      })
      .where(eq(schema.organizationProfiles.organizationId, organizationId));

    if (profile.pagarmeCustomerId) {
      const customerId = profile.pagarmeCustomerId;
      await Retry.withRetry(
        () =>
          PagarmeClient.updateCustomer(
            customerId,
            {
              name: data.legalName ?? profile.legalName ?? profile.tradeName,
              document:
                data.taxId?.replace(/\D/g, "") ?? profile.taxId ?? undefined,
            },
            `update-customer-${organizationId}-${Date.now()}`
          ),
        { maxAttempts: 2, delayMs: 1000 }
      );
    }

    return { updated: true as const };
  }
}
