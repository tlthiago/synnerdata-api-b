/**
 * Service responsible for proration calculations and change type determination.
 * Handles the financial logic for subscription changes.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type BillingCycle = "monthly" | "yearly";
export type ChangeType = "upgrade" | "downgrade";

export type GetChangeTypeInput = {
  currentPlanPrice: number;
  newPlanPrice: number;
  currentBillingCycle: BillingCycle;
  newBillingCycle: BillingCycle;
};

export type CalculateProrationInput = {
  currentPlanPrice: number;
  newPlanPrice: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

export type PricingTier = {
  priceMonthly: number;
  priceYearly: number;
};

export abstract class ProrationService {
  /**
   * Determines whether a plan change is an upgrade or downgrade
   * based on price and billing cycle comparison.
   *
   * Priority:
   * 1. Billing cycle change takes precedence (commitment-based)
   *    - monthly→yearly = upgrade (more commitment)
   *    - yearly→monthly = downgrade (less commitment)
   * 2. Same billing cycle: compare normalized monthly prices
   */
  static getChangeType(input: GetChangeTypeInput): ChangeType {
    const {
      currentPlanPrice,
      newPlanPrice,
      currentBillingCycle,
      newBillingCycle,
    } = input;

    // Billing cycle change takes precedence (commitment-based logic)
    if (currentBillingCycle === "monthly" && newBillingCycle === "yearly") {
      return "upgrade";
    }

    if (currentBillingCycle === "yearly" && newBillingCycle === "monthly") {
      return "downgrade";
    }

    // Same billing cycle - compare prices directly
    // (no need to normalize since cycle is the same)
    if (newPlanPrice > currentPlanPrice) {
      return "upgrade";
    }

    if (newPlanPrice < currentPlanPrice) {
      return "downgrade";
    }

    return "upgrade"; // Default to upgrade for same price/cycle
  }

  /**
   * Calculates the proration amount for an upgrade.
   * Returns the proportional price difference based on remaining days in period.
   */
  static calculateProration(input: CalculateProrationInput): number {
    const {
      currentPlanPrice,
      newPlanPrice,
      currentPeriodStart,
      currentPeriodEnd,
    } = input;

    const priceDifference = newPlanPrice - currentPlanPrice;

    // No proration for downgrades or same price
    if (priceDifference <= 0) {
      return 0;
    }

    const now = new Date();
    const periodStartTime = currentPeriodStart.getTime();
    const periodEndTime = currentPeriodEnd.getTime();
    const nowTime = now.getTime();

    // Calculate total and remaining days
    const totalDays = (periodEndTime - periodStartTime) / MS_PER_DAY;
    const remainingDays = Math.max(0, (periodEndTime - nowTime) / MS_PER_DAY);

    // Calculate proportional amount
    const proration = Math.round(priceDifference * (remainingDays / totalDays));

    return proration;
  }

  /**
   * Calculates the period end date based on billing cycle.
   */
  static calculatePeriodEnd(startDate: Date, billingCycle: BillingCycle): Date {
    const endDate = new Date(startDate);

    if (billingCycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    return endDate;
  }

  /**
   * Gets the current price from a tier based on billing cycle.
   */
  static getCurrentPrice(
    tier: PricingTier,
    billingCycle: BillingCycle
  ): number {
    return billingCycle === "yearly" ? tier.priceYearly : tier.priceMonthly;
  }
}
