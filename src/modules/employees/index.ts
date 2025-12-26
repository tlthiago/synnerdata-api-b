import { Elysia, t } from "elysia";
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
  createEmployeeResponseSchema,
  createEmployeeSchema,
  deleteEmployeeResponseSchema,
  getEmployeeResponseSchema,
  listEmployeesResponseSchema,
  updateEmployeeResponseSchema,
  updateEmployeeSchema,
  updateEmployeeStatusSchema,
} from "./employee.model";
import { EmployeeService } from "./employee.service";

export const employeeController = new Elysia({
  name: "employees",
  prefix: "/v1/employees",
  detail: { tags: ["Employees"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await EmployeeService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { employee: ["create"] },
        requireOrganization: true,
      },
      body: createEmployeeSchema,
      response: {
        200: createEmployeeResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Create employee",
        description: "Creates a new employee for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await EmployeeService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { employee: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listEmployeesResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List employees",
        description: "Lists all employees for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await EmployeeService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { employee: ["read"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID do funcionário" }),
      }),
      response: {
        200: getEmployeeResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get employee",
        description: "Gets a specific employee by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await EmployeeService.update(
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
        permissions: { employee: ["update"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID do funcionário" }),
      }),
      body: updateEmployeeSchema,
      response: {
        200: updateEmployeeResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update employee",
        description: "Updates a specific employee by ID",
      },
    }
  )
  .patch(
    "/:id/status",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await EmployeeService.updateStatus(
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
        permissions: { employee: ["update"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID do funcionário" }),
      }),
      body: updateEmployeeStatusSchema,
      response: {
        200: updateEmployeeResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update employee status",
        description: "Updates the status of a specific employee",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await EmployeeService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { employee: ["delete"] },
        requireOrganization: true,
      },
      params: t.Object({
        id: t.String({ description: "ID do funcionário" }),
      }),
      response: {
        200: deleteEmployeeResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Delete employee",
        description: "Soft deletes a specific employee by ID",
      },
    }
  );
