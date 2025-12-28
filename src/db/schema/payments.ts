import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

export interface PlanLimits {
  maxMembers?: number;
  maxProjects?: number;
  maxStorage?: number;
  features: string[];
}

export const PLAN_FEATURES = {
  trial: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
    "payroll",
  ],
  gold: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
  ],
  diamond: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
  ],
  platinum: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
    "payroll",
  ],
} as const;

export const FEATURE_DISPLAY_NAMES: Record<string, string> = {
  terminated_employees: "Demitidos",
  absences: "Faltas",
  medical_certificates: "Atestados",
  accidents: "Acidentes",
  warnings: "Advertências",
  employee_status: "Status do Trabalhador",
  birthdays: "Aniversariantes",
  ppe: "EPI",
  employee_record: "Ficha Cadastral",
  payroll: "Folha",
};

export const MAX_EMPLOYEES = 180;
export const YEARLY_DISCOUNT = 0.2; // 20% discount
export const DEFAULT_TRIAL_EMPLOYEE_LIMIT = 10; // Trial limit matches minimum tier

export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  pagarmePlanIdMonthly: text("pagarme_plan_id_monthly"),
  pagarmePlanIdYearly: text("pagarme_plan_id_yearly"),
  priceMonthly: integer("price_monthly").notNull(),
  priceYearly: integer("price_yearly").notNull(),
  trialDays: integer("trial_days").default(14).notNull(),
  limits: jsonb("limits").$type<PlanLimits>(),
  isActive: boolean("is_active").default(true).notNull(),
  isPublic: boolean("is_public").default(true).notNull(),
  isTrial: boolean("is_trial").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Pricing tiers - prices vary by employee count range
export const planPricingTiers = pgTable(
  "plan_pricing_tiers",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "cascade" }),
    minEmployees: integer("min_employees").notNull(),
    maxEmployees: integer("max_employees").notNull(),
    priceMonthly: integer("price_monthly").notNull(), // centavos
    priceYearly: integer("price_yearly").notNull(), // centavos
    pagarmePlanIdMonthly: text("pagarme_plan_id_monthly"),
    pagarmePlanIdYearly: text("pagarme_plan_id_yearly"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("plan_pricing_tiers_plan_id_idx").on(table.planId),
    index("plan_pricing_tiers_employee_range_idx").on(
      table.minEmployees,
      table.maxEmployees
    ),
  ]
);

export const orgSubscriptions = pgTable(
  "org_subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    pricingTierId: text("pricing_tier_id").references(
      () => planPricingTiers.id
    ),
    employeeCount: integer("employee_count"),
    status: subscriptionStatusEnum("status").default("trial").notNull(),
    pagarmeSubscriptionId: text("pagarme_subscription_id"),
    pagarmeCustomerId: text("pagarme_customer_id"),
    trialStart: timestamp("trial_start", { withTimezone: true }),
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    trialUsed: boolean("trial_used").default(false).notNull(),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    pastDueSince: timestamp("past_due_since", { withTimezone: true }),
    gracePeriodEnds: timestamp("grace_period_ends", { withTimezone: true }),
    billingCycle: text("billing_cycle").default("monthly"),
    pendingPlanId: text("pending_plan_id").references(
      () => subscriptionPlans.id
    ),
    pendingBillingCycle: text("pending_billing_cycle"),
    pendingPricingTierId: text("pending_pricing_tier_id").references(
      () => planPricingTiers.id
    ),
    planChangeAt: timestamp("plan_change_at", { withTimezone: true }),
    seats: integer("seats").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("org_subscriptions_organization_id_idx").on(table.organizationId),
    index("org_subscriptions_status_idx").on(table.status),
    index("org_subscriptions_pagarme_subscription_id_idx").on(
      table.pagarmeSubscriptionId
    ),
    index("org_subscriptions_plan_change_at_idx").on(table.planChangeAt),
  ]
);

export const subscriptionEvents = pgTable(
  "subscription_events",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").references(
      () => orgSubscriptions.id
    ),
    eventType: text("event_type").notNull(),
    pagarmeEventId: text("pagarme_event_id").unique(),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("subscription_events_subscription_id_idx").on(table.subscriptionId),
    index("subscription_events_pagarme_event_id_idx").on(table.pagarmeEventId),
    index("subscription_events_event_type_idx").on(table.eventType),
  ]
);

export const orgSubscriptionRelations = relations(
  orgSubscriptions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [orgSubscriptions.organizationId],
      references: [organizations.id],
    }),
    plan: one(subscriptionPlans, {
      fields: [orgSubscriptions.planId],
      references: [subscriptionPlans.id],
    }),
    pricingTier: one(planPricingTiers, {
      fields: [orgSubscriptions.pricingTierId],
      references: [planPricingTiers.id],
    }),
    events: many(subscriptionEvents),
  })
);

export const subscriptionEventRelations = relations(
  subscriptionEvents,
  ({ one }) => ({
    subscription: one(orgSubscriptions, {
      fields: [subscriptionEvents.subscriptionId],
      references: [orgSubscriptions.id],
    }),
  })
);

export const subscriptionPlanRelations = relations(
  subscriptionPlans,
  ({ many }) => ({
    subscriptions: many(orgSubscriptions),
    pricingTiers: many(planPricingTiers),
  })
);

export const planPricingTiersRelations = relations(
  planPricingTiers,
  ({ one, many }) => ({
    plan: one(subscriptionPlans, {
      fields: [planPricingTiers.planId],
      references: [subscriptionPlans.id],
    }),
    subscriptions: many(orgSubscriptions),
  })
);

export const pendingCheckoutStatusEnum = pgEnum("pending_checkout_status", [
  "pending",
  "completed",
  "expired",
]);

export const pendingCheckouts = pgTable(
  "pending_checkouts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    pricingTierId: text("pricing_tier_id").references(
      () => planPricingTiers.id
    ),
    employeeCount: integer("employee_count"),
    billingCycle: text("billing_cycle").default("monthly"),
    paymentLinkId: text("payment_link_id").notNull(),
    status: pendingCheckoutStatusEnum("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("pending_checkouts_organization_id_idx").on(table.organizationId),
    index("pending_checkouts_plan_id_idx").on(table.planId),
    index("pending_checkouts_payment_link_id_idx").on(table.paymentLinkId),
    index("pending_checkouts_status_idx").on(table.status),
  ]
);

export const pendingCheckoutRelations = relations(
  pendingCheckouts,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [pendingCheckouts.organizationId],
      references: [organizations.id],
    }),
    plan: one(subscriptionPlans, {
      fields: [pendingCheckouts.planId],
      references: [subscriptionPlans.id],
    }),
    pricingTier: one(planPricingTiers, {
      fields: [pendingCheckouts.pricingTierId],
      references: [planPricingTiers.id],
    }),
  })
);

export type OrgSubscription = typeof orgSubscriptions.$inferSelect;
export type NewOrgSubscription = typeof orgSubscriptions.$inferInsert;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type PlanPricingTier = typeof planPricingTiers.$inferSelect;
export type NewPlanPricingTier = typeof planPricingTiers.$inferInsert;
export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
export type NewSubscriptionEvent = typeof subscriptionEvents.$inferInsert;
export type PendingCheckout = typeof pendingCheckouts.$inferSelect;
export type NewPendingCheckout = typeof pendingCheckouts.$inferInsert;
