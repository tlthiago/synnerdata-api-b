import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { planLimitsSchema } from "@/modules/payments/plans/plans.model";

export const subscriptionStatusSchema = z.enum([
  "trial",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

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
  status: subscriptionStatusSchema.describe("Subscription status"),
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

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

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
