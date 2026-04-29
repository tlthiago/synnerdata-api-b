import { relations } from "drizzle-orm";
import { date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { employees } from "./employees";

export const ppeDeliveries = pgTable(
  "ppe_deliveries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    // Delivery fields
    deliveryDate: date("delivery_date").notNull(),
    reason: text("reason").notNull(),
    deliveredBy: text("delivered_by").notNull(),

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
    index("ppe_deliveries_organization_id_idx").on(table.organizationId),
    index("ppe_deliveries_employee_id_idx").on(table.employeeId),
    index("ppe_deliveries_delivery_date_idx").on(table.deliveryDate),
  ]
);

export const ppeDeliveryRelations = relations(ppeDeliveries, ({ one }) => ({
  organization: one(organizations, {
    fields: [ppeDeliveries.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [ppeDeliveries.employeeId],
    references: [employees.id],
  }),
}));

export type PpeDelivery = typeof ppeDeliveries.$inferSelect;
export type NewPpeDelivery = typeof ppeDeliveries.$inferInsert;
