import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { cboOccupations } from "./cbo-occupations";

export const jobClassifications = pgTable(
  "job_classifications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cboOccupationId: text("cbo_occupation_id").references(
      () => cboOccupations.id
    ),
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
    index("job_classifications_organization_id_idx").on(table.organizationId),
    index("job_classifications_name_idx").on(table.name),
  ]
);

export const jobClassificationRelations = relations(
  jobClassifications,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [jobClassifications.organizationId],
      references: [organizations.id],
    }),
    cboOccupation: one(cboOccupations, {
      fields: [jobClassifications.cboOccupationId],
      references: [cboOccupations.id],
    }),
  })
);

export type JobClassification = typeof jobClassifications.$inferSelect;
export type NewJobClassification = typeof jobClassifications.$inferInsert;
