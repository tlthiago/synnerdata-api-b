import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// ============================================================
// INPUT
// ============================================================

export const updateTrialLimitsSchema = z
  .object({
    maxEmployees: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Novo limite máximo de funcionários"),
    trialDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe(
        "Nova duração do trial em dias (recalcula trialEnd a partir de trialStart)"
      ),
  })
  .refine(
    (data) => data.maxEmployees !== undefined || data.trialDays !== undefined,
    {
      message:
        "Pelo menos um campo (maxEmployees ou trialDays) deve ser informado",
    }
  );

export type UpdateTrialLimits = z.infer<typeof updateTrialLimitsSchema>;
export type UpdateTrialLimitsInput = UpdateTrialLimits & {
  organizationId: string;
  adminUserId: string;
};

// ============================================================
// RESPONSE
// ============================================================

export const trialLimitsDataSchema = z.object({
  organizationId: z.string(),
  status: z.string(),
  planName: z.string(),
  trialDays: z.number().int(),
  trialEnd: z.string(),
  maxEmployees: z.number().int(),
  reactivated: z.boolean(),
});

export const updateTrialLimitsResponseSchema = successResponseSchema(
  trialLimitsDataSchema
);

export type TrialLimitsData = z.infer<typeof trialLimitsDataSchema>;
