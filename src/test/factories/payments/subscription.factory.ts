import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

type Subscription = typeof schema.orgSubscriptions.$inferSelect;

/**
 * Valid subscription statuses for the database.
 *
 * Note: Trial is determined by plan.isTrial, not by status.
 * All subscriptions (including trial) use "active" status when in good standing.
 */
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "expired";

type CreateSubscriptionOptions = {
  status?: SubscriptionStatus;
  trialDays?: number;
  periodDays?: number;
  pagarmeSubscriptionId?: string;
  pricingTierId?: string;
  billingCycle?: "monthly" | "yearly";
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
};

function generateSubscriptionId(): string {
  return `sub-${crypto.randomUUID()}`;
}

/**
 * Factory for creating test subscriptions.
 *
 * Follows Elysia's recommended pattern of abstract class with static methods.
 *
 * IMPORTANT: Trial subscriptions are identified by the plan's isTrial flag,
 * not by subscription status. Use a trial plan (with isTrial=true) to create
 * a proper trial subscription.
 *
 * @example
 * // Create a trial subscription (plan must be trial)
 * const subId = await SubscriptionFactory.createTrial(orgId, trialPlanId);
 *
 * // Create an active paid subscription
 * const subId = await SubscriptionFactory.createActive(orgId, paidPlanId);
 *
 * // Create with custom options
 * const subId = await SubscriptionFactory.create(orgId, planId, {
 *   status: "past_due",
 *   pagarmeSubscriptionId: "sub_123",
 * });
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Factory pattern for test utilities
export abstract class SubscriptionFactory {
  /**
   * Creates a test subscription for an organization.
   */
  static async create(
    organizationId: string,
    planId: string,
    options: CreateSubscriptionOptions = {}
  ): Promise<string> {
    const {
      status = "active",
      trialDays = 14,
      periodDays = 30,
      pagarmeSubscriptionId,
      pricingTierId,
      billingCycle = "monthly",
      cancelAtPeriodEnd = false,
      currentPeriodStart: customPeriodStart,
      currentPeriodEnd: customPeriodEnd,
    } = options;

    // Check if the plan is a trial plan
    const [plan] = await db
      .select({ isTrial: schema.subscriptionPlans.isTrial })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    const isTrialPlan = plan?.isTrial ?? false;

    const id = generateSubscriptionId();
    const now = new Date();

    const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const defaultPeriodEnd = new Date(
      now.getTime() + periodDays * 24 * 60 * 60 * 1000
    );

    // Use custom period dates if provided, otherwise compute defaults
    const periodStart =
      customPeriodStart ?? (status === "active" && !isTrialPlan ? now : null);
    const periodEnd =
      customPeriodEnd ??
      (status === "active" && !isTrialPlan ? defaultPeriodEnd : null);

    await db.insert(schema.orgSubscriptions).values({
      id,
      organizationId,
      planId,
      status,
      pagarmeSubscriptionId,
      pricingTierId,
      billingCycle,
      trialStart: isTrialPlan ? now : null,
      trialEnd: isTrialPlan ? trialEnd : null,
      trialUsed: !isTrialPlan,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
      seats: 1,
    });

    return id;
  }

  /**
   * Creates a trial subscription.
   * Note: The planId should point to a plan with isTrial=true for proper trial behavior.
   */
  static createTrial(
    organizationId: string,
    planId: string,
    trialDays = 14
  ): Promise<string> {
    return SubscriptionFactory.create(organizationId, planId, {
      status: "active",
      trialDays,
    });
  }

  /**
   * Creates an active (paid) subscription.
   */
  static createActive(
    organizationId: string,
    planId: string,
    options: Omit<CreateSubscriptionOptions, "status"> = {}
  ): Promise<string> {
    return SubscriptionFactory.create(organizationId, planId, {
      ...options,
      status: "active",
    });
  }

  /**
   * Creates a canceled subscription.
   */
  static createCanceled(
    organizationId: string,
    planId: string
  ): Promise<string> {
    return SubscriptionFactory.create(organizationId, planId, {
      status: "canceled",
    });
  }

  /**
   * Creates an expired subscription.
   */
  static createExpired(
    organizationId: string,
    planId: string
  ): Promise<string> {
    return SubscriptionFactory.create(organizationId, planId, {
      status: "expired",
    });
  }

  /**
   * Creates a past_due subscription.
   */
  static createPastDue(
    organizationId: string,
    planId: string
  ): Promise<string> {
    return SubscriptionFactory.create(organizationId, planId, {
      status: "past_due",
    });
  }

  /**
   * Gets a subscription by organization ID.
   */
  static async getByOrganizationId(
    organizationId: string
  ): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    return subscription;
  }
}
