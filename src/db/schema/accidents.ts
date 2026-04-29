import { relations } from "drizzle-orm";
import { date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { employees } from "./employees";

export const accidents = pgTable(
  "accidents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    date: date("date").notNull(),
    description: text("description").notNull(),
    nature: text("nature").notNull(),
    cat: text("cat"),
    measuresTaken: text("measures_taken").notNull(),
    notes: text("notes"),

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
    index("accidents_organization_id_idx").on(table.organizationId),
    index("accidents_employee_id_idx").on(table.employeeId),
    index("accidents_date_idx").on(table.date),
  ]
);

export const accidentRelations = relations(accidents, ({ one }) => ({
  organization: one(organizations, {
    fields: [accidents.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [accidents.employeeId],
    references: [employees.id],
  }),
}));

export type Accident = typeof accidents.$inferSelect;
export type NewAccident = typeof accidents.$inferInsert;
