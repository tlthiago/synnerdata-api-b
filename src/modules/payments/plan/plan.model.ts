import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const planLimitsSchema = z.object({
  maxMembers: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum team members"),
  maxProjects: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum projects"),
  maxStorage: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum storage in MB"),
  features: z.array(z.string()).describe("List of enabled features"),
});

export const createPlanSchema = z.object({
  name: z.string().min(1).max(50).describe("Plan internal name"),
  displayName: z.string().min(1).max(100).describe("Plan display name"),
  priceMonthly: z.number().int().min(0).describe("Monthly price in cents"),
  priceYearly: z.number().int().min(0).describe("Yearly price in cents"),
  trialDays: z
    .number()
    .int()
    .min(0)
    .default(14)
    .describe("Trial period in days"),
  limits: planLimitsSchema.describe("Plan limits and quotas"),
  isActive: z.boolean().default(true).describe("Whether plan is active"),
  isPublic: z
    .boolean()
    .default(true)
    .describe("Whether plan is publicly visible"),
  sortOrder: z.number().int().default(0).describe("Display sort order"),
});

export const updatePlanSchema = createPlanSchema.partial();

export const planIdParamsSchema = z.object({
  id: z.string().min(1).describe("Plan ID"),
});

const planDataSchema = z.object({
  id: z.string().describe("Plan ID"),
  name: z.string().describe("Plan internal name"),
  displayName: z.string().describe("Plan display name"),
  priceMonthly: z.number().int().describe("Monthly price in cents"),
  priceYearly: z.number().int().describe("Yearly price in cents"),
  trialDays: z.number().int().describe("Trial period in days"),
  limits: planLimitsSchema.nullable().describe("Plan limits and quotas"),
  isActive: z.boolean().describe("Whether plan is active"),
  isPublic: z.boolean().describe("Whether plan is publicly visible"),
  sortOrder: z.number().int().describe("Display sort order"),
});

const deletePlanDataSchema = z.object({
  deleted: z.literal(true).describe("Deletion confirmation"),
});

const syncPlanDataSchema = z.object({
  id: z.string().describe("Plan ID"),
  pagarmePlanIdMonthly: z
    .string()
    .nullable()
    .describe("Pagarme monthly plan ID"),
  pagarmePlanIdYearly: z.string().nullable().describe("Pagarme yearly plan ID"),
});

const pricingTierSchema = z.object({
  id: z.string().describe("Pricing tier ID"),
  minEmployees: z.number().int().describe("Minimum employees in this tier"),
  maxEmployees: z.number().int().describe("Maximum employees in this tier"),
  priceMonthly: z.number().int().describe("Monthly price in cents"),
  priceYearly: z.number().int().describe("Yearly price in cents"),
});

const planListItemSchema = z.object({
  id: z.string().describe("Plan ID"),
  name: z.string().describe("Plan internal name"),
  displayName: z.string().describe("Plan display name"),
  description: z.string().nullable().describe("Plan description"),
  startingPrice: z.number().int().describe("Lowest monthly price in cents"),
  trialDays: z.number().int().describe("Trial period in days"),
  limits: planLimitsSchema.nullable().describe("Plan limits and quotas"),
  isActive: z.boolean().describe("Whether plan is active"),
  isPublic: z.boolean().describe("Whether plan is publicly visible"),
  sortOrder: z.number().int().describe("Display sort order"),
  pricingTiers: z
    .array(pricingTierSchema)
    .describe("Pricing tiers by employee count"),
});

export const getPlanResponseSchema = successResponseSchema(planDataSchema);
export const listPlansResponseSchema = successResponseSchema(
  z.object({ plans: z.array(planListItemSchema) })
);
export const createPlanResponseSchema = successResponseSchema(planDataSchema);
export const updatePlanResponseSchema = successResponseSchema(planDataSchema);
export const deletePlanResponseSchema =
  successResponseSchema(deletePlanDataSchema);
export const syncPlanResponseSchema = successResponseSchema(syncPlanDataSchema);

export type PlanLimits = z.infer<typeof planLimitsSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type PlanIdParams = z.infer<typeof planIdParamsSchema>;
export type PlanData = z.infer<typeof planDataSchema>;
export type GetPlanResponse = z.infer<typeof getPlanResponseSchema>;
export type ListPlansResponse = z.infer<typeof listPlansResponseSchema>;
export type CreatePlanResponse = z.infer<typeof createPlanResponseSchema>;
export type UpdatePlanResponse = z.infer<typeof updatePlanResponseSchema>;
export type DeletePlanResponse = z.infer<typeof deletePlanResponseSchema>;
export type SyncPlanResponse = z.infer<typeof syncPlanResponseSchema>;

// Data-only types for service layer
export type ListPlansData = { plans: z.infer<typeof planListItemSchema>[] };
export type GetPlanData = PlanData;
export type CreatePlanData = PlanData;
export type UpdatePlanData = PlanData;
export type DeletePlanData = z.infer<typeof deletePlanDataSchema>;
export type SyncPlanData = z.infer<typeof syncPlanDataSchema>;
