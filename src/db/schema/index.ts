import {
  accountRelations,
  accounts,
  invitationRelations,
  invitations,
  memberRelations,
  members,
  organizationRelations,
  organizations,
  sessionRelations,
  sessions,
  subscriptionRelations,
  subscriptions,
  userRelations,
  users,
  verifications,
} from "./auth";
import {
  organizationProfileRelations,
  organizationProfiles,
} from "./organization-profiles";
import {
  orgSubscriptionRelations,
  orgSubscriptions,
  pendingCheckoutRelations,
  pendingCheckouts,
  subscriptionEventRelations,
  subscriptionEvents,
  subscriptionPlanRelations,
  subscriptionPlans,
} from "./payments";

/**
 * Schema object for use in queries.
 * Access tables as schema.users, schema.organizations, etc.
 */
export const schema = {
  // Auth (Better Auth)
  users,
  sessions,
  accounts,
  verifications,
  organizations,
  members,
  invitations,
  subscriptions,
  // Organization Profiles
  organizationProfiles,
  // Payments
  orgSubscriptions,
  subscriptionEvents,
  subscriptionPlans,
  pendingCheckouts,
};

/**
 * Full schema including relations for Drizzle ORM.
 * Used internally by db/index.ts for db.query support.
 */
export const fullSchema = {
  ...schema,
  // Auth Relations
  userRelations,
  sessionRelations,
  accountRelations,
  organizationRelations,
  memberRelations,
  invitationRelations,
  subscriptionRelations,
  // Organization Profile Relations
  organizationProfileRelations,
  // Payment Relations
  orgSubscriptionRelations,
  subscriptionEventRelations,
  subscriptionPlanRelations,
  pendingCheckoutRelations,
};

// Re-export types and values
export type { Role, SystemRole } from "./auth";
export { roleValues, systemRoleValues } from "./auth";
export type {
  NewOrgSubscription,
  NewPendingCheckout,
  NewSubscriptionEvent,
  NewSubscriptionPlan,
  OrgSubscription,
  PendingCheckout,
  PlanLimits,
  SubscriptionEvent,
  SubscriptionPlan,
} from "./payments";
