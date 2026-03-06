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
  createAcquisitionPeriodResponseSchema,
  createAcquisitionPeriodSchema,
  deleteAcquisitionPeriodResponseSchema,
  employeeIdParamSchema,
  idParamSchema,
  listAcquisitionPeriodsResponseSchema,
  listAvailableQuerySchema,
  updateAcquisitionPeriodResponseSchema,
  updateAcquisitionPeriodSchema,
} from "./acquisition-period.model";
import { AcquisitionPeriodService } from "./acquisition-period.service";

export const acquisitionPeriodController = new Elysia({
  name: "acquisition-periods",
  prefix: "/v1/vacations/acquisition-periods",
  detail: { tags: ["Occurrences - Vacation Acquisition Periods"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async ({ session, query }) =>
      wrapSuccess(
        await AcquisitionPeriodService.findAvailable(
          session.activeOrganizationId as string,
          query.employeeId
        )
      ),
    {
      auth: {
        permissions: { vacation: ["read"] },
        requireOrganization: true,
      },
      query: listAvailableQuerySchema,
      response: {
        200: listAcquisitionPeriodsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List available acquisition periods",
        description:
          "Lists available acquisition periods for an employee (for select dropdown)",
      },
    }
  )
  .get(
    "/employee/:employeeId",
    async ({ session, params }) =>
      wrapSuccess(
        await AcquisitionPeriodService.findByEmployee(
          session.activeOrganizationId as string,
          params.employeeId
        )
      ),
    {
      auth: {
        permissions: { vacation: ["read"] },
        requireOrganization: true,
      },
      params: employeeIdParamSchema,
      response: {
        200: listAcquisitionPeriodsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "List acquisition periods by employee",
        description: "Lists all acquisition periods for a specific employee",
      },
    }
  )
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await AcquisitionPeriodService.create({
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
      body: createAcquisitionPeriodSchema,
      response: {
        200: createAcquisitionPeriodResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create acquisition period",
        description: "Creates a new acquisition period manually",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await AcquisitionPeriodService.update(
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
      body: updateAcquisitionPeriodSchema,
      response: {
        200: updateAcquisitionPeriodResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update acquisition period",
        description: "Updates a specific acquisition period by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await AcquisitionPeriodService.delete(
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
        200: deleteAcquisitionPeriodResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete acquisition period",
        description: "Soft deletes a specific acquisition period by ID",
      },
    }
  );
