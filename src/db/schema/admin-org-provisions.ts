import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

export const provisionTypeEnum = pgEnum("provision_type", [
  "trial",
  "checkout",
]);

export const provisionStatusEnum = pgEnum("provision_status", [
  "pending_payment",
  "pending_activation",
  "active",
  "deleted",
]);

export const adminOrgProvisions = pgTable(
  "admin_org_provisions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    type: provisionTypeEnum("type").notNull(),
    status: provisionStatusEnum("status")
      .default("pending_activation")
      .notNull(),
    activationUrl: text("activation_url"),
    activationSentAt: timestamp("activation_sent_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    checkoutUrl: text("checkout_url"),
    checkoutExpiresAt: timestamp("checkout_expires_at", { withTimezone: true }),
    pendingCheckoutId: text("pending_checkout_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    index("admin_org_provisions_user_id_idx").on(table.userId),
    index("admin_org_provisions_organization_id_idx").on(table.organizationId),
    index("admin_org_provisions_created_by_idx").on(table.createdBy),
    index("admin_org_provisions_status_idx").on(table.status),
  ]
);

export const adminOrgProvisionRelations = relations(
  adminOrgProvisions,
  ({ one }) => ({
    user: one(users, {
      fields: [adminOrgProvisions.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [adminOrgProvisions.organizationId],
      references: [organizations.id],
    }),
  })
);

export type AdminOrgProvision = typeof adminOrgProvisions.$inferSelect;
export type NewAdminOrgProvision = typeof adminOrgProvisions.$inferInsert;
