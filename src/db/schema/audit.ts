import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

/**
 * Audit Logs Table
 *
 * Stores audit trail for compliance (LGPD, labor law).
 * Records user actions across the application.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    userId: text("user_id").notNull(),
    action: text("action").notNull(), // create, read, update, delete, export, login, logout
    resource: text("resource").notNull(), // user, session, employee, organization, etc.
    resourceId: text("resource_id"),
    changes: jsonb("changes").$type<{
      before?: unknown;
      after?: unknown;
    }>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_org_date_idx").on(table.organizationId, table.createdAt),
    index("audit_logs_resource_idx").on(table.resource, table.resourceId),
    index("audit_logs_user_idx").on(table.userId, table.createdAt),
  ]
);

export const auditLogRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Type inference
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
