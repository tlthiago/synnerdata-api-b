import { and, asc, count, eq, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  EmployeeCountExceedsTierLimitError,
  EmployeeLimitReachedError,
  FeatureNotAvailableError,
} from "@/modules/payments/errors";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type {
  CapabilitiesData,
  CheckEmployeeLimitData,
  CheckFeatureData,
  CheckFeaturesData,
  FeatureAccess,
} from "./limits.model";

/**
 * Gets the minimum plan required for a feature.
 * Queries the plan_features and subscription_plans tables to find
 * the lowest-tier public plan that includes the feature.
 */
async function getMinimumPlanForFeature(
  featureName: string
): Promise<string | null> {
  const [result] = await db
    .select({ name: schema.subscriptionPlans.name })
    .from(schema.planFeatures)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.planFeatures.planId, schema.subscriptionPlans.id)
    )
    .where(
      and(
        eq(schema.planFeatures.featureId, featureName),
        eq(schema.subscriptionPlans.isPublic, true),
        isNull(schema.subscriptionPlans.archivedAt)
      )
    )
    .orderBy(asc(schema.subscriptionPlans.sortOrder))
    .limit(1);

  if (!result) {
    return null;
  }
  return result.name.split("-")[0];
}

// Cache for plan display names (loaded from database)
let planDisplayNamesCache: Map<string, string> | null = null;

// Cache for feature display names (loaded from database)
let featureDisplayNamesCache: Map<string, string> | null = null;

/**
 * Clears the plan display names cache.
 * Useful for testing when plans are created dynamically.
 */
export function clearPlanDisplayNamesCache(): void {
  planDisplayNamesCache = null;
}

/**
 * Clears the feature display names cache.
 */
export function clearFeatureDisplayNamesCache(): void {
  featureDisplayNamesCache = null;
}

/**
 * Gets the display name for a feature from the database.
 * Falls back to the feature ID if not found.
 */
async function getFeatureDisplayName(featureId: string): Promise<string> {
  if (!featureDisplayNamesCache) {
    featureDisplayNamesCache = new Map();
    const features = await db
      .select({
        id: schema.features.id,
        displayName: schema.features.displayName,
      })
      .from(schema.features);

    for (const feature of features) {
      featureDisplayNamesCache.set(feature.id, feature.displayName);
    }
  }

  return featureDisplayNamesCache.get(featureId) ?? featureId;
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
      throw new FeatureNotAvailableError(
        result.featureDisplayName,
        result.requiredPlan ?? undefined
      );
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
    const [requiredPlanType, featureDisplayName] = await Promise.all([
      getMinimumPlanForFeature(featureName),
      getFeatureDisplayName(featureName),
    ]);
    const requiredPlan = requiredPlanType
      ? await getPlanDisplayName(requiredPlanType)
      : null;

    return {
      featureName,
      featureDisplayName,
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
        const [requiredPlanType, featureDisplayName] = await Promise.all([
          getMinimumPlanForFeature(featureName),
          getFeatureDisplayName(featureName),
        ]);
        const requiredPlan = requiredPlanType
          ? await getPlanDisplayName(requiredPlanType)
          : null;

        return {
          featureName,
          featureDisplayName,
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
    const { gt } = await import("drizzle-orm");
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

    const allFeatures = await db
      .select({
        id: schema.features.id,
        displayName: schema.features.displayName,
      })
      .from(schema.features)
      .where(eq(schema.features.isActive, true))
      .orderBy(schema.features.sortOrder);

    const features: FeatureAccess[] = await Promise.all(
      allFeatures.map(async (feature) => {
        const hasAccess = availableFeatures.includes(feature.id);
        const requiredPlanType = await getMinimumPlanForFeature(feature.id);
        const requiredPlan = requiredPlanType
          ? await getPlanDisplayName(requiredPlanType)
          : null;

        return {
          featureName: feature.id,
          featureDisplayName: feature.displayName,
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

  /**
   * Throws EmployeeCountExceedsTierLimitError if the organization's current
   * employee count exceeds the given maxEmployees.
   * Used to validate checkout/plan-change before creating payment links.
   */
  static async requireEmployeeCountFitsInTier(
    organizationId: string,
    maxEmployees: number
  ): Promise<void> {
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

    if (current > maxEmployees) {
      throw new EmployeeCountExceedsTierLimitError(current, maxEmployees);
    }
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
        planId: schema.subscriptionPlans.id,
        planName: schema.subscriptionPlans.name,
        planDisplayName: schema.subscriptionPlans.displayName,
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
      return {
        features: [],
        planName: "none",
        planDisplayName: "Sem plano",
        sortOrder: null,
      };
    }

    const hasAccess = result.status === "active";
    if (!hasAccess) {
      return {
        features: [],
        planName: "expired",
        planDisplayName: "Expirado",
        sortOrder: null,
      };
    }

    const featureRows = await db
      .select({ featureId: schema.planFeatures.featureId })
      .from(schema.planFeatures)
      .where(eq(schema.planFeatures.planId, result.planId));

    return {
      features: featureRows.map((r) => r.featureId),
      planName: result.planName,
      planDisplayName: result.planDisplayName,
      sortOrder: result.sortOrder,
    };
  }
}
