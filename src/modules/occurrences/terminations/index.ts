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
  createTerminationResponseSchema,
  createTerminationSchema,
  deleteTerminationResponseSchema,
  getTerminationResponseSchema,
  listTerminationsResponseSchema,
  updateTerminationResponseSchema,
  updateTerminationSchema,
} from "./termination.model";
import { TerminationService } from "./termination.service";

export const terminationController = new Elysia({
  name: "terminations",
  prefix: "/v1/terminations",
  detail: { tags: ["Occurrences - Terminations"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await TerminationService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { occurrence: ["create"] },
        requireOrganization: true,
      },
      body: createTerminationSchema,
      response: {
        200: createTerminationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Create termination",
        description:
          "Creates a new termination record for an employee in the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await TerminationService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { occurrence: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listTerminationsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List terminations",
        description: "Lists all terminations for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await TerminationService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { occurrence: ["read"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID da demissão" }),
      }),
      response: {
        200: getTerminationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get termination",
        description: "Gets a specific termination by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await TerminationService.update(
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
        permissions: { occurrence: ["update"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID da demissão" }),
      }),
      body: updateTerminationSchema,
      response: {
        200: updateTerminationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update termination",
        description: "Updates a specific termination by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await TerminationService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { occurrence: ["delete"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID da demissão" }),
      }),
      response: {
        200: deleteTerminationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Delete termination",
        description: "Soft deletes a specific termination by ID",
      },
    }
  );
