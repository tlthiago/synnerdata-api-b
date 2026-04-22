import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { ppeDeliveries } from "./ppe-deliveries";
import { ppeItems } from "./ppe-items";

export const ppeDeliveryActionEnum = pgEnum("ppe_delivery_action", [
  "ADDED",
  "REMOVED",
]);

export const ppeDeliveryLogs = pgTable(
  "ppe_delivery_logs",
  {
    id: text("id").primaryKey(),
    ppeDeliveryId: text("ppe_delivery_id")
      .notNull()
      .references(() => ppeDeliveries.id, { onDelete: "cascade" }),
    ppeItemId: text("ppe_item_id")
      .notNull()
      .references(() => ppeItems.id, { onDelete: "cascade" }),
    action: ppeDeliveryActionEnum("action").notNull(),
    description: text("description"),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("ppe_delivery_logs_ppe_delivery_id_idx").on(table.ppeDeliveryId),
    index("ppe_delivery_logs_ppe_item_id_idx").on(table.ppeItemId),
  ]
);

export const ppeDeliveryLogRelations = relations(
  ppeDeliveryLogs,
  ({ one }) => ({
    ppeDelivery: one(ppeDeliveries, {
      fields: [ppeDeliveryLogs.ppeDeliveryId],
      references: [ppeDeliveries.id],
    }),
    ppeItem: one(ppeItems, {
      fields: [ppeDeliveryLogs.ppeItemId],
      references: [ppeItems.id],
    }),
    createdByUser: one(users, {
      fields: [ppeDeliveryLogs.createdBy],
      references: [users.id],
      relationName: "ppeDeliveryLogCreator",
    }),
  })
);

export type PpeDeliveryLog = typeof ppeDeliveryLogs.$inferSelect;
export type NewPpeDeliveryLog = typeof ppeDeliveryLogs.$inferInsert;
