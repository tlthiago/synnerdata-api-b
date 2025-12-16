import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type PLAN_FEATURES, schema } from "@/db/schema";
import { FeatureNotAvailableError } from "../errors";
import type {
  CapabilitiesData,
  CheckFeatureData,
  CheckFeaturesData,
  FeatureAccess,
} from "./limits.model";

const ALL_FEATURE_NAMES = [
  "terminated_employees",
  "absences",
  "medical_certificates",
  "accidents",
  "warnings",
  "employee_status",
  "birthdays",
  "ppe",
  "employee_record",
  "payroll",
] as const;

// Maps features to the minimum plan that includes them
const FEATURE_TO_PLAN: Record<string, keyof typeof PLAN_FEATURES> = {
  terminated_employees: "gold",
  absences: "gold",
  medical_certificates: "gold",
  accidents: "gold",
  warnings: "gold",
  employee_status: "gold",
  birthdays: "diamond",
  ppe: "diamond",
  employee_record: "diamond",
  payroll: "platinum",
};

const PLAN_ORDER: Record<keyof typeof PLAN_FEATURES, number> = {
  gold: 0,
  diamond: 1,
  platinum: 2,
};

const PLAN_DISPLAY_NAMES: Record<keyof typeof PLAN_FEATURES, string> = {
  gold: "Ouro",
  diamond: "Diamante",
  platinum: "Platina",
};

export abstract class LimitsService {
  /**
   * Checks if a feature is available for an organization's plan.
   * Throws FeatureNotAvailableError if the feature is not available.
   */
  static async requireFeature(
    organizationId: string,
    featureName: string
  ): Promise<void> {
    const result = await LimitsService.checkFeature(
      organizationId,
      featureName
    );

    if (!result.hasAccess) {
      throw new FeatureNotAvailableError(featureName);
    }
  }

  /**
   * Checks if a feature is available for an organization's plan.
   * Returns access information without throwing.
   */
  static async checkFeature(
    organizationId: string,
    featureName: string
  ): Promise<CheckFeatureData> {
    const planFeatures = await LimitsService.getPlanFeatures(organizationId);

    const hasAccess = planFeatures.includes(featureName);
    const requiredPlan = FEATURE_TO_PLAN[featureName];

    return {
      featureName,
      hasAccess,
      requiredPlan: requiredPlan ? PLAN_DISPLAY_NAMES[requiredPlan] : null,
    };
  }

  /**
   * Checks multiple features at once for an organization.
   */
  static async checkFeatures(
    organizationId: string,
    featureNames: string[]
  ): Promise<CheckFeaturesData> {
    const {
      features: planFeatures,
      planName,
      planDisplayName,
    } = await LimitsService.getPlanInfo(organizationId);

    const results: FeatureAccess[] = featureNames.map((featureName) => {
      const hasAccess = planFeatures.includes(featureName);
      const requiredPlan = FEATURE_TO_PLAN[featureName];

      return {
        featureName,
        hasAccess,
        requiredPlan: requiredPlan ? PLAN_DISPLAY_NAMES[requiredPlan] : null,
      };
    });

    return {
      features: results,
      planName,
      planDisplayName,
    };
  }

  /**
   * Gets all available features for an organization's plan.
   */
  static async getAvailableFeatures(organizationId: string): Promise<string[]> {
    return await LimitsService.getPlanFeatures(organizationId);
  }

  /**
   * Checks if an organization has a specific plan or higher.
   */
  static async hasPlanOrHigher(
    organizationId: string,
    requiredPlan: keyof typeof PLAN_FEATURES
  ): Promise<boolean> {
    const { planName } = await LimitsService.getPlanInfo(organizationId);

    const currentPlanKey = planName as keyof typeof PLAN_FEATURES;
    if (!(currentPlanKey in PLAN_ORDER)) {
      return false;
    }

    return PLAN_ORDER[currentPlanKey] >= PLAN_ORDER[requiredPlan];
  }

  /**
   * Gets comprehensive capabilities for an organization.
   * Returns subscription status, plan info, and all features with access.
   */
  static async getCapabilities(
    organizationId: string
  ): Promise<CapabilitiesData> {
    const { SubscriptionService } = await import(
      "../subscription/subscription.service"
    );

    const access = await SubscriptionService.checkAccess(organizationId);
    const {
      planName,
      planDisplayName,
      features: availableFeatures,
    } = await LimitsService.getPlanInfo(organizationId);

    const features: FeatureAccess[] = ALL_FEATURE_NAMES.map((featureName) => {
      const hasAccess = availableFeatures.includes(featureName);
      const requiredPlan = FEATURE_TO_PLAN[featureName];

      return {
        featureName,
        hasAccess,
        requiredPlan: requiredPlan ? PLAN_DISPLAY_NAMES[requiredPlan] : null,
      };
    });

    const isValidPlan =
      planName !== "none" && planName !== "expired" && planName !== "unknown";

    return {
      subscription: {
        status: access.status,
        hasAccess: access.hasAccess,
        daysRemaining: access.daysRemaining,
        requiresPayment: access.requiresPayment,
      },
      plan: isValidPlan
        ? {
            name: planName,
            displayName: planDisplayName,
          }
        : null,
      features,
      availableFeatures,
    };
  }

  private static async getPlanFeatures(
    organizationId: string
  ): Promise<string[]> {
    const { features } = await LimitsService.getPlanInfo(organizationId);
    return features;
  }

  private static async getPlanInfo(organizationId: string): Promise<{
    features: string[];
    planName: string;
    planDisplayName: string;
  }> {
    const [subscription] = await db
      .select({
        planId: schema.orgSubscriptions.planId,
        status: schema.orgSubscriptions.status,
      })
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!subscription) {
      // No subscription = no features
      return {
        features: [],
        planName: "none",
        planDisplayName: "Sem plano",
      };
    }

    // Trial and active subscriptions have access to plan features
    if (subscription.status !== "trial" && subscription.status !== "active") {
      return {
        features: [],
        planName: "expired",
        planDisplayName: "Expirado",
      };
    }

    const [plan] = await db
      .select({
        name: schema.subscriptionPlans.name,
        displayName: schema.subscriptionPlans.displayName,
        limits: schema.subscriptionPlans.limits,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, subscription.planId))
      .limit(1);

    if (!plan) {
      return {
        features: [],
        planName: "unknown",
        planDisplayName: "Desconhecido",
      };
    }

    return {
      features: plan.limits?.features ?? [],
      planName: plan.name,
      planDisplayName: plan.displayName,
    };
  }
}
