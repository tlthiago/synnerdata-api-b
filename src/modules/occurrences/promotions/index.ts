import { Elysia, t } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  createPromotionResponseSchema,
  createPromotionSchema,
  deletePromotionResponseSchema,
  getPromotionResponseSchema,
  listPromotionsResponseSchema,
  updatePromotionResponseSchema,
  updatePromotionSchema,
} from "./promotion.model";
import { PromotionService } from "./promotion.service";

export const promotionController = new Elysia({
  name: "promotions",
  prefix: "/v1/promotions",
  detail: { tags: ["Occurrences - Promotions"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await PromotionService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { occurrence: ["create"] },
        requireOrganization: true,
      },
      body: createPromotionSchema,
      response: {
        200: createPromotionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Create promotion",
        description: "Creates a new promotion record for an employee",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await PromotionService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { occurrence: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listPromotionsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List promotions",
        description: "Lists all promotions for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await PromotionService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { occurrence: ["read"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID da promoção" }),
      }),
      response: {
        200: getPromotionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get promotion",
        description: "Gets a specific promotion by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await PromotionService.update(
          params.id,
          session.activeOrganizationId as string,
          {
            ...body,
            userId: user.id,
          }
        )
      ),
    {
      auth: {
        permissions: { occurrence: ["update"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID da promoção" }),
      }),
      body: updatePromotionSchema,
      response: {
        200: updatePromotionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update promotion",
        description: "Updates a specific promotion by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await PromotionService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { occurrence: ["delete"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID da promoção" }),
      }),
      response: {
        200: deletePromotionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Delete promotion",
        description: "Soft deletes a specific promotion by ID",
      },
    }
  );
