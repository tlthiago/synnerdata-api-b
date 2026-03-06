import { relations } from "drizzle-orm";
import {
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
import { vacationAcquisitionPeriods } from "./vacation-acquisition-periods";

export const vacationStatusEnum = pgEnum("vacation_status", [
  "scheduled",
  "in_progress",
  "completed",
  "canceled",
]);

export const vacations = pgTable(
  "vacations",
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
    daysUsed: integer("days_used").notNull(),
    acquisitionPeriodId: text("acquisition_period_id")
      .notNull()
      .references(() => vacationAcquisitionPeriods.id),

    status: vacationStatusEnum("status").default("scheduled").notNull(),
    notes: text("notes"),

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
    index("vacations_organization_id_idx").on(table.organizationId),
    index("vacations_employee_id_idx").on(table.employeeId),
    index("vacations_status_idx").on(table.status),
    index("vacations_start_date_idx").on(table.startDate),
  ]
);

export const vacationRelations = relations(vacations, ({ one }) => ({
  organization: one(organizations, {
    fields: [vacations.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [vacations.employeeId],
    references: [employees.id],
  }),
  acquisitionPeriod: one(vacationAcquisitionPeriods, {
    fields: [vacations.acquisitionPeriodId],
    references: [vacationAcquisitionPeriods.id],
  }),
}));

export type Vacation = typeof vacations.$inferSelect;
export type NewVacation = typeof vacations.$inferInsert;
