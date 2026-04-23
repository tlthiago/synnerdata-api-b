import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  conflictErrorSchema,
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { betterAuthPlugin } from "@/plugins/auth/auth-plugin";
import {
  createWarningResponseSchema,
  createWarningSchema,
  deleteWarningResponseSchema,
  getWarningResponseSchema,
  idParamSchema,
  listWarningsResponseSchema,
  updateWarningResponseSchema,
  updateWarningSchema,
} from "./warning.model";
import { WarningService } from "./warning.service";

export const warningController = new Elysia({
  name: "warnings",
  prefix: "/warnings",
  detail: { tags: ["Occurrences - Warnings"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await WarningService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { warning: ["create"] },
        requireOrganization: true,
        requireFeature: "warnings",
      },
      body: createWarningSchema,
      response: {
        200: createWarningResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create warning",
        description: "Creates a new warning for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await WarningService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { warning: ["read"] },
        requireOrganization: true,
        requireFeature: "warnings",
      },
      response: {
        200: listWarningsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List warnings",
        description: "Lists all warnings for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await WarningService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { warning: ["read"] },
        requireOrganization: true,
        requireFeature: "warnings",
      },
      params: idParamSchema,
      response: {
        200: getWarningResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get warning",
        description: "Gets a specific warning by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await WarningService.update(
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
        permissions: { warning: ["update"] },
        requireOrganization: true,
        requireFeature: "warnings",
      },
      params: idParamSchema,
      body: updateWarningSchema,
      response: {
        200: updateWarningResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update warning",
        description: "Updates a specific warning by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await WarningService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { warning: ["delete"] },
        requireOrganization: true,
        requireFeature: "warnings",
      },
      params: idParamSchema,
      response: {
        200: deleteWarningResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete warning",
        description: "Soft deletes a specific warning by ID",
      },
    }
  );
