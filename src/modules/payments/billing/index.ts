import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
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

export const billingController = new Elysia({
  name: "billing",
  prefix: "/billing",
  detail: { tags: ["Payments - Billing"] },
})
  .use(betterAuthPlugin)
  .post("/portal", ({ body }) => BillingService.getPortalUrl(body), {
    auth: { permissions: { subscription: ["read"] } },
    body: billingPortalBodySchema,
    response: billingPortalResponseSchema,
    detail: { summary: "Get billing portal URL" },
  })
  .get("/invoices", ({ query }) => BillingService.listInvoices(query), {
    auth: { permissions: { subscription: ["read"] } },
    query: listInvoicesQuerySchema,
    response: listInvoicesResponseSchema,
    detail: { summary: "List invoices" },
  })
  .get(
    "/invoices/:id/download",
    ({ params, query }) =>
      BillingService.getInvoiceDownloadUrl(params.id, query.organizationId),
    {
      auth: { permissions: { subscription: ["read"] } },
      params: invoiceIdParamsSchema,
      query: downloadInvoiceQuerySchema,
      response: downloadInvoiceResponseSchema,
      detail: { summary: "Get invoice download URL" },
    }
  );
