import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

export const billingProfiles = pgTable(
  "billing_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    taxId: text("tax_id").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    // Billing address (can be different from organization address)
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    state: text("state"),
    zipCode: text("zip_code"),
    pagarmeCustomerId: text("pagarme_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("billing_profiles_organization_id_idx").on(table.organizationId),
    index("billing_profiles_tax_id_idx").on(table.taxId),
    index("billing_profiles_pagarme_customer_id_idx").on(
      table.pagarmeCustomerId
    ),
  ]
);

export const billingProfileRelations = relations(
  billingProfiles,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [billingProfiles.organizationId],
      references: [organizations.id],
    }),
    createdByUser: one(users, {
      fields: [billingProfiles.createdBy],
      references: [users.id],
      relationName: "billingProfileCreator",
    }),
    updatedByUser: one(users, {
      fields: [billingProfiles.updatedBy],
      references: [users.id],
      relationName: "billingProfileUpdater",
    }),
    deletedByUser: one(users, {
      fields: [billingProfiles.deletedBy],
      references: [users.id],
      relationName: "billingProfileDeleter",
    }),
  })
);

export type BillingProfile = typeof billingProfiles.$inferSelect;
export type NewBillingProfile = typeof billingProfiles.$inferInsert;
