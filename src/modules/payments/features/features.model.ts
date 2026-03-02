import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

const SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]*$/;

export const createFeatureSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(50)
    .regex(SNAKE_CASE_REGEX, "ID must be snake_case (e.g., 'my_feature')")
    .describe("Unique feature identifier (snake_case)"),
  displayName: z
    .string()
    .min(1)
    .max(100)
    .describe("Display name for the feature"),
  description: z.string().max(500).optional().describe("Feature description"),
  category: z.string().max(50).optional().describe("Category for grouping"),
  sortOrder: z.number().int().min(0).default(0).describe("Display sort order"),
  isDefault: z
    .boolean()
    .default(false)
    .describe("Included in new plans by default"),
  isPremium: z
    .boolean()
    .default(false)
    .describe("Premium highlight on pricing page"),
});

export const updateFeatureSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  isPremium: z.boolean().optional(),
});

export const featureIdParamsSchema = z.object({
  id: z.string().min(1).describe("Feature ID"),
});

const featureDataSchema = z.object({
  id: z.string().describe("Feature ID"),
  displayName: z.string().describe("Display name"),
  description: z.string().nullable().describe("Feature description"),
  category: z.string().nullable().describe("Category"),
  sortOrder: z.number().int().describe("Sort order"),
  isActive: z.boolean().describe("Whether feature is active"),
  isDefault: z.boolean().describe("Whether feature is default for new plans"),
  isPremium: z.boolean().describe("Whether feature is premium"),
  planCount: z.number().int().describe("Number of plans using this feature"),
  createdAt: z.string().datetime().describe("Creation timestamp"),
  updatedAt: z.string().datetime().describe("Last update timestamp"),
});

const deactivateFeatureDataSchema = z.object({
  deactivated: z.literal(true).describe("Deactivation confirmation"),
  planCount: z
    .number()
    .int()
    .describe("Number of plans affected by deactivation"),
});

const deleteFeatureDataSchema = z.object({
  deleted: z.literal(true).describe("Deletion confirmation"),
});

export const listFeaturesResponseSchema = successResponseSchema(
  z.object({ features: z.array(featureDataSchema) })
);
export const createFeatureResponseSchema =
  successResponseSchema(featureDataSchema);
export const updateFeatureResponseSchema =
  successResponseSchema(featureDataSchema);
export const deleteFeatureResponseSchema = successResponseSchema(
  z.union([deactivateFeatureDataSchema, deleteFeatureDataSchema])
);

export type CreateFeatureInput = z.infer<typeof createFeatureSchema>;
export type UpdateFeatureInput = z.infer<typeof updateFeatureSchema>;
export type FeatureIdParams = z.infer<typeof featureIdParamsSchema>;
export type FeatureData = z.infer<typeof featureDataSchema>;
export type ListFeaturesData = { features: FeatureData[] };
