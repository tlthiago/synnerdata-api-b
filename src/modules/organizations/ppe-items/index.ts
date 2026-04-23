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
  addJobPositionResponseSchema,
  addJobPositionSchema,
  createPpeItemResponseSchema,
  createPpeItemSchema,
  deletePpeItemResponseSchema,
  getPpeItemResponseSchema,
  idParamSchema,
  jobPositionIdParamsSchema,
  listJobPositionsResponseSchema,
  listPpeItemsResponseSchema,
  removeJobPositionResponseSchema,
  updatePpeItemResponseSchema,
  updatePpeItemSchema,
} from "./ppe-item.model";
import { PpeItemService } from "./ppe-item.service";

export const ppeItemController = new Elysia({
  name: "ppe-items",
  prefix: "/ppe-items",
  detail: { tags: ["Organizations - PPE Items"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await PpeItemService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { ppeItem: ["create"] },
        requireOrganization: true,
      },
      body: createPpeItemSchema,
      response: {
        200: createPpeItemResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create PPE item",
        description: "Creates a new PPE item for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await PpeItemService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { ppeItem: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listPpeItemsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List PPE items",
        description: "Lists all PPE items for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await PpeItemService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { ppeItem: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getPpeItemResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get PPE item",
        description: "Gets a specific PPE item by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await PpeItemService.update(
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
        permissions: { ppeItem: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updatePpeItemSchema,
      response: {
        200: updatePpeItemResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update PPE item",
        description: "Updates a specific PPE item by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await PpeItemService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { ppeItem: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deletePpeItemResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete PPE item",
        description: "Soft deletes a specific PPE item by ID",
      },
    }
  )
  // M2M Job Position endpoints
  .post(
    "/:id/job-positions",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await PpeItemService.addJobPosition(
          params.id,
          body.jobPositionId,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { ppeItem: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: addJobPositionSchema,
      response: {
        200: addJobPositionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: validationErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Add job position to PPE item",
        description: "Associates a job position with a PPE item",
      },
    }
  )
  .get(
    "/:id/job-positions",
    async ({ session, params }) =>
      wrapSuccess(
        await PpeItemService.getJobPositions(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { ppeItem: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: listJobPositionsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "List job positions for PPE item",
        description: "Lists all job positions associated with a PPE item",
      },
    }
  )
  .delete(
    "/:id/job-positions/:jobPositionId",
    async ({ session, params, user }) => {
      await PpeItemService.removeJobPosition(
        params.id,
        params.jobPositionId,
        session.activeOrganizationId as string,
        user.id
      );
      return wrapSuccess({ success: true });
    },
    {
      auth: {
        permissions: { ppeItem: ["update"] },
        requireOrganization: true,
      },
      params: jobPositionIdParamsSchema,
      response: {
        200: removeJobPositionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Remove job position from PPE item",
        description: "Removes a job position association from a PPE item",
      },
    }
  );
