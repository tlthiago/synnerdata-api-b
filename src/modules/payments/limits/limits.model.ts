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
  featureDisplayName: z.string().describe("Feature display name in Portuguese"),
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

export type CheckFeatureData = FeatureAccess;
export type CheckFeaturesData = {
  features: FeatureAccess[];
  planName: string;
  planDisplayName: string;
};

export const capabilitiesResponseSchema = successResponseSchema(
  z.object({
    subscription: z.object({
      status: z
        .enum([
          "active",
          "trial",
          "trial_expired",
          "expired",
          "canceled",
          "past_due",
          "no_subscription",
        ])
        .describe("Current subscription status"),
      hasAccess: z
        .boolean()
        .describe("Whether the user has access to features"),
      daysRemaining: z
        .number()
        .nullable()
        .describe("Days remaining in trial or grace period"),
      requiresPayment: z.boolean().describe("Whether payment is required"),
    }),
    plan: z
      .object({
        name: z.string().describe("Plan internal name"),
        displayName: z.string().describe("Plan display name"),
      })
      .nullable()
      .describe("Current plan info"),
    features: z
      .array(featureAccessSchema)
      .describe("All features with access status"),
    availableFeatures: z
      .array(z.string())
      .describe("List of available feature names"),
  })
);

export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;
export type CapabilitiesData = CapabilitiesResponse["data"];

export type CheckEmployeeLimitData = {
  current: number;
  limit: number;
  canAdd: boolean;
};
