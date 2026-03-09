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
  createSectorResponseSchema,
  createSectorSchema,
  deleteSectorResponseSchema,
  getSectorResponseSchema,
  idParamSchema,
  listSectorsResponseSchema,
  updateSectorResponseSchema,
  updateSectorSchema,
} from "./sector.model";
import { SectorService } from "./sector.service";

export const sectorController = new Elysia({
  name: "sectors",
  prefix: "/v1/sectors",
  detail: { tags: ["Organizations - Sectors"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await SectorService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { sector: ["create"] },
        requireOrganization: true,
      },
      body: createSectorSchema,
      response: {
        200: createSectorResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create sector",
        description: "Creates a new sector for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await SectorService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { sector: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listSectorsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List sectors",
        description: "Lists all sectors for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await SectorService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { sector: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getSectorResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get sector",
        description: "Gets a specific sector by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await SectorService.update(
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
        permissions: { sector: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updateSectorSchema,
      response: {
        200: updateSectorResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update sector",
        description: "Updates a specific sector by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await SectorService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { sector: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deleteSectorResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete sector",
        description: "Soft deletes a specific sector by ID",
      },
    }
  );
