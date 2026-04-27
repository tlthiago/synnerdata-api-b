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
import { betterAuthPlugin } from "@/plugins/auth-guard/auth-plugin";
import {
  createTerminationResponseSchema,
  createTerminationSchema,
  deleteTerminationResponseSchema,
  getTerminationResponseSchema,
  idParamSchema,
  listTerminationsResponseSchema,
  updateTerminationResponseSchema,
  updateTerminationSchema,
} from "./termination.model";
import { TerminationService } from "./termination.service";

export const terminationController = new Elysia({
  name: "terminations",
  prefix: "/terminations",
  detail: { tags: ["Occurrences - Terminations"] },
})
  .use(betterAuthPlugin)
  .use(auditPlugin)
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
        permissions: { termination: ["create"] },
        requireOrganization: true,
        requireFeature: "terminated_employees",
      },
      body: createTerminationSchema,
      response: {
        200: createTerminationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
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
        permissions: { termination: ["read"] },
        requireOrganization: true,
        requireFeature: "terminated_employees",
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
    async ({ session, params, audit }) => {
      const data = await TerminationService.findByIdOrThrow(
        params.id,
        session.activeOrganizationId as string
      );
      await audit({
        action: "read",
        resource: "termination",
        resourceId: params.id,
      });
      return wrapSuccess(data);
    },
    {
      auth: {
        permissions: { termination: ["read"] },
        requireOrganization: true,
        requireFeature: "terminated_employees",
      },
      params: idParamSchema,
      response: {
        200: getTerminationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
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
        permissions: { termination: ["update"] },
        requireOrganization: true,
        requireFeature: "terminated_employees",
      },
      params: idParamSchema,
      body: updateTerminationSchema,
      response: {
        200: updateTerminationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
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
        permissions: { termination: ["delete"] },
        requireOrganization: true,
        requireFeature: "terminated_employees",
      },
      params: idParamSchema,
      response: {
        200: deleteTerminationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete termination",
        description: "Soft deletes a specific termination by ID",
      },
    }
  );
