import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  getOrganizationDetailsResponseSchema,
  listOrganizationsQuerySchema,
  listOrganizationsResponseSchema,
  organizationIdParamSchema,
  updatePowerBiUrlResponseSchema,
  updatePowerBiUrlSchema,
} from "./admin-organization.model";
import { AdminOrganizationService } from "./admin-organization.service";

export const adminOrganizationsController = new Elysia({
  name: "admin-organizations",
  prefix: "/v1/admin/organizations",
  detail: { tags: ["Organizations (Admin)"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async ({ query }) =>
      wrapSuccess(
        await AdminOrganizationService.list({
          page: query.page,
          limit: query.limit,
          search: query.search,
        })
      ),
    {
      auth: { requireAdmin: true },
      query: listOrganizationsQuerySchema,
      response: {
        200: listOrganizationsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List all organizations",
        description:
          "List all organizations with pagination and search. Only admins can access this endpoint.",
      },
    }
  )
  .get(
    "/:id",
    async ({ params }) =>
      wrapSuccess(await AdminOrganizationService.getDetails(params.id)),
    {
      auth: { requireAdmin: true },
      params: organizationIdParamSchema,
      response: {
        200: getOrganizationDetailsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get organization details",
        description:
          "Admin-only endpoint to get full details of an organization, including profile, members, and subscription.",
      },
    }
  )
  .put(
    "/:id/power-bi-url",
    async ({ params, body }) =>
      wrapSuccess(
        await AdminOrganizationService.updatePowerBiUrl(params.id, body)
      ),
    {
      auth: { requireAdmin: true },
      params: organizationIdParamSchema,
      body: updatePowerBiUrlSchema,
      response: {
        200: updatePowerBiUrlResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update Power BI URL",
        description:
          "Admin-only endpoint to set or remove the Power BI dashboard URL for an organization.",
      },
    }
  );
