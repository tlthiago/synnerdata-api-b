import { describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { PlanChangeService } from "../plan-change.service";

describe("PlanChangeService.executeScheduledChange", () => {
  test("should do nothing when subscription not found", async () => {
    // Call with non-existent subscription ID
    await PlanChangeService.executeScheduledChange("non-existent-sub-id");

    // Should not throw, just return silently
    expect(true).toBe(true);
  });

  test("should do nothing when no pending change is scheduled", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    const { plan } = await PlanFactory.createPaid("diamond");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      plan.id
    );

    // No pending change set - should exit early
    await PlanChangeService.executeScheduledChange(subscriptionId);

    // Verify subscription unchanged
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(plan.id);
    expect(subscription.pendingPlanId).toBeNull();
  });

  test("should execute scheduled plan change successfully", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    const { plan: currentPlan, tiers: currentTiers } =
      await PlanFactory.createPaid("diamond");
    const { plan: newPlan, tiers: newTiers } =
      await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      currentPlan.id
    );

    // Schedule a change
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - 1); // Past due

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: newPlan.id,
        pendingBillingCycle: "monthly",
        pendingPricingTierId: newTiers[0].id,
        planChangeAt: scheduledAt,
        pricingTierId: currentTiers[0].id,
      })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    // Mock Pagarme cancel (no real subscription to cancel)
    const { PagarmeClient } = await import("@/modules/payments/pagarme/client");
    const cancelSpy = spyOn(
      PagarmeClient,
      "cancelSubscription"
    ).mockResolvedValue({} as never);

    // Execute the scheduled change
    await PlanChangeService.executeScheduledChange(subscriptionId);

    // Verify subscription was updated
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(newPlan.id);
    expect(subscription.billingCycle).toBe("monthly");
    expect(subscription.pricingTierId).toBe(newTiers[0].id);
    expect(subscription.pendingPlanId).toBeNull();
    expect(subscription.pendingBillingCycle).toBeNull();
    expect(subscription.pendingPricingTierId).toBeNull();
    expect(subscription.planChangeAt).toBeNull();
    expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
    expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);

    cancelSpy.mockRestore();
  });

  test("should abort when pendingPricingTierId is missing", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    const { plan: currentPlan } = await PlanFactory.createPaid("diamond");
    const { plan: newPlan } = await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      currentPlan.id
    );

    // Schedule a change WITHOUT pendingPricingTierId
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - 1);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: newPlan.id,
        pendingBillingCycle: "monthly",
        pendingPricingTierId: null, // Missing!
        pricingTierId: null, // Also null
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    // Execute should abort silently
    await PlanChangeService.executeScheduledChange(subscriptionId);

    // Verify subscription was NOT changed (pending fields still there)
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(currentPlan.id);
    expect(subscription.pendingPlanId).toBe(newPlan.id);
  });

  // Note: Employee count validation at execution time is tested via the
  // EMPLOYEE_COUNT_EXCEEDS_NEW_PLAN_LIMIT test in change-subscription.test.ts
  // which covers the validation logic. The executeScheduledChange re-validates
  // using the same logic, so we trust the unit tests for that edge case.

  test("should cancel Pagarme subscription before executing change", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    const { plan: currentPlan, tiers: currentTiers } =
      await PlanFactory.createPaid("diamond");
    const { plan: newPlan, tiers: newTiers } =
      await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      currentPlan.id
    );

    const pagarmeSubId = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // Set up subscription with Pagarme ID and pending change
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - 1);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pagarmeSubscriptionId: pagarmeSubId,
        pendingPlanId: newPlan.id,
        pendingBillingCycle: "monthly",
        pendingPricingTierId: newTiers[0].id,
        pricingTierId: currentTiers[0].id,
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    // Mock Pagarme cancel
    const { PagarmeClient } = await import("@/modules/payments/pagarme/client");
    const cancelSpy = spyOn(
      PagarmeClient,
      "cancelSubscription"
    ).mockResolvedValue({} as never);

    // Execute the scheduled change
    await PlanChangeService.executeScheduledChange(subscriptionId);

    // Verify Pagarme cancel was called
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy.mock.calls[0][0]).toBe(pagarmeSubId);

    // Verify subscription was updated and pagarmeSubscriptionId cleared
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(newPlan.id);
    expect(subscription.pagarmeSubscriptionId).toBeNull();

    cancelSpy.mockRestore();
  });

  test("should handle concurrent cancellation gracefully", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    const { plan: currentPlan, tiers: currentTiers } =
      await PlanFactory.createPaid("diamond");
    const { plan: newPlan, tiers: newTiers } =
      await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      currentPlan.id
    );

    // Schedule a change
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - 1);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: newPlan.id,
        pendingBillingCycle: "monthly",
        pendingPricingTierId: newTiers[0].id,
        pricingTierId: currentTiers[0].id,
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    // Simulate user canceling the change before job runs
    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: null,
        pendingBillingCycle: null,
        pendingPricingTierId: null,
        planChangeAt: null,
      })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    // Execute should do nothing (change was canceled)
    await PlanChangeService.executeScheduledChange(subscriptionId);

    // Verify subscription unchanged
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(currentPlan.id);
    expect(subscription.pendingPlanId).toBeNull();
  });
});

describe("PlanChangeService.getScheduledChangesForExecution", () => {
  test("should return subscriptions with due scheduled changes", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    const { plan } = await PlanFactory.createPaid("diamond");
    const { plan: newPlan } = await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      plan.id
    );

    // Schedule a change for the past (due now)
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - 1);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: newPlan.id,
        pendingBillingCycle: "monthly",
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    const results = await PlanChangeService.getScheduledChangesForExecution();

    const found = results.find((r) => r.id === subscriptionId);
    expect(found).toBeDefined();
    expect(found?.organizationId).toBe(organizationId);
  });

  test("should not return subscriptions with future scheduled changes", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    const { plan } = await PlanFactory.createPaid("diamond");
    const { plan: newPlan } = await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      plan.id
    );

    // Schedule a change for the future
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: newPlan.id,
        pendingBillingCycle: "monthly",
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    const results = await PlanChangeService.getScheduledChangesForExecution();

    const found = results.find((r) => r.id === subscriptionId);
    expect(found).toBeUndefined();
  });

  test("should not return inactive subscriptions", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    const { plan } = await PlanFactory.createPaid("diamond");
    const { plan: newPlan } = await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      plan.id
    );

    // Schedule a change and mark as canceled
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - 1);

    await db
      .update(schema.orgSubscriptions)
      .set({
        status: "canceled",
        pendingPlanId: newPlan.id,
        pendingBillingCycle: "monthly",
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.id, subscriptionId));

    const results = await PlanChangeService.getScheduledChangesForExecution();

    const found = results.find((r) => r.id === subscriptionId);
    expect(found).toBeUndefined();
  });
});
