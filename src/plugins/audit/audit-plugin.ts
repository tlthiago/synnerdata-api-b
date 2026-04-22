import { Elysia } from "elysia";
import type { AuthSession, AuthUser } from "@/lib/auth";
import type {
  AuditAction,
  AuditChanges,
  AuditResource,
} from "@/modules/audit/audit.model";
import { AuditService } from "@/modules/audit/audit.service";

export type AuditEntry = {
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  changes?: AuditChanges;
};

type AuthContext = {
  user: AuthUser;
  session: AuthSession;
  request: Request;
};

function extractIpAddress(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return headers.get("x-real-ip") ?? null;
}

export const auditPlugin = new Elysia({ name: "audit" })
  .derive({ as: "scoped" }, (ctx) => {
    const { user, session, request } = ctx as unknown as AuthContext;
    return {
      audit: (entry: AuditEntry): Promise<void> =>
        AuditService.log({
          ...entry,
          userId: user.id,
          organizationId: session.activeOrganizationId ?? null,
          ipAddress: extractIpAddress(request.headers),
          userAgent: request.headers.get("user-agent"),
        }),
    };
  })
  .as("scoped");
