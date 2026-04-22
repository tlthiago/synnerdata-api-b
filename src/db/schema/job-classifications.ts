import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
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
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
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
    createdByUser: one(users, {
      fields: [jobClassifications.createdBy],
      references: [users.id],
      relationName: "jobClassificationCreator",
    }),
    updatedByUser: one(users, {
      fields: [jobClassifications.updatedBy],
      references: [users.id],
      relationName: "jobClassificationUpdater",
    }),
    deletedByUser: one(users, {
      fields: [jobClassifications.deletedBy],
      references: [users.id],
      relationName: "jobClassificationDeleter",
    }),
  })
);

export type JobClassification = typeof jobClassifications.$inferSelect;
export type NewJobClassification = typeof jobClassifications.$inferInsert;
