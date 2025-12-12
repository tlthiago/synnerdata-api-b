import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSubscriptions, pendingCheckouts } from "@/db/schema";
import type { OrgSubscription } from "@/db/schema/payments";

type WaitOptions = {
  timeout?: number; // default 30000ms
  interval?: number; // default 1000ms
};

/**
 * Aguarda a subscription mudar para status "active" via polling
 */
export async function waitForSubscriptionActive(
  organizationId: string,
  options: WaitOptions = {}
): Promise<OrgSubscription> {
  const { timeout = 30_000, interval = 1000 } = options;
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

/**
 * Aguarda o pending checkout ser marcado como completed
 */
export async function waitForCheckoutCompleted(
  paymentLinkId: string,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout = 30_000, interval = 1000 } = options;
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
