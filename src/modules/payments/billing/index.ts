import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  downloadInvoiceResponseSchema,
  getUsageResponseSchema,
  invoiceIdParamsSchema,
  listInvoicesQuerySchema,
  listInvoicesResponseSchema,
  updateBillingInfoResponseSchema,
  updateBillingInfoSchema,
  updateCardResponseSchema,
  updateCardSchema,
} from "./billing.model";
import { BillingService } from "./billing.service";

export const billingController = new Elysia({
  name: "billing",
  prefix: "/billing",
  detail: { tags: ["Payments - Billing"] },
})
  .use(betterAuthPlugin)
  .get(
    "/invoices",
    ({ session, query }) =>
      BillingService.listInvoices({
        ...query,
        organizationId: session.activeOrganizationId as string,
      }),
    {
      auth: {
        permissions: { billing: ["read"] },
        requireOrganization: true,
      },
      query: listInvoicesQuerySchema,
      response: {
        200: listInvoicesResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "List invoices",
        description:
          "Lists all invoices for the organization's subscription. Returns paginated results.",
      },
    }
  )
  .get(
    "/invoices/:id/download",
    ({ session, params }) =>
      BillingService.getInvoiceDownloadUrl(
        params.id,
        session.activeOrganizationId as string
      ),
    {
      auth: {
        permissions: { billing: ["read"] },
        requireOrganization: true,
      },
      params: invoiceIdParamsSchema,
      response: {
        200: downloadInvoiceResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Download invoice",
        description: "Gets the download URL for a specific invoice.",
      },
    }
  )
  .post(
    "/update-card",
    ({ session, body }) =>
      BillingService.updateCard({
        ...body,
        organizationId: session.activeOrganizationId as string,
      }),
    {
      auth: {
        permissions: { billing: ["update"] },
        requireOrganization: true,
      },
      body: updateCardSchema,
      response: {
        200: updateCardResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Update payment card",
        description:
          "Updates the credit card for the organization's subscription. The cardId should be obtained from Pagarme.js tokenization on the frontend.",
      },
    }
  )
  .get(
    "/usage",
    ({ session }) =>
      BillingService.getUsage({
        organizationId: session.activeOrganizationId as string,
      }),
    {
      auth: {
        permissions: { billing: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: getUsageResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get usage",
        description:
          "Returns current usage vs plan limits for the organization.",
      },
    }
  )
  .put(
    "/info",
    ({ session, body }) =>
      BillingService.updateBillingInfo({
        ...body,
        organizationId: session.activeOrganizationId as string,
      }),
    {
      auth: {
        permissions: { billing: ["update"] },
        requireOrganization: true,
      },
      body: updateBillingInfoSchema,
      response: {
        200: updateBillingInfoResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Update billing info",
        description:
          "Updates billing information (tax ID, legal name, address).",
      },
    }
  );
