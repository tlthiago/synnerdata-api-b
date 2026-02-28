import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { TrialPlanMisconfiguredError } from "@/modules/payments/errors";
import { SubscriptionMutationService } from "@/modules/payments/subscription/subscription-mutation.service";
import { OrganizationFactory } from "@/test/factories/organization.factory";

describe("SubscriptionMutationService.createTrial", () => {
  test("should create trial subscription for new organization", async () => {
    const org = await OrganizationFactory.create();

    await SubscriptionMutationService.createTrial(org.id);

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);

    expect(subscription).toBeDefined();
    expect(subscription.status).toBe("active");
    expect(subscription.trialStart).toBeInstanceOf(Date);
    expect(subscription.trialEnd).toBeInstanceOf(Date);
    expect(subscription.trialUsed).toBe(true);
    expect(subscription.pricingTierId).toBeDefined();
    expect(subscription.seats).toBe(1);

    // Verify the plan used is a trial plan
    const [plan] = await db
      .select({ isTrial: schema.subscriptionPlans.isTrial })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, subscription.planId))
      .limit(1);

    expect(plan.isTrial).toBe(true);
  });

  test("should be idempotent — calling twice creates only one subscription", async () => {
    const org = await OrganizationFactory.create();

    await SubscriptionMutationService.createTrial(org.id);
    await SubscriptionMutationService.createTrial(org.id);

    const subscriptions = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id));

    expect(subscriptions).toHaveLength(1);
  });

  test("should throw TrialPlanMisconfiguredError when trial plan has no tiers", async () => {
    const org = await OrganizationFactory.create();

    // Disable all existing trial plans
    const existingTrialPlans = await db
      .select({ id: schema.subscriptionPlans.id })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.isTrial, true));

    for (const plan of existingTrialPlans) {
      await db
        .update(schema.subscriptionPlans)
        .set({ isTrial: false })
        .where(eq(schema.subscriptionPlans.id, plan.id));
    }

    // Create a trial plan without tiers
    const [misconfiguredPlan] = await db
      .insert(schema.subscriptionPlans)
      .values({
        id: `plan-${crypto.randomUUID()}`,
        name: `Misconfigured Trial ${crypto.randomUUID().slice(0, 8)}`,
        displayName: "Misconfigured Trial",
        isTrial: true,
        trialDays: 14,
        isActive: true,
        isPublic: false,
        sortOrder: 999,
      })
      .returning();

    try {
      await expect(
        SubscriptionMutationService.createTrial(org.id)
      ).rejects.toBeInstanceOf(TrialPlanMisconfiguredError);
    } finally {
      // Restore all original trial plans
      for (const plan of existingTrialPlans) {
        await db
          .update(schema.subscriptionPlans)
          .set({ isTrial: true })
          .where(eq(schema.subscriptionPlans.id, plan.id));
      }

      // Clean up the misconfigured plan
      await db
        .delete(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, misconfiguredPlan.id));
    }
  });
});
