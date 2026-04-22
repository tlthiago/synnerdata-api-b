import { relations, sql } from "drizzle-orm";
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { employees } from "./employees";

export const laborLawsuits = pgTable(
  "labor_lawsuits",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    // Process info
    processNumber: varchar("process_number", { length: 25 }).notNull(),
    court: varchar("court", { length: 255 }),
    filingDate: date("filing_date"),
    knowledgeDate: date("knowledge_date"),

    // Parties
    plaintiff: varchar("plaintiff", { length: 255 }).notNull(),
    defendant: varchar("defendant", { length: 255 }).notNull(),
    plaintiffLawyer: varchar("plaintiff_lawyer", { length: 255 }),
    defendantLawyer: varchar("defendant_lawyer", { length: 255 }),

    // Details
    description: text("description").notNull(),
    claimAmount: numeric("claim_amount", { precision: 12, scale: 2 }),
    progress: text("progress"),
    decision: text("decision"),
    conclusionDate: date("conclusion_date"),
    appeals: text("appeals"),
    costsExpenses: numeric("costs_expenses", { precision: 12, scale: 2 }),

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
    index("labor_lawsuits_organization_id_idx").on(table.organizationId),
    index("labor_lawsuits_employee_id_idx").on(table.employeeId),
    uniqueIndex("labor_lawsuits_process_number_unique_idx")
      .on(table.processNumber)
      .where(sql`deleted_at IS NULL`),
    index("labor_lawsuits_filing_date_idx").on(table.filingDate),
  ]
);

export const laborLawsuitRelations = relations(laborLawsuits, ({ one }) => ({
  organization: one(organizations, {
    fields: [laborLawsuits.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [laborLawsuits.employeeId],
    references: [employees.id],
  }),
  createdByUser: one(users, {
    fields: [laborLawsuits.createdBy],
    references: [users.id],
    relationName: "laborLawsuitCreator",
  }),
  updatedByUser: one(users, {
    fields: [laborLawsuits.updatedBy],
    references: [users.id],
    relationName: "laborLawsuitUpdater",
  }),
  deletedByUser: one(users, {
    fields: [laborLawsuits.deletedBy],
    references: [users.id],
    relationName: "laborLawsuitDeleter",
  }),
}));

export type LaborLawsuit = typeof laborLawsuits.$inferSelect;
export type NewLaborLawsuit = typeof laborLawsuits.$inferInsert;
