import { db } from "@/db";
import { orgSubscriptions, subscriptionPlans } from "@/db/schema";
import { testPlans } from "../fixtures/plans";

/**
 * Seeds subscription plans for testing
 */
export async function seedPlans() {
  for (const plan of testPlans) {
    await db
      .insert(subscriptionPlans)
      .values(plan)
      .onConflictDoNothing({ target: subscriptionPlans.id });
  }
}

/**
 * Creates a test subscription for an organization
 */
export async function createTestSubscription(
  organizationId: string,
  planId: string,
  status: "trial" | "active" | "past_due" | "canceled" | "expired" = "trial"
) {
  const id = `test-sub-${crypto.randomUUID()}`;
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

  await db.insert(orgSubscriptions).values({
    id,
    organizationId,
    planId,
    status,
    trialStart: status === "trial" ? now : null,
    trialEnd: status === "trial" ? trialEnd : null,
    trialUsed: status !== "trial",
    currentPeriodStart: status === "active" ? now : null,
    currentPeriodEnd:
      status === "active"
        ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        : null,
    cancelAtPeriodEnd: false,
    seats: 1,
  });

  return id;
}

/**
 * Creates a pending checkout for testing webhook flow
 */
export async function createPendingCheckout(
  organizationId: string,
  planId: string,
  paymentLinkId?: string
) {
  const id = `test-checkout-${crypto.randomUUID()}`;
  const linkId =
    paymentLinkId ?? `pl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { pendingCheckouts } = await import("@/db/schema");

  await db.insert(pendingCheckouts).values({
    id,
    organizationId,
    planId,
    paymentLinkId: linkId,
    status: "pending",
    expiresAt,
  });

  return { id, paymentLinkId: linkId };
}
