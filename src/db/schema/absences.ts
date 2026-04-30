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
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
}));

export type Absence = typeof absences.$inferSelect;
export type NewAbsence = typeof absences.$inferInsert;
