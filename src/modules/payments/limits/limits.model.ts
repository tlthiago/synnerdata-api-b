import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const checkFeatureSchema = z.object({
  featureName: z.string().min(1).describe("Feature name to check"),
});

export const checkFeaturesSchema = z.object({
  featureNames: z.array(z.string().min(1)).describe("Feature names to check"),
});

const featureAccessSchema = z.object({
  featureName: z.string().describe("Feature name"),
  hasAccess: z.boolean().describe("Whether the feature is available"),
  requiredPlan: z
    .string()
    .nullable()
    .describe("Minimum plan required for this feature"),
});

export const checkFeatureResponseSchema =
  successResponseSchema(featureAccessSchema);

export const checkFeaturesResponseSchema = successResponseSchema(
  z.object({
    features: z.array(featureAccessSchema),
    planName: z.string().describe("Current plan name"),
    planDisplayName: z.string().describe("Current plan display name"),
  })
);

export type CheckFeatureInput = z.infer<typeof checkFeatureSchema>;
export type CheckFeaturesInput = z.infer<typeof checkFeaturesSchema>;
export type FeatureAccess = z.infer<typeof featureAccessSchema>;
export type CheckFeatureResponse = z.infer<typeof checkFeatureResponseSchema>;
export type CheckFeaturesResponse = z.infer<typeof checkFeaturesResponseSchema>;

// Data-only types for service layer
export type CheckFeatureData = FeatureAccess;
export type CheckFeaturesData = {
  features: FeatureAccess[];
  planName: string;
  planDisplayName: string;
};
