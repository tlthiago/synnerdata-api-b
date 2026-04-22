import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { wrapSuccess, wrapSuccessWithMessage } from "@/lib/responses/envelope";
import {
  conflictErrorSchema,
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { betterAuthPlugin } from "@/plugins/auth/auth-plugin";
import {
  createPromotionResponseSchema,
  createPromotionSchema,
  deletePromotionResponseSchema,
  getPromotionResponseSchema,
  idParamSchema,
  listPromotionsResponseSchema,
  updatePromotionResponseSchema,
  updatePromotionSchema,
} from "./promotion.model";
import { PromotionService } from "./promotion.service";

const EMPLOYEE_SYNCED_MESSAGE =
  "Salário e cargo do funcionário foram atualizados";
const EMPLOYEE_REVERTED_MESSAGE =
  "Salário e cargo do funcionário foram revertidos para os valores anteriores";

export const promotionController = new Elysia({
  name: "promotions",
  prefix: "/v1/promotions",
  detail: { tags: ["Occurrences - Promotions"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) => {
      const result = await PromotionService.create({
        ...body,
        organizationId: session.activeOrganizationId as string,
        userId: user.id,
      });

      if (result.employeeSynced) {
        return wrapSuccessWithMessage(result.data, EMPLOYEE_SYNCED_MESSAGE);
      }

      return wrapSuccess(result.data);
    },
    {
      auth: {
        permissions: { promotion: ["create"] },
        requireOrganization: true,
      },
      body: createPromotionSchema,
      response: {
        200: createPromotionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
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
        permissions: { promotion: ["read"] },
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
        permissions: { promotion: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getPromotionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get promotion",
        description: "Gets a specific promotion by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccessWithMessage(
        await PromotionService.update(
          params.id,
          session.activeOrganizationId as string,
          {
            ...body,
            userId: user.id,
          }
        ),
        EMPLOYEE_SYNCED_MESSAGE
      ),
    {
      auth: {
        permissions: { promotion: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updatePromotionSchema,
      response: {
        200: updatePromotionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update promotion",
        description: "Updates a specific promotion by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccessWithMessage(
        await PromotionService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        ),
        EMPLOYEE_REVERTED_MESSAGE
      ),
    {
      auth: {
        permissions: { promotion: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deletePromotionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete promotion",
        description: "Soft deletes a specific promotion by ID",
      },
    }
  );
