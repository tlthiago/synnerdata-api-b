import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

export const costCenters = pgTable(
  "cost_centers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
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
    index("cost_centers_organization_id_idx").on(table.organizationId),
    index("cost_centers_name_idx").on(table.name),
  ]
);

export const costCenterRelations = relations(costCenters, ({ one }) => ({
  organization: one(organizations, {
    fields: [costCenters.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [costCenters.createdBy],
    references: [users.id],
    relationName: "costCenterCreator",
  }),
  updatedByUser: one(users, {
    fields: [costCenters.updatedBy],
    references: [users.id],
    relationName: "costCenterUpdater",
  }),
  deletedByUser: one(users, {
    fields: [costCenters.deletedBy],
    references: [users.id],
    relationName: "costCenterDeleter",
  }),
}));

export type CostCenter = typeof costCenters.$inferSelect;
export type NewCostCenter = typeof costCenters.$inferInsert;
