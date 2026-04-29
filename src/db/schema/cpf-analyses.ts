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
import { organizations, users } from "./auth";
import { employees } from "./employees";

export const cpfAnalysisStatusEnum = pgEnum("cpf_analysis_status", [
  "pending",
  "approved",
  "rejected",
  "review",
]);

export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high"]);

export const cpfAnalyses = pgTable(
  "cpf_analyses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    analysisDate: date("analysis_date").notNull(),
    status: cpfAnalysisStatusEnum("status").notNull(),
    score: integer("score"),
    riskLevel: riskLevelEnum("risk_level"),
    observations: text("observations"),
    externalReference: text("external_reference"),

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
    index("cpf_analyses_organization_id_idx").on(table.organizationId),
    index("cpf_analyses_employee_id_idx").on(table.employeeId),
    index("cpf_analyses_status_idx").on(table.status),
    index("cpf_analyses_analysis_date_idx").on(table.analysisDate),
  ]
);

export const cpfAnalysisRelations = relations(cpfAnalyses, ({ one }) => ({
  organization: one(organizations, {
    fields: [cpfAnalyses.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [cpfAnalyses.employeeId],
    references: [employees.id],
  }),
}));

export type CpfAnalysis = typeof cpfAnalyses.$inferSelect;
export type NewCpfAnalysis = typeof cpfAnalyses.$inferInsert;
