import {
  accounts,
  invitations,
  members,
  organizations,
  sessions,
  subscriptions,
  users,
  verifications,
} from "./auth";
import {
  organizationProfiles,
  organizationStatusEnum,
} from "./organization-profiles";
import {
  orgSubscriptionRelations,
  orgSubscriptions,
  pendingCheckoutRelations,
  pendingCheckoutStatusEnum,
  pendingCheckouts,
  subscriptionEventRelations,
  subscriptionEvents,
  subscriptionPlanRelations,
  subscriptionPlans,
  subscriptionStatusEnum,
} from "./payments";

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
  organizationStatusEnum,
  // Payments
  orgSubscriptions,
  subscriptionEvents,
  subscriptionPlans,
  subscriptionStatusEnum,
  orgSubscriptionRelations,
  subscriptionEventRelations,
  subscriptionPlanRelations,
  // Pending Checkouts
  pendingCheckouts,
  pendingCheckoutStatusEnum,
  pendingCheckoutRelations,
};

// Re-export tables for use in services
export {
  accounts,
  invitations,
  members,
  organizations,
  sessions,
  subscriptions,
  users,
  verifications,
} from "./auth";
export {
  organizationProfiles,
  organizationStatusEnum,
} from "./organization-profiles";
// Re-export types
export type { PlanLimits } from "./payments";
export * from "./payments";
