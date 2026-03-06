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
  createCpfAnalysisResponseSchema,
  createCpfAnalysisSchema,
  deleteCpfAnalysisResponseSchema,
  getCpfAnalysisResponseSchema,
  idParamSchema,
  listCpfAnalysesResponseSchema,
  updateCpfAnalysisResponseSchema,
  updateCpfAnalysisSchema,
} from "./cpf-analysis.model";
import { CpfAnalysisService } from "./cpf-analysis.service";

export const cpfAnalysisController = new Elysia({
  name: "cpf-analyses",
  prefix: "/v1/cpf-analyses",
  detail: { tags: ["Occurrences - CPF Analyses"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await CpfAnalysisService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { cpfAnalysis: ["create"] },
        requireOrganization: true,
      },
      body: createCpfAnalysisSchema,
      response: {
        200: createCpfAnalysisResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create CPF analysis",
        description: "Creates a new CPF analysis for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await CpfAnalysisService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { cpfAnalysis: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listCpfAnalysesResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List CPF analyses",
        description: "Lists all CPF analyses for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await CpfAnalysisService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { cpfAnalysis: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getCpfAnalysisResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get CPF analysis",
        description: "Gets a specific CPF analysis by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await CpfAnalysisService.update(
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
        permissions: { cpfAnalysis: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updateCpfAnalysisSchema,
      response: {
        200: updateCpfAnalysisResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update CPF analysis",
        description: "Updates a specific CPF analysis by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await CpfAnalysisService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { cpfAnalysis: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deleteCpfAnalysisResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete CPF analysis",
        description: "Soft deletes a specific CPF analysis by ID",
      },
    }
  );
