import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import type { AuditLog } from "@/db/schema";
import { schema } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { AuditLogEntry, AuditQueryOptions } from "./audit.model";

export abstract class AuditService {
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      await db.insert(schema.auditLogs).values({
        id: `audit-${Bun.randomUUIDv7()}`,
        organizationId: entry.organizationId ?? null,
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        changes: entry.changes ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      });
    } catch (error) {
      logger.error({
        type: "audit:log:failed",
        entry,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static getByOrganization(
    organizationId: string,
    options?: AuditQueryOptions
  ): Promise<AuditLog[]> {
    const conditions = [eq(schema.auditLogs.organizationId, organizationId)];

    if (options?.resource) {
      conditions.push(eq(schema.auditLogs.resource, options.resource));
    }

    if (options?.startDate) {
      const startDate =
        typeof options.startDate === "string"
          ? new Date(options.startDate)
          : options.startDate;
      conditions.push(gte(schema.auditLogs.createdAt, startDate));
    }

    if (options?.endDate) {
      const endDate =
        typeof options.endDate === "string"
          ? new Date(options.endDate)
          : options.endDate;
      conditions.push(lte(schema.auditLogs.createdAt, endDate));
    }

    return db
      .select()
      .from(schema.auditLogs)
      .where(and(...conditions))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  }

  static getByResource(
    resource: string,
    resourceId: string
  ): Promise<AuditLog[]> {
    return db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.resource, resource),
          eq(schema.auditLogs.resourceId, resourceId)
        )
      )
      .orderBy(desc(schema.auditLogs.createdAt));
  }
}
