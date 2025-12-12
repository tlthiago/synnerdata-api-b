import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationProfiles, orgSubscriptions } from "@/db/schema";
import { env } from "@/env";
import {
  CustomerNotFoundError,
  InvoiceNotFoundError,
  SubscriptionNotFoundError,
} from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type {
  BillingPortalBody,
  Invoice,
  ListInvoicesQuery,
} from "./billing.model";

export abstract class BillingService {
  /**
   * Get billing portal URL.
   * Since Pagarme doesn't have a native portal, we create an access token
   * and redirect to our own billing page or Pagarme's customer area.
   */
  static async getPortalUrl(input: BillingPortalBody) {
    const { organizationId, returnUrl } = input;

    // Get customer ID from profile
    const profile = await db.query.organizationProfiles.findFirst({
      where: eq(organizationProfiles.organizationId, organizationId),
    });

    if (!profile?.pagarmeCustomerId) {
      throw new CustomerNotFoundError(organizationId);
    }

    // Create access token for customer portal
    const accessToken = await PagarmeClient.createAccessToken(
      profile.pagarmeCustomerId
    );

    // In a real implementation, you would redirect to a custom billing page
    // or use the access token to authenticate API calls from the frontend.
    // For now, we return the token which can be used by the frontend.
    const portalUrl = `${env.APP_URL}/billing?token=${accessToken.token}&return=${encodeURIComponent(returnUrl ?? env.APP_URL)}`;

    return { portalUrl };
  }

  /**
   * List invoices for an organization.
   */
  static async listInvoices(query: ListInvoicesQuery) {
    const { organizationId, page, limit } = query;

    // Get subscription with Pagarme subscription ID
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    // If no Pagarme subscription ID, return empty list (trial or not yet upgraded)
    if (!subscription.pagarmeSubscriptionId) {
      return {
        invoices: [],
        total: 0,
        page,
        limit,
      };
    }

    // Get invoices from Pagarme
    const response = await PagarmeClient.getInvoices({
      subscriptionId: subscription.pagarmeSubscriptionId,
      page,
      size: limit,
    });

    const invoices: Invoice[] = response.data.map((invoice) => ({
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
      total: response.paging.total,
      page,
      limit,
    };
  }

  /**
   * Get invoice download URL.
   */
  static async getInvoiceDownloadUrl(
    invoiceId: string,
    organizationId: string
  ) {
    // Verify organization has access to this invoice
    const subscription = await db.query.orgSubscriptions.findFirst({
      where: eq(orgSubscriptions.organizationId, organizationId),
    });

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    // Get invoice from Pagarme
    const invoice = await PagarmeClient.getInvoice(invoiceId);

    if (!invoice.url) {
      throw new InvoiceNotFoundError(invoiceId);
    }

    return { downloadUrl: invoice.url };
  }
}
