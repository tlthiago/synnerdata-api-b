import { z } from "zod";
import {
  paginatedResponseSchema,
  successResponseSchema,
} from "@/lib/responses/response.types";

// --- Input schemas ---

export const adjustIndividualParamsSchema = z.object({
  subscriptionId: z.string().min(1),
});

export const adjustIndividualBodySchema = z.object({
  newPriceMonthly: z
    .number()
    .int()
    .min(100, "Minimum price is 100 centavos (R$ 1.00)"),
  reason: z.string().min(1).max(500),
});

export const adjustBulkBodySchema = z.object({
  planId: z.string().min(1),
  pricingTierId: z.string().min(1),
  billingCycle: z.enum(["monthly", "yearly"]),
  newPriceMonthly: z
    .number()
    .int()
    .min(100, "Minimum price is 100 centavos (R$ 1.00)"),
  reason: z.string().min(1).max(500),
});

export const getHistoryParamsSchema = z.object({
  subscriptionId: z.string().min(1),
});

export const getHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// --- Data schemas ---

export const priceAdjustmentDataSchema = z.object({
  id: z.string(),
  subscriptionId: z.string(),
  organizationId: z.string(),
  oldPrice: z.number(),
  newPrice: z.number(),
  reason: z.string(),
  adjustmentType: z.enum(["individual", "bulk"]),
  billingCycle: z.string(),
  pricingTierId: z.string().nullable(),
  adminId: z.string(),
  createdAt: z.string(),
});

export const adjustIndividualDataSchema = z.object({
  adjustment: priceAdjustmentDataSchema,
  subscription: z.object({
    id: z.string(),
    organizationId: z.string(),
    priceAtPurchase: z.number(),
    isCustomPrice: z.boolean(),
  }),
});

export const adjustBulkDataSchema = z.object({
  adjustments: z.array(priceAdjustmentDataSchema),
  updatedCount: z.number(),
  catalogUpdated: z.boolean(),
});

// --- Response schemas ---

export const adjustIndividualResponseSchema = successResponseSchema(
  adjustIndividualDataSchema
);

export const adjustBulkResponseSchema =
  successResponseSchema(adjustBulkDataSchema);

export const getHistoryResponseSchema = paginatedResponseSchema(
  priceAdjustmentDataSchema
);

// --- Inferred types ---

export type AdjustIndividualParams = z.infer<
  typeof adjustIndividualParamsSchema
>;
export type AdjustIndividualBody = z.infer<typeof adjustIndividualBodySchema>;
export type AdjustBulkBody = z.infer<typeof adjustBulkBodySchema>;
export type GetHistoryParams = z.infer<typeof getHistoryParamsSchema>;
export type GetHistoryQuery = z.infer<typeof getHistoryQuerySchema>;

export type AdjustIndividualInput = AdjustIndividualBody & {
  subscriptionId: string;
  adminId: string;
};

export type AdjustBulkInput = AdjustBulkBody & {
  adminId: string;
};

export type GetHistoryInput = {
  subscriptionId: string;
  page: number;
  limit: number;
};
