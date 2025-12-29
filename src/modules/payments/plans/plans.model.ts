import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const planLimitsSchema = z.object({
  features: z.array(z.string()).describe("List of enabled feature keys"),
});

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

export const pricingTierSchema = z.object({
  id: z.string().describe("Pricing tier ID"),
  minEmployees: z.number().int().describe("Minimum employees in this tier"),
  maxEmployees: z.number().int().describe("Maximum employees in this tier"),
  priceMonthly: z.number().int().describe("Monthly price in cents"),
  priceYearly: z.number().int().describe("Yearly price in cents"),
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
  limits: planLimitsSchema.describe("Plan features"),
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
  pricingTiers: z
    .array(tierPriceInputSchema)
    .min(1)
    .optional()
    .describe(
      "Pricing tiers: 1 tier (0-10) for trial, 10 tiers for paid plans"
    ),
});

export const updatePlanSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  trialDays: z.number().int().min(0).optional(),
  limits: planLimitsSchema.optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  pricingTiers: z
    .array(tierPriceInputSchema)
    .min(1)
    .optional()
    .describe("Optional: update prices for all tiers"),
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
  limits: planLimitsSchema.nullable().describe("Plan features"),
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

export type PlanLimits = z.infer<typeof planLimitsSchema>;
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
