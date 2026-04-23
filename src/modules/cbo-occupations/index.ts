import { Elysia } from "elysia";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { betterAuthPlugin } from "@/plugins/auth/auth-plugin";
import {
  cboOccupationIdParamSchema,
  getCboOccupationResponseSchema,
  searchCboOccupationsQuerySchema,
  searchCboOccupationsResponseSchema,
} from "./cbo-occupation.model";
import { CboOccupationService } from "./cbo-occupation.service";

export const cboOccupationController = new Elysia({
  name: "cbo-occupations",
  prefix: "/cbo-occupations",
  detail: { tags: ["CBO Occupations"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async ({ query }) =>
      wrapSuccess(
        await CboOccupationService.search(query.search, query.page, query.limit)
      ),
    {
      auth: true,
      query: searchCboOccupationsQuerySchema,
      response: {
        200: searchCboOccupationsResponseSchema,
        401: unauthorizedErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Search CBO occupations",
        description:
          "Searches official CBO occupations by code or title. Returns paginated results.",
      },
    }
  )
  .get(
    "/:id",
    async ({ params }) =>
      wrapSuccess(await CboOccupationService.findByIdOrThrow(params.id)),
    {
      auth: true,
      params: cboOccupationIdParamSchema,
      response: {
        200: getCboOccupationResponseSchema,
        401: unauthorizedErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get CBO occupation",
        description: "Gets a specific CBO occupation by ID",
      },
    }
  );
