import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

type WaitOptions = {
  timeout?: number;
  interval?: number;
};

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_INTERVAL = 1000;

/**
 * Waits for a condition to be true via polling.
 *
 * @example
 * await waitFor(
 *   async () => {
 *     const status = await getStatus();
 *     return status === "completed";
 *   },
 *   { timeout: 5000 }
 * );
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT, interval = DEFAULT_INTERVAL } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout: condition was not met within ${timeout}ms`);
}

/**
 * Waits for subscription to reach a specific status via polling.
 */
export async function waitForSubscriptionStatus(
  organizationId: string,
  expectedStatus: string,
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

/**
 * Waits for pending checkout to be completed via polling.
 */
export async function waitForCheckoutCompleted(
  paymentLinkId: string,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT, interval = DEFAULT_INTERVAL } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const [checkout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, paymentLinkId))
      .limit(1);

    if (checkout?.status === "completed") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `Timeout: checkout ${paymentLinkId} was not completed within ${timeout}ms`
  );
}
