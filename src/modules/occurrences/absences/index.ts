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
  createAbsenceResponseSchema,
  createAbsenceSchema,
  deleteAbsenceResponseSchema,
  getAbsenceResponseSchema,
  idParamSchema,
  listAbsencesResponseSchema,
  updateAbsenceResponseSchema,
  updateAbsenceSchema,
} from "./absence.model";
import { AbsenceService } from "./absence.service";

export const absenceController = new Elysia({
  name: "absences",
  prefix: "/v1/absences",
  detail: { tags: ["Occurrences - Absences"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await AbsenceService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { absence: ["create"] },
        requireOrganization: true,
        requireFeature: "absences",
      },
      body: createAbsenceSchema,
      response: {
        200: createAbsenceResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create absence",
        description: "Creates a new absence record for an employee",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await AbsenceService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { absence: ["read"] },
        requireOrganization: true,
        requireFeature: "absences",
      },
      response: {
        200: listAbsencesResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List absences",
        description: "Lists all absence records for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await AbsenceService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { absence: ["read"] },
        requireOrganization: true,
        requireFeature: "absences",
      },
      params: idParamSchema,
      response: {
        200: getAbsenceResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get absence",
        description: "Gets a specific absence record by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await AbsenceService.update(
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
        permissions: { absence: ["update"] },
        requireOrganization: true,
        requireFeature: "absences",
      },
      params: idParamSchema,
      body: updateAbsenceSchema,
      response: {
        200: updateAbsenceResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update absence",
        description: "Updates a specific absence record by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await AbsenceService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { absence: ["delete"] },
        requireOrganization: true,
        requireFeature: "absences",
      },
      params: idParamSchema,
      response: {
        200: deleteAbsenceResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete absence",
        description: "Soft deletes a specific absence record by ID",
      },
    }
  );
