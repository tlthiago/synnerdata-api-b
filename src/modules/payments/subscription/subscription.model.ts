import { z } from "zod";
import { planLimitsSchema } from "../plan/plan.model";

// ============================================================
// ENUMS
// ============================================================

export const subscriptionStatusSchema = z.enum([
  "trial",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

// ============================================================
// INPUT SCHEMAS
// ============================================================

export const getSubscriptionQuerySchema = z.object({
  organizationId: z.string().min(1),
});

export const cancelSubscriptionBodySchema = z.object({
  organizationId: z.string().min(1),
});

export const restoreSubscriptionBodySchema = z.object({
  organizationId: z.string().min(1),
});

// ============================================================
// OUTPUT SCHEMAS
// ============================================================

export const subscriptionResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  status: subscriptionStatusSchema,
  plan: z.object({
    id: z.string(),
    name: z.string(),
    displayName: z.string(),
    limits: planLimitsSchema.nullable(),
  }),
  trialStart: z.iso.datetime().nullable(),
  trialEnd: z.iso.datetime().nullable(),
  trialUsed: z.boolean(),
  currentPeriodStart: z.iso.datetime().nullable(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: z.iso.datetime().nullable(),
  seats: z.number().int(),
});

export const cancelSubscriptionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: z.iso.datetime().nullable(),
});

export const restoreSubscriptionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type GetSubscriptionQuery = z.infer<typeof getSubscriptionQuerySchema>;
export type CancelSubscriptionBody = z.infer<
  typeof cancelSubscriptionBodySchema
>;
export type RestoreSubscriptionBody = z.infer<
  typeof restoreSubscriptionBodySchema
>;
export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;
export type CancelSubscriptionResponse = z.infer<
  typeof cancelSubscriptionResponseSchema
>;
export type RestoreSubscriptionResponse = z.infer<
  typeof restoreSubscriptionResponseSchema
>;
