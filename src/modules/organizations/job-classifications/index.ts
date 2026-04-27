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
  createJobClassificationResponseSchema,
  createJobClassificationSchema,
  deleteJobClassificationResponseSchema,
  getJobClassificationResponseSchema,
  idParamSchema,
  listJobClassificationsResponseSchema,
  updateJobClassificationResponseSchema,
  updateJobClassificationSchema,
} from "./job-classification.model";
import { JobClassificationService } from "./job-classification.service";

export const jobClassificationController = new Elysia({
  name: "job-classifications",
  prefix: "/job-classifications",
  detail: { tags: ["Organizations - Job Classifications"] },
})
  .use(betterAuthPlugin)
  .use(auditPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await JobClassificationService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { jobClassification: ["create"] },
        requireOrganization: true,
      },
      body: createJobClassificationSchema,
      response: {
        200: createJobClassificationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create job classification",
        description:
          "Creates a new job classification (CBO) for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await JobClassificationService.findAll(
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { jobClassification: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listJobClassificationsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List job classifications",
        description:
          "Lists all job classifications (CBOs) for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await JobClassificationService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { jobClassification: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getJobClassificationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get job classification",
        description: "Gets a specific job classification (CBO) by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await JobClassificationService.update(
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
        permissions: { jobClassification: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updateJobClassificationSchema,
      response: {
        200: updateJobClassificationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update job classification",
        description: "Updates a specific job classification (CBO) by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await JobClassificationService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { jobClassification: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deleteJobClassificationResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete job classification",
        description: "Soft deletes a specific job classification (CBO) by ID",
      },
    }
  );
