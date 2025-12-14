import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const planLimitsSchema = z.object({
  maxMembers: z.number().int().positive().describe("Maximum team members"),
  maxProjects: z.number().int().positive().describe("Maximum projects"),
  maxStorage: z.number().int().positive().describe("Maximum storage in MB"),
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

const planListItemSchema = z.object({
  id: z.string().describe("Plan ID"),
  name: z.string().describe("Plan internal name"),
  displayName: z.string().describe("Plan display name"),
  priceMonthly: z.number().int().describe("Monthly price in cents"),
  priceYearly: z.number().int().describe("Yearly price in cents"),
  monthlyEquivalent: z
    .number()
    .int()
    .describe("Monthly equivalent when paying yearly"),
  savingsYearly: z.number().int().describe("Yearly savings in cents"),
  savingsPercent: z.number().int().describe("Yearly savings percentage"),
  trialDays: z.number().int().describe("Trial period in days"),
  limits: planLimitsSchema.nullable().describe("Plan limits and quotas"),
  isActive: z.boolean().describe("Whether plan is active"),
  isPublic: z.boolean().describe("Whether plan is publicly visible"),
  sortOrder: z.number().int().describe("Display sort order"),
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
