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
import { betterAuthPlugin } from "@/plugins/auth-guard/auth-plugin";
import {
  createCostCenterResponseSchema,
  createCostCenterSchema,
  deleteCostCenterResponseSchema,
  getCostCenterResponseSchema,
  idParamSchema,
  listCostCentersResponseSchema,
  updateCostCenterResponseSchema,
  updateCostCenterSchema,
} from "./cost-center.model";
import { CostCenterService } from "./cost-center.service";

export const costCenterController = new Elysia({
  name: "cost-centers",
  prefix: "/cost-centers",
  detail: { tags: ["Organizations - Cost Centers"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await CostCenterService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { costCenter: ["create"] },
        requireOrganization: true,
      },
      body: createCostCenterSchema,
      response: {
        200: createCostCenterResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create cost center",
        description: "Creates a new cost center for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await CostCenterService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { costCenter: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listCostCentersResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List cost centers",
        description: "Lists all cost centers for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await CostCenterService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { costCenter: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getCostCenterResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get cost center",
        description: "Gets a specific cost center by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await CostCenterService.update(
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
        permissions: { costCenter: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updateCostCenterSchema,
      response: {
        200: updateCostCenterResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update cost center",
        description: "Updates a specific cost center by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await CostCenterService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { costCenter: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deleteCostCenterResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete cost center",
        description: "Soft deletes a specific cost center by ID",
      },
    }
  );
