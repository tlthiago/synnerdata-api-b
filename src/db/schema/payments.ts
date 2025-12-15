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
  maxMembers: number;
  maxProjects: number;
  maxStorage: number;
  features: string[];
}

export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  pagarmePlanIdMonthly: text("pagarme_plan_id_monthly"),
  pagarmePlanIdYearly: text("pagarme_plan_id_yearly"),
  priceMonthly: integer("price_monthly").notNull(),
  priceYearly: integer("price_yearly").notNull(),
  trialDays: integer("trial_days").default(14).notNull(),
  limits: jsonb("limits").$type<PlanLimits>(),
  isActive: boolean("is_active").default(true).notNull(),
  isPublic: boolean("is_public").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

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
  })
);

export type OrgSubscription = typeof orgSubscriptions.$inferSelect;
export type NewOrgSubscription = typeof orgSubscriptions.$inferInsert;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
export type NewSubscriptionEvent = typeof subscriptionEvents.$inferInsert;
export type PendingCheckout = typeof pendingCheckouts.$inferSelect;
export type NewPendingCheckout = typeof pendingCheckouts.$inferInsert;
