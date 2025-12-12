import { z } from "zod";

// ============================================================
// PLAN LIMITS SCHEMA
// ============================================================

export const planLimitsSchema = z.object({
  maxMembers: z.number().int().positive(),
  maxProjects: z.number().int().positive(),
  maxStorage: z.number().int().positive(), // MB
  features: z.array(z.string()),
});

// ============================================================
// INPUT SCHEMAS
// ============================================================

export const createPlanRequestSchema = z.object({
  name: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  priceMonthly: z.number().int().min(0),
  priceYearly: z.number().int().min(0),
  trialDays: z.number().int().min(0).default(14),
  limits: planLimitsSchema,
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const updatePlanRequestSchema = createPlanRequestSchema.partial();

// ============================================================
// OUTPUT SCHEMAS
// ============================================================

export const planResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  priceMonthly: z.number().int(),
  priceYearly: z.number().int(),
  trialDays: z.number().int(),
  limits: planLimitsSchema.nullable(),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  sortOrder: z.number().int(),
});

export const planListResponseSchema = z.object({
  plans: z.array(planResponseSchema),
});

export const syncPlanResponseSchema = z.object({
  id: z.string(),
  pagarmePlanId: z.string(),
});

export const deletePlanResponseSchema = z.object({
  success: z.boolean(),
});

// ============================================================
// PARAMS SCHEMAS
// ============================================================

export const planIdParamsSchema = z.object({
  id: z.string().min(1),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type PlanLimits = z.infer<typeof planLimitsSchema>;
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;
export type PlanResponse = z.infer<typeof planResponseSchema>;
export type PlanListResponse = z.infer<typeof planListResponseSchema>;
export type SyncPlanResponse = z.infer<typeof syncPlanResponseSchema>;
export type DeletePlanResponse = z.infer<typeof deletePlanResponseSchema>;
export type PlanIdParams = z.infer<typeof planIdParamsSchema>;
