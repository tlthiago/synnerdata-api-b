import { auditLogRelations, auditLogs } from "./audit";
import {
  accountRelations,
  accounts,
  apikeys,
  apikeysRelations,
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
import { branches, branchRelations } from "./branches";
import {
  organizationProfileRelations,
  organizationProfiles,
} from "./organization-profiles";
import {
  orgSubscriptionRelations,
  orgSubscriptions,
  pendingCheckoutRelations,
  pendingCheckouts,
  planPricingTiers,
  planPricingTiersRelations,
  subscriptionEventRelations,
  subscriptionEvents,
  subscriptionPlanRelations,
  subscriptionPlans,
} from "./payments";

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  organizations,
  members,
  invitations,
  subscriptions,
  apikeys,
  organizationProfiles,
  branches,
  orgSubscriptions,
  subscriptionEvents,
  subscriptionPlans,
  planPricingTiers,
  pendingCheckouts,
  auditLogs,
};

export const fullSchema = {
  ...schema,
  userRelations,
  sessionRelations,
  accountRelations,
  organizationRelations,
  memberRelations,
  invitationRelations,
  subscriptionRelations,
  apikeysRelations,
  organizationProfileRelations,
  branchRelations,
  orgSubscriptionRelations,
  subscriptionEventRelations,
  subscriptionPlanRelations,
  planPricingTiersRelations,
  pendingCheckoutRelations,
  auditLogRelations,
};

export type { AuditLog, NewAuditLog } from "./audit";
export type { Role, SystemRole } from "./auth";
export { roleValues, systemRoleValues } from "./auth";
export type { Branch, NewBranch } from "./branches";
export type {
  NewOrgSubscription,
  NewPendingCheckout,
  NewPlanPricingTier,
  NewSubscriptionEvent,
  NewSubscriptionPlan,
  OrgSubscription,
  PendingCheckout,
  PlanLimits,
  PlanPricingTier,
  SubscriptionEvent,
  SubscriptionPlan,
} from "./payments";
export {
  DEFAULT_TRIAL_PLAN_NAME,
  FEATURE_DISPLAY_NAMES,
  MAX_EMPLOYEES,
  PLAN_FEATURES,
  YEARLY_DISCOUNT,
} from "./payments";
