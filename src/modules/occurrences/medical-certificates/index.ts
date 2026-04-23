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
  createMedicalCertificateResponseSchema,
  createMedicalCertificateSchema,
  deleteMedicalCertificateResponseSchema,
  getMedicalCertificateResponseSchema,
  idParamSchema,
  listMedicalCertificatesResponseSchema,
  updateMedicalCertificateResponseSchema,
  updateMedicalCertificateSchema,
} from "./medical-certificates.model";
import { MedicalCertificateService } from "./medical-certificates.service";

export const medicalCertificatesController = new Elysia({
  name: "medical-certificates",
  prefix: "/medical-certificates",
  detail: { tags: ["Occurrences - Medical Certificates"] },
})
  .use(betterAuthPlugin)
  .use(auditPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await MedicalCertificateService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { medicalCertificate: ["create"] },
        requireOrganization: true,
        requireFeature: "medical_certificates",
      },
      body: createMedicalCertificateSchema,
      response: {
        200: createMedicalCertificateResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create medical certificate",
        description:
          "Creates a new medical certificate for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await MedicalCertificateService.findAll(
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { medicalCertificate: ["read"] },
        requireOrganization: true,
        requireFeature: "medical_certificates",
      },
      response: {
        200: listMedicalCertificatesResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List medical certificates",
        description:
          "Lists all medical certificates for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params, audit }) => {
      const data = await MedicalCertificateService.findByIdOrThrow(
        params.id,
        session.activeOrganizationId as string
      );
      await audit({
        action: "read",
        resource: "medical_certificate",
        resourceId: params.id,
      });
      return wrapSuccess(data);
    },
    {
      auth: {
        permissions: { medicalCertificate: ["read"] },
        requireOrganization: true,
        requireFeature: "medical_certificates",
      },
      params: idParamSchema,
      response: {
        200: getMedicalCertificateResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get medical certificate",
        description: "Gets a specific medical certificate by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await MedicalCertificateService.update(
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
        permissions: { medicalCertificate: ["update"] },
        requireOrganization: true,
        requireFeature: "medical_certificates",
      },
      params: idParamSchema,
      body: updateMedicalCertificateSchema,
      response: {
        200: updateMedicalCertificateResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update medical certificate",
        description: "Updates a specific medical certificate by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await MedicalCertificateService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { medicalCertificate: ["delete"] },
        requireOrganization: true,
        requireFeature: "medical_certificates",
      },
      params: idParamSchema,
      response: {
        200: deleteMedicalCertificateResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete medical certificate",
        description: "Soft deletes a specific medical certificate by ID",
      },
    }
  );
