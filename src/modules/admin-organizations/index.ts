import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  unauthorizedErrorSchema,
} from "@/lib/responses/response.types";
import {
  listOrganizationsQuerySchema,
  listOrganizationsResponseSchema,
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
  );
