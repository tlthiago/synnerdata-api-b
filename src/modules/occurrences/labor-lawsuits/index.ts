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
import { auditPlugin } from "@/plugins/audit/audit-plugin";
import { betterAuthPlugin } from "@/plugins/auth/auth-plugin";
import {
  createLaborLawsuitResponseSchema,
  createLaborLawsuitSchema,
  deleteLaborLawsuitResponseSchema,
  getLaborLawsuitResponseSchema,
  idParamSchema,
  listLaborLawsuitsQuerySchema,
  listLaborLawsuitsResponseSchema,
  updateLaborLawsuitResponseSchema,
  updateLaborLawsuitSchema,
} from "./labor-lawsuit.model";
import { LaborLawsuitService } from "./labor-lawsuit.service";

export const laborLawsuitController = new Elysia({
  name: "labor-lawsuits",
  prefix: "/labor-lawsuits",
  detail: { tags: ["Occurrences - Labor Lawsuits"] },
})
  .use(betterAuthPlugin)
  .use(auditPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await LaborLawsuitService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { laborLawsuit: ["create"] },
        requireOrganization: true,
      },
      body: createLaborLawsuitSchema,
      response: {
        200: createLaborLawsuitResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create labor lawsuit",
        description:
          "Creates a new labor lawsuit record for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session, query }) =>
      wrapSuccess(
        await LaborLawsuitService.findAll(
          session.activeOrganizationId as string,
          query.employeeId
        )
      ),
    {
      auth: {
        permissions: { laborLawsuit: ["read"] },
        requireOrganization: true,
      },
      query: listLaborLawsuitsQuerySchema,
      response: {
        200: listLaborLawsuitsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List labor lawsuits",
        description:
          "Lists all labor lawsuits for the active organization. Optionally filter by employee.",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params, audit }) => {
      const data = await LaborLawsuitService.findByIdOrThrow(
        params.id,
        session.activeOrganizationId as string
      );
      await audit({
        action: "read",
        resource: "labor_lawsuit",
        resourceId: params.id,
      });
      return wrapSuccess(data);
    },
    {
      auth: {
        permissions: { laborLawsuit: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getLaborLawsuitResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get labor lawsuit",
        description: "Gets a specific labor lawsuit by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await LaborLawsuitService.update(
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
        permissions: { laborLawsuit: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updateLaborLawsuitSchema,
      response: {
        200: updateLaborLawsuitResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update labor lawsuit",
        description: "Updates a specific labor lawsuit by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await LaborLawsuitService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { laborLawsuit: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deleteLaborLawsuitResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete labor lawsuit",
        description: "Soft deletes a specific labor lawsuit by ID",
      },
    }
  );
