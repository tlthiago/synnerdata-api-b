import { relations } from "drizzle-orm";
import { date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { employees } from "./employees";

export const absences = pgTable(
  "absences",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    type: text("type").notNull(),
    reason: text("reason"),
    notes: text("notes"),

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
    index("absences_organization_id_idx").on(table.organizationId),
    index("absences_employee_id_idx").on(table.employeeId),
  ]
);

export const absenceRelations = relations(absences, ({ one }) => ({
  organization: one(organizations, {
    fields: [absences.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [absences.employeeId],
    references: [employees.id],
  }),
  createdByUser: one(users, {
    fields: [absences.createdBy],
    references: [users.id],
    relationName: "absenceCreator",
  }),
  updatedByUser: one(users, {
    fields: [absences.updatedBy],
    references: [users.id],
    relationName: "absenceUpdater",
  }),
  deletedByUser: one(users, {
    fields: [absences.deletedBy],
    references: [users.id],
    relationName: "absenceDeleter",
  }),
}));

export type Absence = typeof absences.$inferSelect;
export type NewAbsence = typeof absences.$inferInsert;
