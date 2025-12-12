import { db } from "@/db";
import { pendingCheckouts } from "@/db/schema";

export type TestCheckout = {
  id: string;
  paymentLinkId: string;
  organizationId: string;
  planId: string;
};

type CreatePendingCheckoutOptions = {
  paymentLinkId?: string;
  expirationHours?: number;
};

/**
 * Creates a pending checkout for testing webhook flow.
 */
export async function createPendingCheckout(
  organizationId: string,
  planId: string,
  options: CreatePendingCheckoutOptions = {}
): Promise<TestCheckout> {
  const { expirationHours = 24 } = options;

  const id = `test-checkout-${crypto.randomUUID()}`;
  const paymentLinkId =
    options.paymentLinkId ??
    `pl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expirationHours);

  await db.insert(pendingCheckouts).values({
    id,
    organizationId,
    planId,
    paymentLinkId,
    status: "pending",
    expiresAt,
  });

  return {
    id,
    paymentLinkId,
    organizationId,
    planId,
  };
}

/**
 * Creates a pending checkout with a specific payment link ID.
 * Useful for testing webhook flows where you need to match the payment link.
 */
export function createPendingCheckoutWithPaymentLink(
  organizationId: string,
  planId: string,
  paymentLinkId: string
): Promise<TestCheckout> {
  return createPendingCheckout(organizationId, planId, { paymentLinkId });
}

type WaitOptions = {
  timeout?: number;
  interval?: number;
};

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_INTERVAL = 1000;

/**
 * Waits for pending checkout to be completed via polling.
 */
export async function waitForCheckoutCompleted(
  paymentLinkId: string,
  options: WaitOptions = {}
): Promise<void> {
  const { eq } = await import("drizzle-orm");
  const { timeout = DEFAULT_TIMEOUT, interval = DEFAULT_INTERVAL } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const [checkout] = await db
      .select()
      .from(pendingCheckouts)
      .where(eq(pendingCheckouts.paymentLinkId, paymentLinkId))
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
