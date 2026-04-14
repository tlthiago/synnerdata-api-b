import { describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
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

  test("should cancel old and create new Pagarme subscription on downgrade", async () => {
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

    // Create billing profile with Pagarme customer ID
    const pagarmeCustomerId = `cus_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    await BillingProfileFactory.create({
      organizationId,
      pagarmeCustomerId,
    });

    const pagarmeSubId = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const cardId = `card_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const newPagarmeSubId = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

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

    // Mock Pagarme operations
    const { PagarmeClient } = await import("@/modules/payments/pagarme/client");
    const { PagarmePlanService } = await import(
      "@/modules/payments/pagarme/pagarme-plan.service"
    );

    const getSpy = spyOn(PagarmeClient, "getSubscription").mockResolvedValue({
      id: pagarmeSubId,
      card: {
        id: cardId,
        last_four_digits: "1234",
        brand: "visa",
        exp_month: 12,
        exp_year: 2030,
      },
    } as never);

    const cancelSpy = spyOn(
      PagarmeClient,
      "cancelSubscription"
    ).mockResolvedValue({} as never);

    const ensurePlanSpy = spyOn(
      PagarmePlanService,
      "ensurePlan"
    ).mockResolvedValue("pagarme_plan_123");

    const createSubSpy = spyOn(
      PagarmeClient,
      "createSubscription"
    ).mockResolvedValue({ id: newPagarmeSubId } as never);

    // Execute the scheduled change
    await PlanChangeService.executeScheduledChange(subscriptionId);

    // Verify old subscription was fetched for card info
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy.mock.calls[0][0]).toBe(pagarmeSubId);

    // Verify old subscription was canceled
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy.mock.calls[0][0]).toBe(pagarmeSubId);

    // Verify Pagarme plan was ensured for new tier
    expect(ensurePlanSpy).toHaveBeenCalledTimes(1);
    expect(ensurePlanSpy.mock.calls[0][0]).toBe(newTiers[0].id);
    expect(ensurePlanSpy.mock.calls[0][1]).toBe("monthly");

    // Verify new subscription was created with correct parameters
    expect(createSubSpy).toHaveBeenCalledTimes(1);
    const createArgs = createSubSpy.mock.calls[0][0];
    expect(createArgs.customer_id).toBe(pagarmeCustomerId);
    expect(createArgs.plan_id).toBe("pagarme_plan_123");
    expect(createArgs.payment_method).toBe("credit_card");
    expect(createArgs.card_id).toBe(cardId);
    expect(createArgs.metadata?.organization_id).toBe(organizationId);
    expect(createArgs.metadata?.is_downgrade).toBe("true");

    // Verify subscription was updated with new Pagarme subscription ID
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(newPlan.id);
    expect(subscription.pagarmeSubscriptionId).toBe(newPagarmeSubId);

    getSpy.mockRestore();
    cancelSpy.mockRestore();
    ensurePlanSpy.mockRestore();
    createSubSpy.mockRestore();
  });

  test("should proceed with null pagarmeSubscriptionId when card fetch fails", async () => {
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

    const { PagarmeClient } = await import("@/modules/payments/pagarme/client");

    // getSubscription fails - can't get card
    const getSpy = spyOn(PagarmeClient, "getSubscription").mockRejectedValue(
      new Error("Pagarme API error")
    );
    const cancelSpy = spyOn(
      PagarmeClient,
      "cancelSubscription"
    ).mockResolvedValue({} as never);

    await PlanChangeService.executeScheduledChange(subscriptionId);

    // Change should still complete, but without new Pagarme subscription
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(newPlan.id);
    expect(subscription.pricingTierId).toBe(newTiers[0].id);
    expect(subscription.pagarmeSubscriptionId).toBeNull();
    expect(subscription.pendingPlanId).toBeNull();

    getSpy.mockRestore();
    cancelSpy.mockRestore();
  });

  test("should proceed with null pagarmeSubscriptionId when createSubscription fails", async () => {
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

    const pagarmeCustomerId = `cus_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    await BillingProfileFactory.create({
      organizationId,
      pagarmeCustomerId,
    });

    const pagarmeSubId = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const cardId = `card_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

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

    const { PagarmeClient } = await import("@/modules/payments/pagarme/client");
    const { PagarmePlanService } = await import(
      "@/modules/payments/pagarme/pagarme-plan.service"
    );

    const getSpy = spyOn(PagarmeClient, "getSubscription").mockResolvedValue({
      id: pagarmeSubId,
      card: {
        id: cardId,
        last_four_digits: "1234",
        brand: "visa",
        exp_month: 12,
        exp_year: 2030,
      },
    } as never);

    const cancelSpy = spyOn(
      PagarmeClient,
      "cancelSubscription"
    ).mockResolvedValue({} as never);

    const ensurePlanSpy = spyOn(
      PagarmePlanService,
      "ensurePlan"
    ).mockResolvedValue("pagarme_plan_123");

    // createSubscription fails
    const createSubSpy = spyOn(
      PagarmeClient,
      "createSubscription"
    ).mockRejectedValue(new Error("Pagarme API error"));

    await PlanChangeService.executeScheduledChange(subscriptionId);

    // Change should still complete, but without new Pagarme subscription
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(newPlan.id);
    expect(subscription.pricingTierId).toBe(newTiers[0].id);
    expect(subscription.pagarmeSubscriptionId).toBeNull();
    expect(subscription.pendingPlanId).toBeNull();

    getSpy.mockRestore();
    cancelSpy.mockRestore();
    ensurePlanSpy.mockRestore();
    createSubSpy.mockRestore();
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

  test("should archive private plan after executing scheduled change", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    // Create a PRIVATE plan (org-specific custom plan — has organizationId)
    const { plan: privatePlan, tiers: privateTiers } =
      await PlanFactory.createCustom({
        organizationId,
        basePlanId: "plan-diamond",
        type: "diamond",
      });

    // Create a PUBLIC catalog plan to downgrade to
    const { plan: publicPlan, tiers: publicTiers } =
      await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      privatePlan.id
    );

    // Schedule a downgrade to the public plan
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - 1);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: publicPlan.id,
        pendingBillingCycle: "monthly",
        pendingPricingTierId: publicTiers[0].id,
        pricingTierId: privateTiers[0].id,
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

    // Verify subscription was updated to public plan
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(publicPlan.id);

    // Verify the private plan was archived
    const [archivedPlan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, privatePlan.id))
      .limit(1);

    expect(archivedPlan.archivedAt).toBeInstanceOf(Date);

    cancelSpy.mockRestore();
  });

  test("should NOT archive public plan after executing scheduled change", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    // Create two PUBLIC plans
    const { plan: diamondPlan, tiers: diamondTiers } =
      await PlanFactory.createPaid("diamond");
    const { plan: goldPlan, tiers: goldTiers } =
      await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      diamondPlan.id
    );

    // Schedule a downgrade
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - 1);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: goldPlan.id,
        pendingBillingCycle: "monthly",
        pendingPricingTierId: goldTiers[0].id,
        pricingTierId: diamondTiers[0].id,
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

    // Verify subscription was updated
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subscriptionId))
      .limit(1);

    expect(subscription.planId).toBe(goldPlan.id);

    // Verify the public diamond plan was NOT archived
    const [diamondPlanAfter] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, diamondPlan.id))
      .limit(1);

    expect(diamondPlanAfter.archivedAt).toBeNull();

    cancelSpy.mockRestore();
  });

  test("should NOT archive default trial plan after executing scheduled change", async () => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    // Create a trial plan (no organizationId — shared default)
    const { plan: trialPlan, tiers: trialTiers } =
      await PlanFactory.createTrial();

    // Create a PUBLIC catalog plan to change to
    const { plan: paidPlan, tiers: paidTiers } =
      await PlanFactory.createPaid("gold");

    const subscriptionId = await SubscriptionFactory.createActive(
      organizationId,
      trialPlan.id
    );

    // Schedule a change to the paid plan
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - 1);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: paidPlan.id,
        pendingBillingCycle: "monthly",
        pendingPricingTierId: paidTiers[0].id,
        pricingTierId: trialTiers[0].id,
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

    // Verify the default trial plan was NOT archived
    const [trialPlanAfter] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, trialPlan.id))
      .limit(1);

    expect(trialPlanAfter.archivedAt).toBeNull();

    cancelSpy.mockRestore();
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
