import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { employees } from "./employees";

export const warningTypeEnum = pgEnum("warning_type", [
  "verbal",
  "written",
  "suspension",
]);

export const warnings = pgTable(
  "warnings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    date: date("date").notNull(),
    type: warningTypeEnum("type").notNull(),
    reason: text("reason").notNull(),
    description: text("description"),
    witnessName: text("witness_name"),
    acknowledged: boolean("acknowledged").default(false).notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
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
    index("warnings_organization_id_idx").on(table.organizationId),
    index("warnings_employee_id_idx").on(table.employeeId),
    index("warnings_date_idx").on(table.date),
  ]
);

export const warningRelations = relations(warnings, ({ one }) => ({
  organization: one(organizations, {
    fields: [warnings.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [warnings.employeeId],
    references: [employees.id],
  }),
}));

export type Warning = typeof warnings.$inferSelect;
export type NewWarning = typeof warnings.$inferInsert;
