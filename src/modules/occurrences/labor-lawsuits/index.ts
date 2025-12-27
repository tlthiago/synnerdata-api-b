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
  createLaborLawsuitResponseSchema,
  createLaborLawsuitSchema,
  deleteLaborLawsuitResponseSchema,
  getLaborLawsuitResponseSchema,
  listLaborLawsuitsQuerySchema,
  listLaborLawsuitsResponseSchema,
  updateLaborLawsuitResponseSchema,
  updateLaborLawsuitSchema,
} from "./labor-lawsuit.model";
import { LaborLawsuitService } from "./labor-lawsuit.service";

export const laborLawsuitController = new Elysia({
  name: "labor-lawsuits",
  prefix: "/v1/labor-lawsuits",
  detail: { tags: ["Occurrences - Labor Lawsuits"] },
})
  .use(betterAuthPlugin)
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
        422: validationErrorSchema,
      },
      detail: {
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
    async ({ session, params }) =>
      wrapSuccess(
        await LaborLawsuitService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { laborLawsuit: ["read"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID da ação trabalhista" }),
      }),
      response: {
        200: getLaborLawsuitResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
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
      params: t.Object({
        id: t.String({ description: "ID da ação trabalhista" }),
      }),
      body: updateLaborLawsuitSchema,
      response: {
        200: updateLaborLawsuitResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
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
      params: t.Object({
        id: t.String({ description: "ID da ação trabalhista" }),
      }),
      response: {
        200: deleteLaborLawsuitResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Delete labor lawsuit",
        description: "Soft deletes a specific labor lawsuit by ID",
      },
    }
  );
