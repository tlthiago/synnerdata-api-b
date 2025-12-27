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
  createJobPositionResponseSchema,
  createJobPositionSchema,
  deleteJobPositionResponseSchema,
  getJobPositionResponseSchema,
  listJobPositionsResponseSchema,
  updateJobPositionResponseSchema,
  updateJobPositionSchema,
} from "./job-position.model";
import { JobPositionService } from "./job-position.service";

export const jobPositionController = new Elysia({
  name: "job-positions",
  prefix: "/v1/job-positions",
  detail: { tags: ["Organizations - Job Positions"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await JobPositionService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { jobPosition: ["create"] },
        requireOrganization: true,
      },
      body: createJobPositionSchema,
      response: {
        200: createJobPositionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Create job position",
        description: "Creates a new job position for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await JobPositionService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { jobPosition: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listJobPositionsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List job positions",
        description: "Lists all job positions for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await JobPositionService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { jobPosition: ["read"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID do cargo" }),
      }),
      response: {
        200: getJobPositionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get job position",
        description: "Gets a specific job position by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await JobPositionService.update(
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
        permissions: { jobPosition: ["update"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID do cargo" }),
      }),
      body: updateJobPositionSchema,
      response: {
        200: updateJobPositionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update job position",
        description: "Updates a specific job position by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await JobPositionService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { jobPosition: ["delete"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID do cargo" }),
      }),
      response: {
        200: deleteJobPositionResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Delete job position",
        description: "Soft deletes a specific job position by ID",
      },
    }
  );
