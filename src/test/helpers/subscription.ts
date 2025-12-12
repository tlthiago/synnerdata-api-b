import { db } from "@/db";
import { orgSubscriptions } from "@/db/schema";

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
};

/**
 * Creates a test subscription for an organization.
 * Accepts either a status string or options object for backward compatibility.
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
    status = "trial",
    trialDays = 14,
    periodDays = 30,
    pagarmeSubscriptionId,
  } = options;

  const id = `test-sub-${crypto.randomUUID()}`;
  const now = new Date();

  const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  await db.insert(orgSubscriptions).values({
    id,
    organizationId,
    planId,
    status,
    pagarmeSubscriptionId,
    trialStart: status === "trial" ? now : null,
    trialEnd: status === "trial" ? trialEnd : null,
    trialUsed: status !== "trial",
    currentPeriodStart: status === "active" ? now : null,
    currentPeriodEnd: status === "active" ? periodEnd : null,
    cancelAtPeriodEnd: false,
    seats: 1,
  });

  return id;
}

/**
 * Creates a trial subscription.
 */
export function createTrialSubscription(
  organizationId: string,
  planId: string,
  trialDays = 14
): Promise<string> {
  return createTestSubscription(organizationId, planId, {
    status: "trial",
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
 * Waits for subscription to become active via polling.
 */
export async function waitForSubscriptionActive(
  organizationId: string,
  options: WaitOptions = {}
): Promise<typeof orgSubscriptions.$inferSelect> {
  const { eq } = await import("drizzle-orm");
  const { timeout = DEFAULT_TIMEOUT, interval = DEFAULT_INTERVAL } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const [subscription] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (subscription?.status === "active") {
      return subscription;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `Timeout: subscription for org ${organizationId} did not become active within ${timeout}ms`
  );
}
