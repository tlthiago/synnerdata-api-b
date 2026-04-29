import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { employees } from "./employees";

export const terminationTypeEnum = pgEnum("termination_type", [
  "RESIGNATION",
  "DISMISSAL_WITH_CAUSE",
  "DISMISSAL_WITHOUT_CAUSE",
  "MUTUAL_AGREEMENT",
  "CONTRACT_END",
]);

export const terminationStatusEnum = pgEnum("termination_status", [
  "scheduled",
  "completed",
  "canceled",
]);

export const terminations = pgTable(
  "terminations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    // Termination Details
    terminationDate: date("termination_date").notNull(),
    type: terminationTypeEnum("type").notNull(),
    reason: text("reason"),
    noticePeriodDays: integer("notice_period_days"),
    noticePeriodWorked: boolean("notice_period_worked")
      .default(false)
      .notNull(),
    lastWorkingDay: date("last_working_day").notNull(),
    notes: text("notes"),
    status: terminationStatusEnum("status").default("completed").notNull(),

    // Audit
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
    index("terminations_organization_id_idx").on(table.organizationId),
    index("terminations_employee_id_idx").on(table.employeeId),
    index("terminations_termination_date_idx").on(table.terminationDate),
    index("terminations_type_idx").on(table.type),
    index("terminations_status_idx").on(table.status),
  ]
);

export const terminationRelations = relations(terminations, ({ one }) => ({
  organization: one(organizations, {
    fields: [terminations.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [terminations.employeeId],
    references: [employees.id],
  }),
}));

export type Termination = typeof terminations.$inferSelect;
export type NewTermination = typeof terminations.$inferInsert;
