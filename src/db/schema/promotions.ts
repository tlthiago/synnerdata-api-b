import { relations } from "drizzle-orm";
import {
  date,
  decimal,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { employees } from "./employees";
import { jobPositions } from "./job-positions";

export const promotions = pgTable(
  "promotions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    // Promotion details
    promotionDate: date("promotion_date").notNull(),
    previousJobPositionId: text("previous_job_position_id")
      .notNull()
      .references(() => jobPositions.id),
    newJobPositionId: text("new_job_position_id")
      .notNull()
      .references(() => jobPositions.id),
    previousSalary: decimal("previous_salary", {
      precision: 12,
      scale: 2,
    }).notNull(),
    newSalary: decimal("new_salary", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason"),
    notes: text("notes"),

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

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    index("promotions_organization_id_idx").on(table.organizationId),
    index("promotions_employee_id_idx").on(table.employeeId),
  ]
);

export const promotionRelations = relations(promotions, ({ one }) => ({
  organization: one(organizations, {
    fields: [promotions.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [promotions.employeeId],
    references: [employees.id],
  }),
  previousJobPosition: one(jobPositions, {
    fields: [promotions.previousJobPositionId],
    references: [jobPositions.id],
    relationName: "previousPosition",
  }),
  newJobPosition: one(jobPositions, {
    fields: [promotions.newJobPositionId],
    references: [jobPositions.id],
    relationName: "newPosition",
  }),
}));

export type Promotion = typeof promotions.$inferSelect;
export type NewPromotion = typeof promotions.$inferInsert;
