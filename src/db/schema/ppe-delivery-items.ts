import { relations, sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { ppeDeliveries } from "./ppe-deliveries";
import { ppeItems } from "./ppe-items";

export const ppeDeliveryItems = pgTable(
  "ppe_delivery_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ppeDeliveryId: text("ppe_delivery_id")
      .notNull()
      .references(() => ppeDeliveries.id, { onDelete: "cascade" }),
    ppeItemId: text("ppe_item_id")
      .notNull()
      .references(() => ppeItems.id, { onDelete: "cascade" }),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("ppe_delivery_items_organization_id_idx").on(table.organizationId),
    index("ppe_delivery_items_ppe_delivery_id_idx").on(table.ppeDeliveryId),
    index("ppe_delivery_items_ppe_item_id_idx").on(table.ppeItemId),
    // Unique constraint to prevent duplicate items per delivery (only for active records)
    uniqueIndex("ppe_delivery_items_unique_idx")
      .on(table.ppeDeliveryId, table.ppeItemId)
      .where(sql`deleted_at IS NULL`),
  ]
);

export const ppeDeliveryItemRelations = relations(
  ppeDeliveryItems,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [ppeDeliveryItems.organizationId],
      references: [organizations.id],
    }),
    ppeDelivery: one(ppeDeliveries, {
      fields: [ppeDeliveryItems.ppeDeliveryId],
      references: [ppeDeliveries.id],
    }),
    ppeItem: one(ppeItems, {
      fields: [ppeDeliveryItems.ppeItemId],
      references: [ppeItems.id],
    }),
    createdByUser: one(users, {
      fields: [ppeDeliveryItems.createdBy],
      references: [users.id],
      relationName: "ppeDeliveryItemCreator",
    }),
    deletedByUser: one(users, {
      fields: [ppeDeliveryItems.deletedBy],
      references: [users.id],
      relationName: "ppeDeliveryItemDeleter",
    }),
  })
);

export type PpeDeliveryItem = typeof ppeDeliveryItems.$inferSelect;
export type NewPpeDeliveryItem = typeof ppeDeliveryItems.$inferInsert;
