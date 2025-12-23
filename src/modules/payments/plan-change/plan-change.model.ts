import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

const isProduction = process.env.NODE_ENV === "production";

const planInfoSchema = z.object({
  id: z.string().describe("Plan ID"),
  name: z.string().describe("Plan internal name"),
  displayName: z.string().describe("Plan display name"),
});

const changeTypeEnum = z.enum(["upgrade", "downgrade"]);

export const changePlanSchema = z.object({
  newPlanId: z.string().min(1).describe("ID of the target plan"),
  successUrl: (isProduction ? z.httpUrl() : z.url()).describe(
    "URL to redirect after successful payment"
  ),
});

const changePlanDataSchema = z.object({
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
  newPlan: planInfoSchema.describe("Target plan information"),
});

export const changePlanResponseSchema =
  successResponseSchema(changePlanDataSchema);

export const changeBillingCycleSchema = z.object({
  newBillingCycle: z
    .enum(["monthly", "yearly"])
    .describe("New billing cycle to switch to"),
  successUrl: (isProduction ? z.httpUrl() : z.url()).describe(
    "URL to redirect after successful payment"
  ),
});

const changeBillingCycleDataSchema = z.object({
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
  newBillingCycle: z
    .enum(["monthly", "yearly"])
    .describe("New billing cycle after change"),
});

export const changeBillingCycleResponseSchema = successResponseSchema(
  changeBillingCycleDataSchema
);

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

export type ChangePlan = z.infer<typeof changePlanSchema>;
export type ChangePlanInput = ChangePlan & {
  userId: string;
  organizationId: string;
};
export type ChangePlanData = z.infer<typeof changePlanDataSchema>;
export type ChangePlanResponse = z.infer<typeof changePlanResponseSchema>;

export type ChangeBillingCycle = z.infer<typeof changeBillingCycleSchema>;
export type ChangeBillingCycleInput = ChangeBillingCycle & {
  userId: string;
  organizationId: string;
};
export type ChangeBillingCycleData = z.infer<
  typeof changeBillingCycleDataSchema
>;
export type ChangeBillingCycleResponse = z.infer<
  typeof changeBillingCycleResponseSchema
>;

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

export type ChangeType = z.infer<typeof changeTypeEnum>;

export type GetChangeTypeInput = {
  currentPlanPrice: number;
  newPlanPrice: number;
  currentBillingCycle: "monthly" | "yearly";
  newBillingCycle: "monthly" | "yearly";
};

export type CalculateProrationInput = {
  currentPlanPrice: number;
  newPlanPrice: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

// Data-only types for service layer
export type CancelScheduledChangeData = z.infer<
  typeof cancelScheduledChangeDataSchema
>;
export type GetScheduledChangeData = z.infer<
  typeof getScheduledChangeDataSchema
>;
