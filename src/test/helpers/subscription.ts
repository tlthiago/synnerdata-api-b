import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

/**
 * Subscription status for database storage.
 * Note: "trial" is kept for backward compatibility in tests but maps to "active" status.
 * Trial is now determined by plan.isTrial, not by subscription status.
 */
export type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

type CreateTestSubscriptionOptions = {
  status?: SubscriptionStatus;
  trialDays?: number;
  periodDays?: number;
  pagarmeSubscriptionId?: string;
  pricingTierId?: string;
};

/**
 * Creates a test subscription for an organization.
 * Accepts either a status string or options object for backward compatibility.
 *
 * IMPORTANT: "trial" status is now mapped to "active" status.
 * Trial subscriptions are identified by the plan's isTrial flag, not by status.
 * To create a proper trial subscription, use a trial plan (with isTrial=true).
 */
export async function createTestSubscription(
  organizationId: string,
  planId: string,
  statusOrOptions?: SubscriptionStatus | CreateTestSubscriptionOptions
): Promise<string> {
  const options: CreateTestSubscriptionOptions =
    typeof statusOrOptions === "string"
      ? { status: statusOrOptions }
      : (statusOrOptions ?? {});

  const {
    status: inputStatus = "trial",
    trialDays = 14,
    periodDays = 30,
    pagarmeSubscriptionId,
    pricingTierId,
  } = options;

  // Check if the plan is a trial plan
  const [plan] = await db
    .select({ isTrial: schema.subscriptionPlans.isTrial })
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .limit(1);

  const isTrialPlan = plan?.isTrial ?? false;

  // Map "trial" status to "active" - trial is now determined by plan.isTrial
  const status = inputStatus === "trial" ? "active" : inputStatus;

  // For trial plans or when inputStatus was "trial", set trial dates
  const shouldSetTrialDates = isTrialPlan || inputStatus === "trial";

  const id = `test-sub-${crypto.randomUUID()}`;
  const now = new Date();

  const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  await db.insert(schema.orgSubscriptions).values({
    id,
    organizationId,
    planId,
    status,
    pagarmeSubscriptionId,
    pricingTierId,
    trialStart: shouldSetTrialDates ? now : null,
    trialEnd: shouldSetTrialDates ? trialEnd : null,
    trialUsed: !shouldSetTrialDates,
    currentPeriodStart:
      status === "active" && !shouldSetTrialDates ? now : null,
    currentPeriodEnd:
      status === "active" && !shouldSetTrialDates ? periodEnd : null,
    cancelAtPeriodEnd: false,
    seats: 1,
  });

  return id;
}

/**
 * Creates a trial subscription using a trial plan.
 * Note: The planId should point to a plan with isTrial=true for proper trial behavior.
 * Status will be "active" but with trial dates set.
 */
export function createTrialSubscription(
  organizationId: string,
  planId: string,
  trialDays = 14
): Promise<string> {
  return createTestSubscription(organizationId, planId, {
    status: "trial", // Will be mapped to "active"
    trialDays,
  });
}

/**
 * Creates an active (paid) subscription.
 */
export function createActiveSubscription(
  organizationId: string,
  planId: string,
  pagarmeSubscriptionId?: string
): Promise<string> {
  return createTestSubscription(organizationId, planId, {
    status: "active",
    pagarmeSubscriptionId,
  });
}

/**
 * Creates a canceled subscription.
 */
export function createCanceledSubscription(
  organizationId: string,
  planId: string
): Promise<string> {
  return createTestSubscription(organizationId, planId, {
    status: "canceled",
  });
}

/**
 * Creates an expired subscription.
 */
export function createExpiredSubscription(
  organizationId: string,
  planId: string
): Promise<string> {
  return createTestSubscription(organizationId, planId, {
    status: "expired",
  });
}

type WaitOptions = {
  timeout?: number;
  interval?: number;
};

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_INTERVAL = 1000;

/**
 * Waits for subscription to reach a specific status via polling.
 */
export async function waitForSubscriptionStatus(
  organizationId: string,
  expectedStatus: SubscriptionStatus,
  options: WaitOptions = {}
): Promise<typeof schema.orgSubscriptions.$inferSelect> {
  const { timeout = DEFAULT_TIMEOUT, interval = DEFAULT_INTERVAL } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (subscription?.status === expectedStatus) {
      return subscription;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `Timeout: subscription for org ${organizationId} did not reach status "${expectedStatus}" within ${timeout}ms`
  );
}

/**
 * Waits for subscription to become active via polling.
 */
export function waitForSubscriptionActive(
  organizationId: string,
  options: WaitOptions = {}
): Promise<typeof schema.orgSubscriptions.$inferSelect> {
  return waitForSubscriptionStatus(organizationId, "active", options);
}
