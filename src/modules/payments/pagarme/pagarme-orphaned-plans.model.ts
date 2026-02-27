import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

const orphanedPlanSchema = z.object({
  id: z.string(),
  localPlanId: z.string(),
  localTierId: z.string(),
  pagarmePlanId: z.string(),
  billingCycle: z.string(),
  priceAtCreation: z.number(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export const listOrphanedPlansResponseSchema = successResponseSchema(
  z.object({
    orphanedPlans: z.array(orphanedPlanSchema),
    total: z.number(),
  })
);

const cleanupResultSchema = z.object({
  deactivated: z.array(
    z.object({
      pagarmePlanId: z.string(),
      name: z.string(),
    })
  ),
  kept: z.array(
    z.object({
      pagarmePlanId: z.string(),
      name: z.string(),
      reason: z.string(),
    })
  ),
  errors: z.array(
    z.object({
      pagarmePlanId: z.string(),
      error: z.string(),
    })
  ),
});

export const cleanupOrphanedPlansResponseSchema = successResponseSchema(
  z.object({
    result: cleanupResultSchema,
    summary: z.object({
      totalOrphaned: z.number(),
      deactivated: z.number(),
      kept: z.number(),
      errors: z.number(),
    }),
  })
);
