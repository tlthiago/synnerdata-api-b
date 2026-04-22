import { relations, sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { jobPositions } from "./job-positions";
import { ppeItems } from "./ppe-items";

export const ppeJobPositions = pgTable(
  "ppe_job_positions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ppeItemId: text("ppe_item_id")
      .notNull()
      .references(() => ppeItems.id, { onDelete: "cascade" }),
    jobPositionId: text("job_position_id")
      .notNull()
      .references(() => jobPositions.id, { onDelete: "cascade" }),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("ppe_job_positions_organization_id_idx").on(table.organizationId),
    index("ppe_job_positions_ppe_item_id_idx").on(table.ppeItemId),
    index("ppe_job_positions_job_position_id_idx").on(table.jobPositionId),
    // Unique constraint to prevent duplicate associations (only for active records)
    uniqueIndex("ppe_job_positions_unique_idx")
      .on(table.ppeItemId, table.jobPositionId)
      .where(sql`deleted_at IS NULL`),
  ]
);

export const ppeJobPositionRelations = relations(
  ppeJobPositions,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [ppeJobPositions.organizationId],
      references: [organizations.id],
    }),
    ppeItem: one(ppeItems, {
      fields: [ppeJobPositions.ppeItemId],
      references: [ppeItems.id],
    }),
    jobPosition: one(jobPositions, {
      fields: [ppeJobPositions.jobPositionId],
      references: [jobPositions.id],
    }),
    createdByUser: one(users, {
      fields: [ppeJobPositions.createdBy],
      references: [users.id],
      relationName: "ppeJobPositionCreator",
    }),
    deletedByUser: one(users, {
      fields: [ppeJobPositions.deletedBy],
      references: [users.id],
      relationName: "ppeJobPositionDeleter",
    }),
  })
);

export type PpeJobPosition = typeof ppeJobPositions.$inferSelect;
export type NewPpeJobPosition = typeof ppeJobPositions.$inferInsert;
