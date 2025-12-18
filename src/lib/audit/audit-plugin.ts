import { Elysia } from "elysia";
import type {
  AuditAction,
  AuditChanges,
  AuditResource,
} from "@/modules/audit/audit.model";
import { AuditService } from "@/modules/audit/audit.service";

export type AuditEntry = {
  action: AuditAction | string;
  resource: AuditResource | string;
  resourceId?: string;
  changes?: AuditChanges;
};

type AuditContext = {
  userId: string;
  organizationId?: string | null;
};

export const auditPlugin = new Elysia({ name: "audit" })
  .derive({ as: "scoped" }, ({ request }) => ({
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
