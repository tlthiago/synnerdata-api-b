import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  conflictErrorSchema,
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  createProfileSchema,
  downloadInvoiceResponseSchema,
  getUsageResponseSchema,
  invoiceIdParamsSchema,
  listInvoicesQuerySchema,
  listInvoicesResponseSchema,
  profileResponseSchema,
  updateCardResponseSchema,
  updateCardSchema,
  updateProfileSchema,
} from "./billing.model";
import { BillingService } from "./billing.service";

export const billingController = new Elysia({
  name: "billing",
  prefix: "/billing",
  detail: { tags: ["Payments - Billing"] },
})
  .use(betterAuthPlugin)
  .get(
    "/profile",
    async ({ session }) => {
      const profile = await BillingService.getProfileOrThrow(
        session.activeOrganizationId as string
      );
      return wrapSuccess(profile);
    },
    {
      auth: {
        permissions: { billing: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: profileResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get billing profile",
        description: "Gets the billing profile for the current organization.",
      },
    }
  )
  .post(
    "/profile",
    async ({ session, body }) => {
      const profile = await BillingService.createProfile(
        session.activeOrganizationId as string,
        body
      );
      return wrapSuccess(profile);
    },
    {
      auth: {
        permissions: { billing: ["update"] },
        requireOrganization: true,
      },
      body: createProfileSchema,
      response: {
        200: profileResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Create billing profile",
        description: "Creates a billing profile for the current organization.",
      },
    }
  )
  .patch(
    "/profile",
    async ({ session, body }) => {
      const profile = await BillingService.updateProfile(
        session.activeOrganizationId as string,
        body
      );
      return wrapSuccess(profile);
    },
    {
      auth: {
        permissions: { billing: ["update"] },
        requireOrganization: true,
      },
      body: updateProfileSchema,
      response: {
        200: profileResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update billing profile",
        description:
          "Updates the billing profile for the current organization. Syncs with Pagarme if customer exists.",
      },
    }
  )
  .get(
    "/invoices",
    async ({ session, query }) =>
      wrapSuccess(
        await BillingService.listInvoices({
          ...query,
          organizationId: session.activeOrganizationId as string,
        })
      ),
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
    async ({ session, params }) =>
      wrapSuccess(
        await BillingService.getInvoiceDownloadUrl(
          params.id,
          session.activeOrganizationId as string
        )
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
    async ({ session, body }) =>
      wrapSuccess(
        await BillingService.updateCard({
          ...body,
          organizationId: session.activeOrganizationId as string,
        })
      ),
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
    async ({ session }) =>
      wrapSuccess(
        await BillingService.getUsage({
          organizationId: session.activeOrganizationId as string,
        })
      ),
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
  );
