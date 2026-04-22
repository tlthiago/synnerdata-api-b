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
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
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
  createdByUser: one(users, {
    fields: [accidents.createdBy],
    references: [users.id],
    relationName: "accidentCreator",
  }),
  updatedByUser: one(users, {
    fields: [accidents.updatedBy],
    references: [users.id],
    relationName: "accidentUpdater",
  }),
  deletedByUser: one(users, {
    fields: [accidents.deletedBy],
    references: [users.id],
    relationName: "accidentDeleter",
  }),
}));

export type Accident = typeof accidents.$inferSelect;
export type NewAccident = typeof accidents.$inferInsert;
