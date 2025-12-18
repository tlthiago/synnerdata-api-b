import { relations } from "drizzle-orm";
import {
  date,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const organizationStatusEnum = pgEnum("organization_status", [
  "ACTIVE",
  "INACTIVE",
  "UNDER_REVIEW",
  "PENDING",
]);

export const organizationProfiles = pgTable(
  "organization_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tradeName: text("trade_name").notNull(),
    legalName: text("legal_name").notNull(),
    taxId: text("tax_id").notNull().unique(),
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    state: text("state"),
    zipCode: text("zip_code"),
    email: text("email"),
    phone: text("phone"),
    mobile: text("mobile").notNull(),
    taxRegime: text("tax_regime"),
    stateRegistration: text("state_registration"),
    mainActivityCode: text("main_activity_code"),
    foundingDate: date("founding_date"),
    revenue: decimal("revenue", { precision: 10, scale: 2 }),
    industry: text("industry"),
    businessArea: text("business_area"),
    maxUsers: integer("max_users").default(4),
    maxEmployees: integer("max_employees").default(10),
    logoUrl: text("logo_url"),
    pbUrl: text("pb_url"),
    pagarmeCustomerId: text("pagarme_customer_id"),
    status: organizationStatusEnum("status").default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("organization_profiles_organization_id_idx").on(table.organizationId),
    index("organization_profiles_tax_id_idx").on(table.taxId),
    index("organization_profiles_status_idx").on(table.status),
    index("organization_profiles_industry_idx").on(table.industry),
  ]
);

export const organizationProfileRelations = relations(
  organizationProfiles,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationProfiles.organizationId],
      references: [organizations.id],
    }),
  })
);
