import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { ppeJobPositions } from "./ppe-job-positions";

export const jobPositions = pgTable(
  "job_positions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
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
    index("job_positions_organization_id_idx").on(table.organizationId),
    index("job_positions_name_idx").on(table.name),
  ]
);

export const jobPositionRelations = relations(
  jobPositions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [jobPositions.organizationId],
      references: [organizations.id],
    }),
    ppeItems: many(ppeJobPositions),
  })
);

export type JobPosition = typeof jobPositions.$inferSelect;
export type NewJobPosition = typeof jobPositions.$inferInsert;
