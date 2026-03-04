import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const sectors = pgTable(
  "sectors",
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
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    index("sectors_organization_id_idx").on(table.organizationId),
    index("sectors_name_idx").on(table.name),
  ]
);

export const sectorRelations = relations(sectors, ({ one }) => ({
  organization: one(organizations, {
    fields: [sectors.organizationId],
    references: [organizations.id],
  }),
}));

export type Sector = typeof sectors.$inferSelect;
export type NewSector = typeof sectors.$inferInsert;
