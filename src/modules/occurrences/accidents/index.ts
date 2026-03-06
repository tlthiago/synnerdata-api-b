import { Elysia } from "elysia";
import { isProduction } from "@/env";
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
  createAccidentResponseSchema,
  createAccidentSchema,
  deleteAccidentResponseSchema,
  getAccidentResponseSchema,
  idParamSchema,
  listAccidentsResponseSchema,
  updateAccidentResponseSchema,
  updateAccidentSchema,
} from "./accident.model";
import { AccidentService } from "./accident.service";

export const accidentController = new Elysia({
  name: "accidents",
  prefix: "/v1/accidents",
  detail: { tags: ["Occurrences - Accidents"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await AccidentService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { accident: ["create"] },
        requireOrganization: true,
        requireFeature: "accidents",
      },
      body: createAccidentSchema,
      response: {
        200: createAccidentResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create accident",
        description: "Creates a new work accident for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await AccidentService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { accident: ["read"] },
        requireOrganization: true,
        requireFeature: "accidents",
      },
      response: {
        200: listAccidentsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List accidents",
        description: "Lists all work accidents for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await AccidentService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { accident: ["read"] },
        requireOrganization: true,
        requireFeature: "accidents",
      },
      params: idParamSchema,
      response: {
        200: getAccidentResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get accident",
        description: "Gets a specific work accident by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await AccidentService.update(
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
        permissions: { accident: ["update"] },
        requireOrganization: true,
        requireFeature: "accidents",
      },
      params: idParamSchema,
      body: updateAccidentSchema,
      response: {
        200: updateAccidentResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update accident",
        description: "Updates a specific work accident by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await AccidentService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { accident: ["delete"] },
        requireOrganization: true,
        requireFeature: "accidents",
      },
      params: idParamSchema,
      response: {
        200: deleteAccidentResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete accident",
        description: "Soft deletes a specific work accident by ID",
      },
    }
  );
