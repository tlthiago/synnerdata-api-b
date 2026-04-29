import { relations, sql } from "drizzle-orm";
import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

export const branches = pgTable(
  "branches",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    taxId: text("tax_id").notNull(),
    street: text("street").notNull(),
    number: text("number").notNull(),
    complement: text("complement"),
    neighborhood: text("neighborhood").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zipCode: text("zip_code").notNull(),
    phone: text("phone"),
    mobile: text("mobile").notNull(),
    foundedAt: date("founded_at"),
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
    index("branches_organization_id_idx").on(table.organizationId),
    index("branches_tax_id_idx").on(table.taxId),
    uniqueIndex("branches_tax_id_unique_idx")
      .on(table.taxId)
      .where(sql`deleted_at IS NULL`),
  ]
);

export const branchRelations = relations(branches, ({ one }) => ({
  organization: one(organizations, {
    fields: [branches.organizationId],
    references: [organizations.id],
  }),
}));

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
