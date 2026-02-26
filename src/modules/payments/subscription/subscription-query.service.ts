import { SubscriptionNotFoundError } from "@/modules/payments/errors";
import {
  findByOrganizationId,
  findWithPlan,
  type Subscription,
} from "./subscription.helpers";
import type {
  GetSubscriptionData,
  GetSubscriptionInput,
} from "./subscription.model";

/**
 * Service responsible for subscription read operations.
 * All methods are pure queries with no side effects.
 */
export abstract class SubscriptionQueryService {
  /**
   * Find subscription by organization ID.
   * Returns null if no subscription exists.
   *
   * @param organizationId - The organization ID to search for
   * @returns The subscription or null if not found
   */
  static findByOrganizationId(
    organizationId: string
  ): Promise<Subscription | null> {
    return findByOrganizationId(organizationId);
  }

  /**
   * Get subscription with plan details.
   * Throws SubscriptionNotFoundError if not found.
   *
   * @param input - Contains organizationId
   * @returns Subscription data with plan details
   * @throws SubscriptionNotFoundError if no subscription exists
   */
  static async getByOrganizationId(
    input: GetSubscriptionInput
  ): Promise<GetSubscriptionData> {
    const { organizationId } = input;

    const result = await findWithPlan(organizationId);

    if (!result) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    const { subscription, plan, pricingTier } = result;

    return {
      id: subscription.id,
      organizationId: subscription.organizationId,
      status: subscription.status,
      isTrial: plan.isTrial,
      plan: {
        id: plan.id,
        name: plan.name,
        displayName: plan.displayName,
        limits: plan.limits,
      },
      billingCycle: subscription.billingCycle as "monthly" | "yearly" | null,
      trialStart: subscription.trialStart?.toISOString() ?? null,
      trialEnd: subscription.trialEnd?.toISOString() ?? null,
      trialUsed: subscription.trialUsed,
      currentPeriodStart:
        subscription.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt?.toISOString() ?? null,
      seats: subscription.seats,
      pricingTier: pricingTier
        ? {
            id: pricingTier.id,
            minEmployees: pricingTier.minEmployees,
            maxEmployees: pricingTier.maxEmployees,
            priceMonthly: pricingTier.priceMonthly,
            priceYearly: pricingTier.priceYearly,
          }
        : null,
      priceAtPurchase: subscription.priceAtPurchase ?? null,
      isCustomPrice: subscription.isCustomPrice,
    };
  }

  /**
   * Check if organization has an active paid subscription.
   * A paid subscription is one with status "active" and not a trial plan.
   *
   * @param organizationId - The organization ID to check
   * @returns true if org has active paid subscription, false otherwise
   */
  static async hasPaidSubscription(organizationId: string): Promise<boolean> {
    const result = await findWithPlan(organizationId);

    // Paid subscription means active status AND not a trial plan
    return result?.subscription.status === "active" && !result.plan.isTrial;
  }
}
