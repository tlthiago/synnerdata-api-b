import { t } from "elysia";
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// Audit action enum
export const auditActionSchema = z.enum([
  "create",
  "read",
  "update",
  "delete",
  "export",
  "login",
  "logout",
]);

// Audit changes schema
export const auditChangesSchema = z
  .object({
    before: z.unknown().optional(),
    after: z.unknown().optional(),
  })
  .nullable();

// Audit log entry schema
export const auditLogSchema = z.object({
  id: z.string().describe("Audit log ID"),
  organizationId: z.string().nullable().describe("Organization ID"),
  userId: z.string().describe("User who performed the action"),
  action: z.string().describe("Action performed (create, read, update, etc)"),
  resource: z.string().describe("Resource type (employee, document, etc)"),
  resourceId: z.string().nullable().describe("Resource ID"),
  changes: auditChangesSchema.describe("Changes made (before/after)"),
  ipAddress: z.string().nullable().describe("IP address of the request"),
  userAgent: z.string().nullable().describe("User agent of the request"),
  createdAt: z.coerce.date().describe("When the action was performed"),
});

// Query parameters schema for Elysia
export const auditQuerySchema = t.Object({
  resource: t.Optional(t.String({ description: "Filter by resource type" })),
  startDate: t.Optional(
    t.String({ format: "date-time", description: "Filter by start date" })
  ),
  endDate: t.Optional(
    t.String({ format: "date-time", description: "Filter by end date" })
  ),
  limit: t.Optional(
    t.Number({
      default: 50,
      minimum: 1,
      maximum: 100,
      description: "Number of results to return",
    })
  ),
  offset: t.Optional(
    t.Number({
      default: 0,
      minimum: 0,
      description: "Number of results to skip",
    })
  ),
});

// Params schema for resource history endpoint
export const auditResourceParamsSchema = t.Object({
  resource: t.String({ description: "Resource type" }),
  resourceId: t.String({ description: "Resource ID" }),
});

// Response schemas
export const getAuditLogsResponseSchema = successResponseSchema(
  z.array(auditLogSchema)
);

export const getAuditResourceHistoryResponseSchema = successResponseSchema(
  z.array(auditLogSchema)
);

// Types
export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditAction = z.infer<typeof auditActionSchema>;
