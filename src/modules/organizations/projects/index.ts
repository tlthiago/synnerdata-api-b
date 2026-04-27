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
  addEmployeeResponseSchema,
  addEmployeeSchema,
  createProjectResponseSchema,
  createProjectSchema,
  deleteProjectResponseSchema,
  employeeIdParamsSchema,
  getProjectResponseSchema,
  idParamSchema,
  listProjectEmployeesResponseSchema,
  listProjectsResponseSchema,
  removeEmployeeResponseSchema,
  updateProjectResponseSchema,
  updateProjectSchema,
} from "./project.model";
import { ProjectService } from "./project.service";

export const projectController = new Elysia({
  name: "projects",
  prefix: "/projects",
  detail: { tags: ["Organizations - Projects"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await ProjectService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { project: ["create"] },
        requireOrganization: true,
      },
      body: createProjectSchema,
      response: {
        200: createProjectResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create project",
        description:
          "Creates a new project for the active organization. Optionally assign employees on creation.",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await ProjectService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { project: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listProjectsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List projects",
        description: "Lists all projects for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await ProjectService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { project: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getProjectResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get project",
        description: "Gets a specific project by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await ProjectService.update(
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
        permissions: { project: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updateProjectSchema,
      response: {
        200: updateProjectResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update project",
        description: "Updates a specific project by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await ProjectService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { project: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deleteProjectResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete project",
        description: "Soft deletes a specific project by ID",
      },
    }
  )
  // M2M Employee endpoints
  .get(
    "/:id/employees",
    async ({ session, params }) =>
      wrapSuccess(
        await ProjectService.getProjectEmployees(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { project: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: listProjectEmployeesResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "List project employees",
        description: "Lists all employees assigned to a project",
      },
    }
  )
  .post(
    "/:id/employees",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await ProjectService.addEmployee(
          params.id,
          body.employeeId,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { project: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: addEmployeeSchema,
      response: {
        200: addEmployeeResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: validationErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Add employee to project",
        description: "Assigns an employee to a project",
      },
    }
  )
  .delete(
    "/:id/employees/:employeeId",
    async ({ session, params, user }) => {
      await ProjectService.removeEmployee(
        params.id,
        params.employeeId,
        session.activeOrganizationId as string,
        user.id
      );
      return wrapSuccess({ success: true as const });
    },
    {
      auth: {
        permissions: { project: ["update"] },
        requireOrganization: true,
      },
      params: employeeIdParamsSchema,
      response: {
        200: removeEmployeeResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Remove employee from project",
        description: "Removes an employee assignment from a project",
      },
    }
  );
