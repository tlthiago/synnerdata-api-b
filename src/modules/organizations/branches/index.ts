import { Elysia } from "elysia";
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
  createBranchResponseSchema,
  createBranchSchema,
  deleteBranchResponseSchema,
  getBranchResponseSchema,
  idParamSchema,
  listBranchesResponseSchema,
  updateBranchResponseSchema,
  updateBranchSchema,
} from "./branch.model";
import { BranchService } from "./branch.service";

export const branchController = new Elysia({
  name: "branches",
  prefix: "/v1/branches",
  detail: { tags: ["Organizations - Branches"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await BranchService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { branch: ["create"] },
        requireOrganization: true,
      },
      body: createBranchSchema,
      response: {
        200: createBranchResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Create branch",
        description: "Creates a new branch for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await BranchService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { branch: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listBranchesResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List branches",
        description: "Lists all branches for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await BranchService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { branch: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getBranchResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get branch",
        description: "Gets a specific branch by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await BranchService.update(
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
        permissions: { branch: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updateBranchSchema,
      response: {
        200: updateBranchResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update branch",
        description: "Updates a specific branch by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await BranchService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { branch: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deleteBranchResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Delete branch",
        description: "Soft deletes a specific branch by ID",
      },
    }
  );
