import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { OrgSubscription, PlanLimits } from "@/db/schema/payments";
import {
  CustomerNotFoundError,
  InvoiceNotFoundError,
  SubscriptionNotFoundError,
} from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type {
  DownloadInvoiceResponse,
  GetUsageInput,
  GetUsageResponse,
  InvoiceData,
  ListInvoicesInput,
  ListInvoicesResponse,
  UpdateBillingInfoInput,
  UpdateBillingInfoResponse,
  UpdateCardInput,
  UpdateCardResponse,
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
  ): Promise<ListInvoicesResponse> {
    const { organizationId, page, limit } = input;

    const subscription =
      await BillingService.findSubscriptionByOrganizationId(organizationId);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    if (!subscription.pagarmeSubscriptionId) {
      return {
        success: true as const,
        data: {
          invoices: [],
          total: 0,
          page,
          limit,
        },
      };
    }

    const response = await PagarmeClient.getInvoices({
      subscriptionId: subscription.pagarmeSubscriptionId,
      page,
      size: limit,
    });

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
      success: true as const,
      data: {
        invoices,
        total: response.paging.total,
        page,
        limit,
      },
    };
  }

  static async getInvoiceDownloadUrl(
    invoiceId: string,
    organizationId: string
  ): Promise<DownloadInvoiceResponse> {
    const subscription =
      await BillingService.findSubscriptionByOrganizationId(organizationId);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const invoice = await PagarmeClient.getInvoice(invoiceId);

    if (!invoice.url) {
      throw new InvoiceNotFoundError(invoiceId);
    }

    return {
      success: true as const,
      data: {
        downloadUrl: invoice.url,
      },
    };
  }

  static async updateCard(input: UpdateCardInput): Promise<UpdateCardResponse> {
    const { organizationId, cardId } = input;

    const subscription =
      await BillingService.findSubscriptionByOrganizationId(organizationId);

    if (!subscription?.pagarmeSubscriptionId) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    await PagarmeClient.updateSubscriptionCard(
      subscription.pagarmeSubscriptionId,
      cardId
    );

    return {
      success: true as const,
      data: {
        updated: true as const,
      },
    };
  }

  static async getUsage(input: GetUsageInput): Promise<GetUsageResponse> {
    const { organizationId } = input;

    const [result] = await db
      .select({
        subscription: schema.orgSubscriptions,
        plan: schema.subscriptionPlans,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
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
    const membersLimit = limits?.maxMembers ?? null;

    return {
      success: true as const,
      data: {
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
      },
    };
  }

  static async updateBillingInfo(
    input: UpdateBillingInfoInput
  ): Promise<UpdateBillingInfoResponse> {
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
      await PagarmeClient.updateCustomer(profile.pagarmeCustomerId, {
        name: data.legalName ?? profile.legalName ?? profile.tradeName,
        document: data.taxId?.replace(/\D/g, "") ?? profile.taxId ?? undefined,
      });
    }

    return { success: true as const, data: { updated: true as const } };
  }
}
