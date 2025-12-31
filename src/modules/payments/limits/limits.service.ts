import { and, count, eq, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  EmployeeLimitReachedError,
  FeatureNotAvailableError,
} from "@/modules/payments/errors";
import { PLAN_FEATURES } from "@/modules/payments/plans/plans.constants";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type {
  CapabilitiesData,
  CheckEmployeeLimitData,
  CheckFeatureData,
  CheckFeaturesData,
  FeatureAccess,
} from "./limits.model";

// Derive all feature names from PLAN_FEATURES (single source of truth)
const ALL_FEATURE_NAMES = [
  ...new Set(Object.values(PLAN_FEATURES).flat()),
] as string[];

// Plan hierarchy from lowest to highest tier
const PLAN_HIERARCHY = ["gold", "diamond", "platinum"] as const;

/**
 * Gets the minimum plan required for a feature.
 * Derived dynamically from PLAN_FEATURES to ensure consistency.
 */
function getMinimumPlanForFeature(
  featureName: string
): (typeof PLAN_HIERARCHY)[number] | null {
  for (const planType of PLAN_HIERARCHY) {
    if (PLAN_FEATURES[planType].includes(featureName as never)) {
      return planType;
    }
  }
  return null;
}

// Cache for plan display names (loaded from database)
let planDisplayNamesCache: Map<string, string> | null = null;

/**
 * Clears the plan display names cache.
 * Useful for testing when plans are created dynamically.
 */
export function clearPlanDisplayNamesCache(): void {
  planDisplayNamesCache = null;
}

/**
 * Gets the display name for a plan type from the database.
 * Falls back to capitalized type name if not found.
 */
async function getPlanDisplayName(planType: string): Promise<string> {
  if (!planDisplayNamesCache) {
    planDisplayNamesCache = new Map();
    const plans = await db
      .select({
        name: schema.subscriptionPlans.name,
        displayName: schema.subscriptionPlans.displayName,
      })
      .from(schema.subscriptionPlans);

    for (const plan of plans) {
      // Extract base type from plan name (e.g., "gold-abc123" -> "gold")
      const baseType = plan.name.split("-")[0];
      if (!planDisplayNamesCache.has(baseType)) {
        planDisplayNamesCache.set(baseType, plan.displayName);
      }
    }
  }

  return (
    planDisplayNamesCache.get(planType) ??
    planType.charAt(0).toUpperCase() + planType.slice(1)
  );
}

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
    const requiredPlanType = getMinimumPlanForFeature(featureName);
    const requiredPlan = requiredPlanType
      ? await getPlanDisplayName(requiredPlanType)
      : null;

    return {
      featureName,
      hasAccess,
      requiredPlan,
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

    const results: FeatureAccess[] = await Promise.all(
      featureNames.map(async (featureName) => {
        const hasAccess = planFeatures.includes(featureName);
        const requiredPlanType = getMinimumPlanForFeature(featureName);
        const requiredPlan = requiredPlanType
          ? await getPlanDisplayName(requiredPlanType)
          : null;

        return {
          featureName,
          hasAccess,
          requiredPlan,
        };
      })
    );

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
   * Uses sortOrder from the database to compare plan tiers.
   */
  static async hasPlanOrHigher(
    organizationId: string,
    requiredPlanType: string
  ): Promise<boolean> {
    const { sortOrder: currentSortOrder } =
      await LimitsService.getPlanInfo(organizationId);

    if (currentSortOrder === null) {
      return false;
    }

    // Find the required plan's sortOrder by matching the base type
    // Order by sortOrder ASC to get the base tier (lowest sortOrder > 0)
    const { asc, gt } = await import("drizzle-orm");
    const [requiredPlan] = await db
      .select({ sortOrder: schema.subscriptionPlans.sortOrder })
      .from(schema.subscriptionPlans)
      .where(
        and(
          like(schema.subscriptionPlans.name, `${requiredPlanType}%`),
          gt(schema.subscriptionPlans.sortOrder, 0)
        )
      )
      .orderBy(asc(schema.subscriptionPlans.sortOrder))
      .limit(1);

    if (!requiredPlan) {
      return false;
    }

    return currentSortOrder >= requiredPlan.sortOrder;
  }

  /**
   * Gets comprehensive capabilities for an organization.
   * Returns subscription status, plan info, and all features with access.
   */
  static async getCapabilities(
    organizationId: string
  ): Promise<CapabilitiesData> {
    const access = await SubscriptionService.checkAccess(organizationId);
    const {
      planName,
      planDisplayName,
      features: availableFeatures,
    } = await LimitsService.getPlanInfo(organizationId);

    const features: FeatureAccess[] = await Promise.all(
      ALL_FEATURE_NAMES.map(async (featureName) => {
        const hasAccess = availableFeatures.includes(featureName);
        const requiredPlanType = getMinimumPlanForFeature(featureName);
        const requiredPlan = requiredPlanType
          ? await getPlanDisplayName(requiredPlanType)
          : null;

        return {
          featureName,
          hasAccess,
          requiredPlan,
        };
      })
    );

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

  /**
   * Checks employee limit status for an organization.
   * Returns current count, limit, and whether more employees can be added.
   * The limit comes from the pricing tier's maxEmployees.
   */
  static async checkEmployeeLimit(
    organizationId: string
  ): Promise<CheckEmployeeLimitData> {
    const [countResult] = await db
      .select({ value: count() })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      );

    const current = countResult?.value ?? 0;

    const [subscription] = await db
      .select({ maxEmployees: schema.planPricingTiers.maxEmployees })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.planPricingTiers,
        eq(schema.orgSubscriptions.pricingTierId, schema.planPricingTiers.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    const limit = subscription?.maxEmployees ?? 0;

    return { current, limit, canAdd: current < limit };
  }

  /**
   * Throws EmployeeLimitReachedError if the employee limit is reached.
   */
  static async requireEmployeeLimit(organizationId: string): Promise<void> {
    const { current, limit, canAdd } =
      await LimitsService.checkEmployeeLimit(organizationId);
    if (!canAdd) {
      throw new EmployeeLimitReachedError(current, limit);
    }
  }

  /**
   * Returns the percentage of employee limit used (0-100).
   */
  static async getEmployeeUsagePercentage(
    organizationId: string
  ): Promise<number> {
    const { current, limit } =
      await LimitsService.checkEmployeeLimit(organizationId);
    if (limit === 0) {
      return 100;
    }
    return Math.round((current / limit) * 100);
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
    sortOrder: number | null;
  }> {
    const [result] = await db
      .select({
        status: schema.orgSubscriptions.status,
        planName: schema.subscriptionPlans.name,
        planDisplayName: schema.subscriptionPlans.displayName,
        limits: schema.subscriptionPlans.limits,
        sortOrder: schema.subscriptionPlans.sortOrder,
        isTrial: schema.subscriptionPlans.isTrial,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!result) {
      // No subscription = no features
      return {
        features: [],
        planName: "none",
        planDisplayName: "Sem plano",
        sortOrder: null,
      };
    }

    // Active subscriptions have access to features
    // Trial plans also have status="active" while valid (trial is a plan, not a status)
    const hasAccess = result.status === "active";
    if (!hasAccess) {
      return {
        features: [],
        planName: "expired",
        planDisplayName: "Expirado",
        sortOrder: null,
      };
    }

    return {
      features: result.limits?.features ?? [],
      planName: result.planName,
      planDisplayName: result.planDisplayName,
      sortOrder: result.sortOrder,
    };
  }
}
