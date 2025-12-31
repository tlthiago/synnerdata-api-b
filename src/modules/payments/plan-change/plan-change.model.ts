import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

const isProduction = process.env.NODE_ENV === "production";

const planInfoSchema = z.object({
  id: z.string().describe("Plan ID"),
  name: z.string().describe("Plan internal name"),
  displayName: z.string().describe("Plan display name"),
});

const changeTypeEnum = z.enum(["upgrade", "downgrade"]);

const cancelScheduledChangeDataSchema = z.object({
  canceled: z.literal(true).describe("Confirmation that change was canceled"),
});

export const cancelScheduledChangeResponseSchema = successResponseSchema(
  cancelScheduledChangeDataSchema
);

const scheduledChangeInfoSchema = z.object({
  pendingPlanId: z.string().describe("ID of the pending plan"),
  pendingPlanName: z.string().describe("Display name of the pending plan"),
  pendingBillingCycle: z
    .enum(["monthly", "yearly"])
    .nullable()
    .describe("Pending billing cycle (if changing)"),
  scheduledAt: z.string().describe("ISO date when change will be applied"),
});

const getScheduledChangeDataSchema = z.object({
  hasScheduledChange: z
    .boolean()
    .describe("Whether there is a scheduled change"),
  change: scheduledChangeInfoSchema
    .optional()
    .describe("Details of the scheduled change"),
});

export const getScheduledChangeResponseSchema = successResponseSchema(
  getScheduledChangeDataSchema
);

export type CancelScheduledChangeInput = {
  userId: string;
  organizationId: string;
};
export type CancelScheduledChangeResponse = z.infer<
  typeof cancelScheduledChangeResponseSchema
>;

export type GetScheduledChangeResponse = z.infer<
  typeof getScheduledChangeResponseSchema
>;

// Data-only types for service layer
export type CancelScheduledChangeData = z.infer<
  typeof cancelScheduledChangeDataSchema
>;
export type GetScheduledChangeData = z.infer<
  typeof getScheduledChangeDataSchema
>;

// Unified change subscription schema
export const changeSubscriptionSchema = z.object({
  newPlanId: z.string().optional().describe("ID of the new plan (optional)"),
  newBillingCycle: z
    .enum(["monthly", "yearly"])
    .optional()
    .describe("New billing cycle (optional)"),
  newTierId: z
    .string()
    .optional()
    .describe("ID of the new pricing tier (optional)"),
  successUrl: (isProduction ? z.httpUrl() : z.url()).describe(
    "URL to redirect after successful payment"
  ),
});

const changeSubscriptionDataSchema = z.object({
  changeType: changeTypeEnum.describe("Type of change: upgrade or downgrade"),
  immediate: z.boolean().describe("Whether the change is immediate"),
  checkoutUrl: z
    .url()
    .optional()
    .describe("Checkout URL for upgrades requiring payment"),
  prorationAmount: z
    .number()
    .optional()
    .describe("Proration amount in centavos (upgrades only)"),
  scheduledAt: z
    .string()
    .optional()
    .describe("ISO date when scheduled change will be applied (downgrades)"),
  newPlan: planInfoSchema.optional().describe("Target plan information"),
  newBillingCycle: z
    .enum(["monthly", "yearly"])
    .optional()
    .describe("New billing cycle after change"),
  newTierId: z.string().optional().describe("New tier ID after change"),
});

export const changeSubscriptionResponseSchema = successResponseSchema(
  changeSubscriptionDataSchema
);

// Unified change subscription types
export type ChangeSubscription = z.infer<typeof changeSubscriptionSchema>;
export type ChangeSubscriptionInput = ChangeSubscription & {
  userId: string;
  organizationId: string;
};
export type ChangeSubscriptionData = z.infer<
  typeof changeSubscriptionDataSchema
>;
export type ChangeSubscriptionResponse = z.infer<
  typeof changeSubscriptionResponseSchema
>;
