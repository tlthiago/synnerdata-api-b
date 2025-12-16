import { Elysia } from "elysia";
import { AuditService } from "@/modules/audit/audit.service";
import type {
  AuditAction,
  AuditChanges,
  AuditResource,
} from "@/modules/audit/audit.types";

/**
 * Audit Entry for the plugin's audit() function.
 */
export type AuditEntry = {
  action: AuditAction | string;
  resource: AuditResource | string;
  resourceId?: string;
  changes?: AuditChanges;
};

/**
 * Context required for audit logging.
 * These are typically provided by the auth macro.
 */
type AuditContext = {
  userId: string;
  organizationId?: string | null;
};

/**
 * Audit Plugin
 *
 * Provides an audit() function in the request context for logging
 * user actions. Automatically captures IP and user agent.
 *
 * Usage in controllers (with auth macro):
 * ```typescript
 * .use(auditPlugin)
 * .post("/", async ({ body, audit, user, session }) => {
 *   const result = await SomeService.create(body);
 *   await audit(
 *     { action: "create", resource: "employee", resourceId: result.id, changes: { after: result } },
 *     { userId: user.id, organizationId: session.activeOrganizationId }
 *   );
 *   return { success: true, data: result };
 * })
 * ```
 */
export const auditPlugin = new Elysia({ name: "audit" })
  .derive({ as: "scoped" }, ({ request }) => ({
    /**
     * Log an audit event.
     * @param entry - The audit entry to log
     * @param context - User context (userId, organizationId) from auth
     */
    audit: async (entry: AuditEntry, context: AuditContext): Promise<void> => {
      await AuditService.log({
        ...entry,
        userId: context.userId,
        organizationId: context.organizationId ?? null,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          null,
        userAgent: request.headers.get("user-agent"),
      });
    },
  }))
  .as("scoped");
