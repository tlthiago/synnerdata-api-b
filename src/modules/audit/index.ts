import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  forbiddenErrorSchema,
  unauthorizedErrorSchema,
} from "@/lib/responses/response.types";
import {
  auditQuerySchema,
  auditResourceParamsSchema,
  getAuditLogsResponseSchema,
  getAuditResourceHistoryResponseSchema,
} from "./audit.model";
import { AuditService } from "./audit.service";

export const auditController = new Elysia({
  name: "audit",
  prefix: "/audit-logs",
  detail: { tags: ["Audit"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async ({ session, query }) => {
      const logs = await AuditService.getByOrganization(
        session.activeOrganizationId as string,
        {
          resource: query.resource,
          startDate: query.startDate,
          endDate: query.endDate,
          limit: query.limit,
          offset: query.offset,
        }
      );

      return {
        success: true as const,
        data: logs,
      };
    },
    {
      auth: {
        permissions: { audit: ["read"] },
        requireOrganization: true,
      },
      query: auditQuerySchema,
      response: {
        200: getAuditLogsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "Get audit logs",
        description:
          "Returns audit logs for the organization. Only the organization owner can access this endpoint. Supports filtering by resource, date range, and pagination.",
      },
    }
  )
  .get(
    "/:resource/:resourceId",
    async ({ params }) => {
      const logs = await AuditService.getByResource(
        params.resource,
        params.resourceId
      );

      return {
        success: true as const,
        data: logs,
      };
    },
    {
      auth: {
        permissions: { audit: ["read"] },
        requireOrganization: true,
      },
      params: auditResourceParamsSchema,
      response: {
        200: getAuditResourceHistoryResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "Get resource audit history",
        description:
          "Returns the full audit history for a specific resource. Only the organization owner can access this endpoint.",
      },
    }
  );
