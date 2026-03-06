import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const cboOccupations = pgTable(
  "cbo_occupations",
  {
    id: text("id").primaryKey(),
    code: varchar("code", { length: 7 }).notNull(),
    title: text("title").notNull(),
    familyCode: varchar("family_code", { length: 4 }).notNull(),
    familyTitle: text("family_title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("cbo_occupations_code_idx").on(table.code),
    index("cbo_occupations_title_idx").on(table.title),
    index("cbo_occupations_family_code_idx").on(table.familyCode),
  ]
);

export type CboOccupation = typeof cboOccupations.$inferSelect;
export type NewCboOccupation = typeof cboOccupations.$inferInsert;
