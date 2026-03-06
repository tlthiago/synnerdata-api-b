import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { employees } from "./employees";

export const acquisitionPeriodStatusEnum = pgEnum("acquisition_period_status", [
  "pending",
  "available",
  "used",
  "expired",
]);

export const vacationAcquisitionPeriods = pgTable(
  "vacation_acquisition_periods",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    acquisitionStart: date("acquisition_start").notNull(),
    acquisitionEnd: date("acquisition_end").notNull(),
    concessionStart: date("concession_start").notNull(),
    concessionEnd: date("concession_end").notNull(),

    daysEntitled: integer("days_entitled").notNull().default(30),
    daysUsed: integer("days_used").notNull().default(0),

    status: acquisitionPeriodStatusEnum("status").default("pending").notNull(),
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
    index("vap_organization_id_idx").on(table.organizationId),
    index("vap_employee_id_idx").on(table.employeeId),
    index("vap_status_idx").on(table.status),
    uniqueIndex("vap_employee_acquisition_start_idx").on(
      table.employeeId,
      table.acquisitionStart
    ),
  ]
);

export const vacationAcquisitionPeriodRelations = relations(
  vacationAcquisitionPeriods,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [vacationAcquisitionPeriods.organizationId],
      references: [organizations.id],
    }),
    employee: one(employees, {
      fields: [vacationAcquisitionPeriods.employeeId],
      references: [employees.id],
    }),
  })
);

export type VacationAcquisitionPeriod =
  typeof vacationAcquisitionPeriods.$inferSelect;
export type NewVacationAcquisitionPeriod =
  typeof vacationAcquisitionPeriods.$inferInsert;
