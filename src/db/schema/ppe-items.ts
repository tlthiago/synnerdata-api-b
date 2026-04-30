import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { ppeJobPositions } from "./ppe-job-positions";

export const ppeItems = pgTable(
  "ppe_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // PPE Item fields
    name: text("name").notNull(),
    description: text("description").notNull(),
    equipment: text("equipment").notNull(),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("ppe_items_organization_id_idx").on(table.organizationId),
    index("ppe_items_name_idx").on(table.name),
  ]
);

export const ppeItemRelations = relations(ppeItems, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [ppeItems.organizationId],
    references: [organizations.id],
  }),
  jobPositions: many(ppeJobPositions),
}));

export type PpeItem = typeof ppeItems.$inferSelect;
export type NewPpeItem = typeof ppeItems.$inferInsert;
