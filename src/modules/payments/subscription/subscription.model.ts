import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import {
  planLimitsSchema,
  pricingTierSchema,
} from "@/modules/payments/plans/plans.model";

/**
 * Database subscription status - persisted state
 * Note: "trial" is NOT a status. Trial is determined by plan.isTrial
 */
export const dbSubscriptionStatusSchema = z.enum([
  "active",
  "past_due",
  "canceled",
  "expired",
]);

/**
 * Access status - computed state for API/frontend
 * Includes derived states like "trial" and "trial_expired"
 */
export const accessStatusSchema = z.enum([
  "trial",
  "trial_expired",
  "active",
  "past_due",
  "canceled",
  "expired",
  "no_subscription",
]);

/**
 * Response for checkAccess() - access verification result
 */
export const checkAccessDataSchema = z.object({
  hasAccess: z.boolean().describe("Whether the organization has access"),
  status: accessStatusSchema.describe("Computed access status"),
  daysRemaining: z
    .number()
    .nullable()
    .describe("Days remaining in trial/grace period"),
  trialEnd: z.coerce.date().nullable().describe("Trial end date"),
  requiresPayment: z.boolean().describe("Whether payment is required"),
});

const planDataSchema = z.object({
  id: z.string().describe("Plan ID"),
  name: z.string().describe("Plan internal name"),
  displayName: z.string().describe("Plan display name"),
  limits: planLimitsSchema.nullable().describe("Plan limits"),
});

const billingCycleSchema = z.enum(["monthly", "yearly"]);

const subscriptionDataSchema = z.object({
  id: z.string().describe("Subscription ID"),
  organizationId: z.string().describe("Organization ID"),
  status: dbSubscriptionStatusSchema.describe("Database subscription status"),
  isTrial: z.boolean().describe("Whether this is a trial subscription"),
  plan: planDataSchema.describe("Associated plan"),
  billingCycle: billingCycleSchema
    .nullable()
    .describe("Billing cycle: monthly or yearly"),
  trialStart: z.iso.datetime().nullable().describe("Trial start date"),
  trialEnd: z.iso.datetime().nullable().describe("Trial end date"),
  trialUsed: z.boolean().describe("Whether trial has been used"),
  currentPeriodStart: z.iso
    .datetime()
    .nullable()
    .describe("Current billing period start"),
  currentPeriodEnd: z.iso
    .datetime()
    .nullable()
    .describe("Current billing period end"),
  cancelAtPeriodEnd: z
    .boolean()
    .describe("Whether subscription cancels at period end"),
  canceledAt: z.iso.datetime().nullable().describe("Cancellation date"),
  seats: z.number().int().describe("Number of seats"),
  pricingTier: pricingTierSchema
    .nullable()
    .describe("Current pricing tier (null for trials without tier)"),
});

const cancelSubscriptionDataSchema = z.object({
  cancelAtPeriodEnd: z
    .boolean()
    .describe("Whether subscription cancels at period end"),
  currentPeriodEnd: z.iso
    .datetime()
    .nullable()
    .describe("Current billing period end"),
});

const restoreSubscriptionDataSchema = z.object({
  restored: z.literal(true).describe("Subscription restored successfully"),
});

export const getSubscriptionResponseSchema = successResponseSchema(
  subscriptionDataSchema
);

export const cancelSubscriptionResponseSchema = successResponseSchema(
  cancelSubscriptionDataSchema
);

export const restoreSubscriptionResponseSchema = successResponseSchema(
  restoreSubscriptionDataSchema
);

export type DbSubscriptionStatus = z.infer<typeof dbSubscriptionStatusSchema>;
export type AccessStatus = z.infer<typeof accessStatusSchema>;
export type CheckAccessData = z.infer<typeof checkAccessDataSchema>;

export type GetSubscriptionInput = {
  userId: string;
  organizationId: string;
};

export type CancelSubscriptionInput = {
  userId: string;
  organizationId: string;
};

export type RestoreSubscriptionInput = {
  userId: string;
  organizationId: string;
};

export type SubscriptionData = z.infer<typeof subscriptionDataSchema>;
export type GetSubscriptionResponse = z.infer<
  typeof getSubscriptionResponseSchema
>;
export type CancelSubscriptionResponse = z.infer<
  typeof cancelSubscriptionResponseSchema
>;
export type RestoreSubscriptionResponse = z.infer<
  typeof restoreSubscriptionResponseSchema
>;

// Data-only types for service layer
export type GetSubscriptionData = SubscriptionData;
export type CancelSubscriptionData = z.infer<
  typeof cancelSubscriptionDataSchema
>;
export type RestoreSubscriptionData = z.infer<
  typeof restoreSubscriptionDataSchema
>;
