import { relations, sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { employees } from "./employees";
import { projects } from "./projects";

export const projectEmployees = pgTable(
  "project_employees",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text("created_by"),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    index("project_employees_organization_id_idx").on(table.organizationId),
    index("project_employees_project_id_idx").on(table.projectId),
    index("project_employees_employee_id_idx").on(table.employeeId),
    // Unique constraint to prevent duplicate employees per project (only for active records)
    uniqueIndex("project_employees_unique_idx")
      .on(table.projectId, table.employeeId)
      .where(sql`deleted_at IS NULL`),
  ]
);

export const projectEmployeeRelations = relations(
  projectEmployees,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [projectEmployees.organizationId],
      references: [organizations.id],
    }),
    project: one(projects, {
      fields: [projectEmployees.projectId],
      references: [projects.id],
    }),
    employee: one(employees, {
      fields: [projectEmployees.employeeId],
      references: [employees.id],
    }),
  })
);

export type ProjectEmployee = typeof projectEmployees.$inferSelect;
export type NewProjectEmployee = typeof projectEmployees.$inferInsert;
