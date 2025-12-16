/**
 * Audit Log Types
 *
 * Types for the audit logging system.
 */

export type AuditAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "export"
  | "login"
  | "logout";

export type AuditResource =
  | "user"
  | "session"
  | "organization"
  | "member"
  | "employee"
  | "document"
  | "medical_leave"
  | "subscription"
  | "export";

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

export type AuditChanges = {
  before?: unknown;
  after?: unknown;
};

export type AuditQueryOptions = {
  resource?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
  offset?: number;
};
