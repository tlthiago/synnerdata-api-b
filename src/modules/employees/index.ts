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
  idParamSchema,
  listEmployeesResponseSchema,
  updateEmployeeResponseSchema,
  updateEmployeeSchema,
  updateEmployeeStatusSchema,
} from "./employee.model";
import { EmployeeService } from "./employee.service";
import { importResponseSchema } from "./import/import.model";

export const employeeController = new Elysia({
  name: "employees",
  prefix: "/v1/employees",
  detail: { tags: ["Employees"] },
})
  .use(betterAuthPlugin)
  .get(
    "/import/template",
    async ({ session }) => {
      const { TemplateService } = await import("./import/template.service");
      const buffer = await TemplateService.generate(
        session.activeOrganizationId as string
      );

      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            'attachment; filename="template-funcionarios.xlsx"',
        },
      });
    },
    {
      auth: {
        permissions: { employee: ["create"] },
        requireOrganization: true,
      },
      response: {
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "Download import template",
        description:
          "Downloads the .xlsx template for bulk employee import, populated with organization data",
      },
    }
  )
  .post(
    "/import",
    async ({ session, user, body }) => {
      const { ImportService } = await import("./import/import.service");
      const file = body.file;
      const buffer = Buffer.from(await file.arrayBuffer());

      const result = await ImportService.importFromFile({
        buffer,
        organizationId: session.activeOrganizationId as string,
        userId: user.id,
      });

      return wrapSuccess(result);
    },
    {
      auth: {
        permissions: { employee: ["create"] },
        requireOrganization: true,
      },
      body: t.Object({
        file: t.File({ default: undefined }),
      }),
      response: {
        200: importResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Import employees from Excel",
        description:
          "Imports employees from a .xlsx file. Valid rows are imported, invalid rows are reported.",
      },
    }
  )
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
      params: idParamSchema,
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
      params: idParamSchema,
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
        requireFeature: "employee_status",
      },
      params: idParamSchema,
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
      params: idParamSchema,
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
