import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { acquisitionPeriodController } from "./acquisition-periods";
import {
  createVacationResponseSchema,
  createVacationSchema,
  deleteVacationResponseSchema,
  getVacationResponseSchema,
  idParamSchema,
  listVacationsResponseSchema,
  updateVacationResponseSchema,
  updateVacationSchema,
} from "./vacation.model";
import { VacationService } from "./vacation.service";

export const vacationController = new Elysia({
  name: "vacations",
  prefix: "/v1/vacations",
  detail: { tags: ["Occurrences - Vacations"] },
})
  .use(betterAuthPlugin)
  .use(acquisitionPeriodController)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await VacationService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { vacation: ["create"] },
        requireOrganization: true,
      },
      body: createVacationSchema,
      response: {
        200: createVacationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create vacation",
        description: "Creates a new vacation for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await VacationService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { vacation: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listVacationsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List vacations",
        description: "Lists all vacations for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await VacationService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { vacation: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getVacationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get vacation",
        description: "Gets a specific vacation by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await VacationService.update(
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
        permissions: { vacation: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updateVacationSchema,
      response: {
        200: updateVacationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update vacation",
        description: "Updates a specific vacation by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await VacationService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { vacation: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deleteVacationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete vacation",
        description: "Soft deletes a specific vacation by ID",
      },
    }
  );
