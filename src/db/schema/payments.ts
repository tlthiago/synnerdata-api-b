import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "expired",
]);

export type PlanLimits = {
  features: string[];
};

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    trialDays: integer("trial_days").default(0).notNull(),
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
    organizationId: text("organization_id").references(() => organizations.id),
    basePlanId: text("base_plan_id").references(
      (): AnyPgColumn => subscriptionPlans.id
    ),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("subscription_plans_organization_id_idx").on(table.organizationId),
    index("subscription_plans_base_plan_id_idx").on(table.basePlanId),
    index("subscription_plans_archived_at_idx").on(table.archivedAt),
  ]
);

export const planPricingTiers = pgTable(
  "plan_pricing_tiers",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "restrict" }),
    minEmployees: integer("min_employees").notNull(),
    maxEmployees: integer("max_employees").notNull(),
    priceMonthly: integer("price_monthly").notNull(),
    priceYearly: integer("price_yearly").notNull(),
    pagarmePlanIdMonthly: text("pagarme_plan_id_monthly"),
    pagarmePlanIdYearly: text("pagarme_plan_id_yearly"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
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
      () => planPricingTiers.id,
      { onDelete: "restrict" }
    ),
    status: subscriptionStatusEnum("status").default("active").notNull(),
    pagarmeSubscriptionId: text("pagarme_subscription_id"),
    pagarmeUpdatedAt: timestamp("pagarme_updated_at", { withTimezone: true }),
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
      () => planPricingTiers.id,
      { onDelete: "restrict" }
    ),
    planChangeAt: timestamp("plan_change_at", { withTimezone: true }),
    seats: integer("seats").default(1).notNull(),
    priceAtPurchase: integer("price_at_purchase"),
    isCustomPrice: boolean("is_custom_price").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("org_subscriptions_organization_id_active_unique_idx")
      .on(table.organizationId)
      .where(sql`status NOT IN ('canceled', 'expired')`),
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
  ({ one, many }) => ({
    subscriptions: many(orgSubscriptions),
    pricingTiers: many(planPricingTiers),
    organization: one(organizations, {
      fields: [subscriptionPlans.organizationId],
      references: [organizations.id],
    }),
    basePlan: one(subscriptionPlans, {
      fields: [subscriptionPlans.basePlanId],
      references: [subscriptionPlans.id],
      relationName: "basePlan",
    }),
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

export const adjustmentTypeEnum = pgEnum("adjustment_type", [
  "individual",
  "bulk",
]);

export const priceAdjustments = pgTable(
  "price_adjustments",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => orgSubscriptions.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    oldPrice: integer("old_price").notNull(),
    newPrice: integer("new_price").notNull(),
    reason: text("reason").notNull(),
    adjustmentType: adjustmentTypeEnum("adjustment_type").notNull(),
    billingCycle: text("billing_cycle").notNull(),
    pricingTierId: text("pricing_tier_id").references(
      () => planPricingTiers.id,
      { onDelete: "set null" }
    ),
    adminId: text("admin_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("price_adjustments_subscription_id_idx").on(table.subscriptionId),
    index("price_adjustments_organization_id_idx").on(table.organizationId),
    index("price_adjustments_admin_id_idx").on(table.adminId),
    index("price_adjustments_created_at_idx").on(table.createdAt),
  ]
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
      () => planPricingTiers.id,
      { onDelete: "restrict" }
    ),
    billingCycle: text("billing_cycle").default("monthly"),
    paymentLinkId: text("payment_link_id").notNull(),
    status: pendingCheckoutStatusEnum("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    customPriceMonthly: integer("custom_price_monthly"),
    customPriceYearly: integer("custom_price_yearly"),
    createdByAdminId: text("created_by_admin_id"),
    notes: text("notes"),
    pagarmePlanId: text("pagarme_plan_id"),
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

export const pagarmePlanHistory = pgTable(
  "pagarme_plan_history",
  {
    id: text("id").primaryKey(),
    localPlanId: text("local_plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "restrict" }),
    // No FK to planPricingTiers — tiers are archived (soft delete) on replaceTiers().
    // No FK needed: history records track all Pagar.me plans independently of tier lifecycle.
    localTierId: text("local_tier_id").notNull(),
    pagarmePlanId: text("pagarme_plan_id").notNull(),
    billingCycle: text("billing_cycle").notNull(),
    priceAtCreation: integer("price_at_creation").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("pagarme_plan_history_is_active_idx").on(table.isActive),
    index("pagarme_plan_history_pagarme_plan_id_idx").on(table.pagarmePlanId),
    index("pagarme_plan_history_local_plan_id_idx").on(table.localPlanId),
  ]
);

export const pagarmePlanHistoryRelations = relations(
  pagarmePlanHistory,
  ({ one }) => ({
    plan: one(subscriptionPlans, {
      fields: [pagarmePlanHistory.localPlanId],
      references: [subscriptionPlans.id],
    }),
  })
);

export const priceAdjustmentRelations = relations(
  priceAdjustments,
  ({ one }) => ({
    subscription: one(orgSubscriptions, {
      fields: [priceAdjustments.subscriptionId],
      references: [orgSubscriptions.id],
    }),
    organization: one(organizations, {
      fields: [priceAdjustments.organizationId],
      references: [organizations.id],
    }),
    pricingTier: one(planPricingTiers, {
      fields: [priceAdjustments.pricingTierId],
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
export type PagarmePlanHistoryRecord = typeof pagarmePlanHistory.$inferSelect;
export type NewPagarmePlanHistoryRecord =
  typeof pagarmePlanHistory.$inferInsert;
export type PriceAdjustment = typeof priceAdjustments.$inferSelect;
export type NewPriceAdjustment = typeof priceAdjustments.$inferInsert;
