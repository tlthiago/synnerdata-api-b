import { Elysia } from "elysia";
import {
  billingPortalBodySchema,
  billingPortalResponseSchema,
  downloadInvoiceQuerySchema,
  downloadInvoiceResponseSchema,
  invoiceIdParamsSchema,
  listInvoicesQuerySchema,
  listInvoicesResponseSchema,
} from "./billing.model";
import { BillingService } from "./billing.service";

type AuthContext = {
  requirePermission: (
    permissions: Record<string, string[]>,
    errorMessage?: string
  ) => Promise<void>;
};

export const billingController = new Elysia({
  name: "billing",
  prefix: "/billing",
  detail: { tags: ["Payments - Billing"] },
})
  .post(
    "/portal",
    async (ctx) => {
      const { requirePermission } = ctx as unknown as AuthContext;

      // owner, manager can access billing portal
      await requirePermission(
        { subscription: ["read"] },
        "You don't have permission to access the billing portal"
      );

      return BillingService.getPortalUrl(ctx.body);
    },
    {
      body: billingPortalBodySchema,
      response: billingPortalResponseSchema,
      detail: { summary: "Get billing portal URL" },
    }
  )
  .get(
    "/invoices",
    async (ctx) => {
      const { requirePermission } = ctx as unknown as AuthContext;

      // owner, manager can view invoices
      await requirePermission(
        { subscription: ["read"] },
        "You don't have permission to view invoices"
      );

      return BillingService.listInvoices(ctx.query);
    },
    {
      query: listInvoicesQuerySchema,
      response: listInvoicesResponseSchema,
      detail: { summary: "List invoices" },
    }
  )
  .get(
    "/invoices/:id/download",
    async (ctx) => {
      const { requirePermission } = ctx as unknown as AuthContext;

      // owner, manager can download invoices
      await requirePermission(
        { subscription: ["read"] },
        "You don't have permission to download invoices"
      );

      return BillingService.getInvoiceDownloadUrl(
        ctx.params.id,
        ctx.query.organizationId
      );
    },
    {
      params: invoiceIdParamsSchema,
      query: downloadInvoiceQuerySchema,
      response: downloadInvoiceResponseSchema,
      detail: { summary: "Get invoice download URL" },
    }
  );
