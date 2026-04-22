import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const auditActionSchema = z.enum([
  "create",
  "read",
  "update",
  "delete",
  "export",
  "login",
  "logout",
]);

export const auditResourceSchema = z.enum([
  "user",
  "session",
  "organization",
  "member",
  "employee",
  "document",
  "medical_leave",
  "subscription",
  "export",
  "api_key",
]);

export const auditChangesSchema = z
  .object({
    before: z.unknown().optional(),
    after: z.unknown().optional(),
  })
  .nullable();

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

export const auditQuerySchema = z.object({
  resource: z.string().optional().describe("Filter by resource type"),
  startDate: z.string().datetime().optional().describe("Filter by start date"),
  endDate: z.string().datetime().optional().describe("Filter by end date"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Number of results to return"),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip"),
});

export const auditResourceParamsSchema = z.object({
  resource: z.string().min(1).describe("Resource type"),
  resourceId: z.string().min(1).describe("Resource ID"),
});

export const getAuditLogsResponseSchema = successResponseSchema(
  z.array(auditLogSchema)
);

export const getAuditResourceHistoryResponseSchema = successResponseSchema(
  z.array(auditLogSchema)
);

// Types inferred from schemas
export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditResource = z.infer<typeof auditResourceSchema>;
export type AuditChanges = z.infer<typeof auditChangesSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;

// Service layer query options (all fields optional, numbers are numbers)
export type AuditQueryOptions = {
  resource?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
  offset?: number;
};

// Input type for service layer
export type AuditLogEntry = {
  action: AuditAction | string;
  resource: AuditResource | string;
  resourceId?: string;
  userId: string;
  organizationId?: string | null;
  changes?: AuditChanges;
  ipAddress?: string | null;
  userAgent?: string | null;
};
