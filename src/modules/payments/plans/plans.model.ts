import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const tierPriceInputSchema = z.object({
  minEmployees: z
    .number()
    .int()
    .min(0)
    .describe("Minimum employees in this tier"),
  maxEmployees: z
    .number()
    .int()
    .min(1)
    .describe("Maximum employees in this tier"),
  priceMonthly: z.number().int().min(0).describe("Monthly price in cents"),
});

export const limitInputSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Key must be snake_case")
    .describe("Limit key (e.g., max_employees)"),
  value: z.number().int().describe("Limit value (-1 for unlimited)"),
});

export const pricingTierSchema = z.object({
  id: z.string().describe("Pricing tier ID"),
  minEmployees: z.number().int().describe("Minimum employees in this tier"),
  maxEmployees: z.number().int().describe("Maximum employees in this tier"),
  priceMonthly: z.number().int().describe("Monthly price in cents"),
  priceYearly: z.number().int().describe("Yearly price in cents"),
});

export const planLimitSchema = z.object({
  key: z.string().describe("Limit key"),
  value: z.number().int().describe("Limit value"),
});

const limitsArraySchema = z
  .array(limitInputSchema)
  .optional()
  .superRefine((limits, ctx) => {
    if (!limits) {
      return;
    }
    const keys = limits.map((l) => l.key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate limit keys: ${[...new Set(duplicates)].join(", ")}`,
      });
    }
  });

export const createPlanSchema = z.object({
  name: z.string().min(1).max(50).describe("Plan internal name (unique)"),
  displayName: z.string().min(1).max(100).describe("Plan display name"),
  description: z.string().max(500).optional().describe("Plan description"),
  trialDays: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Trial days (14 for trial plan, 0 for paid plans)"),
  features: z
    .array(z.string())
    .min(1)
    .describe("List of feature IDs to assign to this plan"),
  isActive: z.boolean().default(true).describe("Whether plan is active"),
  isPublic: z
    .boolean()
    .default(true)
    .describe("Whether plan is publicly visible"),
  isTrial: z
    .boolean()
    .default(false)
    .describe("Whether this is the trial plan"),
  sortOrder: z.number().int().default(0).describe("Display sort order"),
  yearlyDiscountPercent: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(20)
    .describe("Yearly discount percentage (0-100). Defaults to 20."),
  pricingTiers: z
    .array(tierPriceInputSchema)
    .min(1)
    .optional()
    .describe(
      "Pricing tiers: 1 tier (0-10) for trial, at least 1 contiguous tier for paid plans"
    ),
  limits: limitsArraySchema.describe("Plan limits (e.g., max_employees)"),
});

export const updatePlanSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  trialDays: z.number().int().min(0).optional(),
  features: z
    .array(z.string())
    .min(1)
    .optional()
    .describe("Replace feature list for this plan"),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  pricingTiers: z
    .array(tierPriceInputSchema)
    .min(1)
    .optional()
    .describe("Optional: update prices for all tiers"),
  yearlyDiscountPercent: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe("Yearly discount percentage (0-100)"),
  limits: limitsArraySchema.describe(
    "Replace plan limits. Empty array removes all limits."
  ),
});

export const planIdParamsSchema = z.object({
  id: z.string().min(1).describe("Plan ID"),
});

const planDataSchema = z.object({
  id: z.string().describe("Plan ID"),
  name: z.string().describe("Plan internal name"),
  displayName: z.string().describe("Plan display name"),
  description: z.string().nullable().describe("Plan description"),
  trialDays: z.number().int().describe("Trial days"),
  features: z
    .array(z.string())
    .describe("List of feature IDs assigned to this plan"),
  limits: z
    .array(planLimitSchema)
    .describe("Plan limits (e.g., max_employees)"),
  yearlyDiscountPercent: z
    .number()
    .int()
    .describe("Yearly discount percentage"),
  isActive: z.boolean().describe("Whether plan is active"),
  isPublic: z.boolean().describe("Whether plan is publicly visible"),
  isTrial: z.boolean().describe("Whether this is the trial plan"),
  sortOrder: z.number().int().describe("Display sort order"),
});

const planWithTiersSchema = planDataSchema.extend({
  startingPriceMonthly: z
    .number()
    .int()
    .describe("Lowest monthly price from tiers (cents)"),
  startingPriceYearly: z
    .number()
    .int()
    .describe("Lowest yearly price from tiers (cents)"),
  pricingTiers: z
    .array(pricingTierSchema)
    .describe("Pricing tiers by employee count"),
});

const planListItemSchema = planWithTiersSchema;

const deletePlanDataSchema = z.object({
  deleted: z.literal(true).describe("Deletion confirmation"),
});

export const getPlanResponseSchema = successResponseSchema(planWithTiersSchema);
export const listPlansResponseSchema = successResponseSchema(
  z.object({ plans: z.array(planListItemSchema) })
);
export const createPlanResponseSchema =
  successResponseSchema(planWithTiersSchema);
export const updatePlanResponseSchema =
  successResponseSchema(planWithTiersSchema);
export const deletePlanResponseSchema =
  successResponseSchema(deletePlanDataSchema);

export type LimitInput = z.infer<typeof limitInputSchema>;
export type PlanLimitData = z.infer<typeof planLimitSchema>;
export type TierPriceInput = z.infer<typeof tierPriceInputSchema>;
export type PricingTierData = z.infer<typeof pricingTierSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type PlanIdParams = z.infer<typeof planIdParamsSchema>;
export type PlanData = z.infer<typeof planDataSchema>;
export type PlanWithTiersData = z.infer<typeof planWithTiersSchema>;

export type GetPlanResponse = z.infer<typeof getPlanResponseSchema>;
export type ListPlansResponse = z.infer<typeof listPlansResponseSchema>;
export type CreatePlanResponse = z.infer<typeof createPlanResponseSchema>;
export type UpdatePlanResponse = z.infer<typeof updatePlanResponseSchema>;
export type DeletePlanResponse = z.infer<typeof deletePlanResponseSchema>;

export type ListPlansData = { plans: PlanWithTiersData[] };
export type GetPlanData = PlanWithTiersData;
export type CreatePlanData = PlanWithTiersData;
export type UpdatePlanData = PlanWithTiersData;
export type DeletePlanData = z.infer<typeof deletePlanDataSchema>;

export const archivedTierDataSchema = z.object({
  id: z.string(),
  minEmployees: z.number(),
  maxEmployees: z.number(),
  priceMonthly: z.number(),
  priceYearly: z.number(),
  archivedAt: z.string().datetime(),
  activeSubscriptionCount: z.number(),
});

export type ArchivedTierData = z.infer<typeof archivedTierDataSchema>;

export const listArchivedTiersDataSchema = z.array(archivedTierDataSchema);
export type ListArchivedTiersData = z.infer<typeof listArchivedTiersDataSchema>;

export const listArchivedTiersResponseSchema = successResponseSchema(
  listArchivedTiersDataSchema
);
export type ListArchivedTiersResponse = z.infer<
  typeof listArchivedTiersResponseSchema
>;
