import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { PaymentHooks } from "@/modules/payments/hooks";
import { PagarmeClient } from "@/modules/payments/pagarme/client";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { createTestOrganization } from "@/test/helpers/organization";
import { createTestAdminUser } from "@/test/helpers/user";
import { TierNotFoundForAdjustmentError } from "../errors";
import { PriceAdjustmentService } from "../price-adjustment.service";

describe("PriceAdjustmentService.adjustBulk", () => {
  let adminId: string;
  let updatePlanSpy: ReturnType<typeof spyOn>;
  let getSubscriptionSpy: ReturnType<typeof spyOn>;
  let updateSubscriptionItemSpy: ReturnType<typeof spyOn>;
  let hookEmitSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    const adminResult = await createTestAdminUser();
    adminId = adminResult.user.id;
  });

  afterEach(() => {
    updatePlanSpy?.mockRestore();
    getSubscriptionSpy?.mockRestore();
    updateSubscriptionItemSpy?.mockRestore();
    hookEmitSpy?.mockRestore();
  });

  function mockPagarme() {
    updatePlanSpy = spyOn(PagarmeClient, "updatePlan").mockResolvedValue({
      id: "plan_mock_123",
    } as never);
    getSubscriptionSpy = spyOn(
      PagarmeClient,
      "getSubscription"
    ).mockResolvedValue({
      id: "sub_mock_123",
      plan: { name: "Plan" },
      items: [
        { id: "item_mock_1", name: "Plan", quantity: 1, status: "active" },
      ],
    } as never);
    updateSubscriptionItemSpy = spyOn(
      PagarmeClient,
      "updateSubscriptionItem"
    ).mockResolvedValue({ id: "sub_mock_123" } as never);
    hookEmitSpy = spyOn(PaymentHooks, "emit");
  }

  test("should throw TierNotFoundForAdjustmentError for non-existent tier", async () => {
    mockPagarme();

    await expect(
      PriceAdjustmentService.adjustBulk({
        planId: "plan-nonexistent",
        pricingTierId: "tier-nonexistent",
        billingCycle: "monthly",
        newPriceMonthly: 15_000,
        reason: "Test",
        adminId,
      })
    ).rejects.toThrow(TierNotFoundForAdjustmentError);
  });

  test("should throw TierNotFoundForAdjustmentError when tier does not belong to plan", async () => {
    mockPagarme();
    const { plan: goldPlan } = await PlanFactory.createPaid("gold");
    const { tiers: diamondTiers } = await PlanFactory.createPaid("diamond");
    const diamondTier = diamondTiers[0];

    await expect(
      PriceAdjustmentService.adjustBulk({
        planId: goldPlan.id, // gold plan
        pricingTierId: diamondTier.id, // diamond tier — mismatch
        billingCycle: "monthly",
        newPriceMonthly: 15_000,
        reason: "Test",
        adminId,
      })
    ).rejects.toThrow(TierNotFoundForAdjustmentError);
  });

  test("should update planPricingTiers in DB for monthly billing", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const originalMonthly = tier.priceMonthly;
    const originalYearly = tier.priceYearly;

    await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 15_000,
      reason: "Catalog update",
      adminId,
    });

    const [updatedTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tier.id))
      .limit(1);

    // Monthly: should update both priceMonthly and priceYearly
    expect(updatedTier.priceMonthly).toBe(15_000);
    expect(updatedTier.priceMonthly).not.toBe(originalMonthly);

    // Yearly should be recalculated: 15000 * 12 * 0.8 = 144000
    const expectedYearly = Math.round(15_000 * 12 * 0.8);
    expect(updatedTier.priceYearly).toBe(expectedYearly);
    expect(updatedTier.priceYearly).not.toBe(originalYearly);
  });

  test("should update priceAtPurchase for all active subscriptions on the tier", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    // Create 3 organizations with active subscriptions on this tier
    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();
    const org3 = await createTestOrganization();

    const sub1Id = await SubscriptionFactory.createActive(org1.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });
    const sub2Id = await SubscriptionFactory.createActive(org2.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });
    const sub3Id = await SubscriptionFactory.createActive(org3.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });

    // Set priceAtPurchase for all
    for (const subId of [sub1Id, sub2Id, sub3Id]) {
      await db
        .update(schema.orgSubscriptions)
        .set({ priceAtPurchase: 9990 })
        .where(eq(schema.orgSubscriptions.id, subId));
    }

    const result = await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 12_990,
      reason: "Annual bulk increase",
      adminId,
    });

    expect(result.updatedCount).toBe(3);
    expect(result.catalogUpdated).toBe(true);
    expect(result.adjustments).toHaveLength(3);

    // Verify each subscription was updated in DB
    for (const subId of [sub1Id, sub2Id, sub3Id]) {
      const [sub] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subId))
        .limit(1);

      expect(sub.priceAtPurchase).toBe(12_990);
      expect(sub.isCustomPrice).toBe(true);
    }
  });

  test("should skip trial subscriptions (priceAtPurchase null) in bulk adjustment", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    // Create 1 paid subscription and 1 that looks like it has no price
    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();

    const sub1Id = await SubscriptionFactory.createActive(org1.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });
    await SubscriptionFactory.createActive(org2.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });

    // sub1 has a price, sub2 has null (simulate trial-like — we don't need its ID)
    await db
      .update(schema.orgSubscriptions)
      .set({ priceAtPurchase: 9990 })
      .where(eq(schema.orgSubscriptions.id, sub1Id));

    const result = await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 12_990,
      reason: "Bulk test",
      adminId,
    });

    // Only sub1 should be adjusted
    expect(result.updatedCount).toBe(1);
    expect(result.adjustments[0].subscriptionId).toBe(sub1Id);
  });

  test("should create price_adjustments records for each subscription", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();

    const sub1Id = await SubscriptionFactory.createActive(org1.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });
    const sub2Id = await SubscriptionFactory.createActive(org2.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });

    for (const subId of [sub1Id, sub2Id]) {
      await db
        .update(schema.orgSubscriptions)
        .set({ priceAtPurchase: 9990 })
        .where(eq(schema.orgSubscriptions.id, subId));
    }

    const result = await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 12_990,
      reason: "Bulk records test",
      adminId,
    });

    // Verify records in DB
    for (const adjustment of result.adjustments) {
      const [record] = await db
        .select()
        .from(schema.priceAdjustments)
        .where(eq(schema.priceAdjustments.id, adjustment.id))
        .limit(1);

      expect(record).toBeDefined();
      expect(record.oldPrice).toBe(9990);
      expect(record.newPrice).toBe(12_990);
      expect(record.adjustmentType).toBe("bulk");
      expect(record.pricingTierId).toBe(tier.id);
      expect(record.adminId).toBe(adminId);
    }
  });

  test("should emit subscription.priceAdjusted hook for each subscription", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();

    const sub1Id = await SubscriptionFactory.createActive(org1.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });
    const sub2Id = await SubscriptionFactory.createActive(org2.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });

    for (const subId of [sub1Id, sub2Id]) {
      await db
        .update(schema.orgSubscriptions)
        .set({ priceAtPurchase: 9990 })
        .where(eq(schema.orgSubscriptions.id, subId));
    }

    await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 12_990,
      reason: "Hook test",
      adminId,
    });

    // Should have been called once per subscription
    expect(hookEmitSpy).toHaveBeenCalledTimes(2);

    for (const call of hookEmitSpy.mock.calls) {
      const [eventName, payload] = call;
      expect(eventName).toBe("subscription.priceAdjusted");
      expect(payload.oldPrice).toBe(9990);
      expect(payload.newPrice).toBe(12_990);
      expect(payload.adjustmentType).toBe("bulk");
      expect(payload.adminId).toBe(adminId);
    }
  });

  test("should NOT affect subscriptions on different billing cycle", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();

    // sub1 monthly, sub2 yearly
    const sub1Id = await SubscriptionFactory.createActive(org1.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });
    const sub2Id = await SubscriptionFactory.createActive(org2.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "yearly",
    });

    for (const subId of [sub1Id, sub2Id]) {
      await db
        .update(schema.orgSubscriptions)
        .set({ priceAtPurchase: 9990 })
        .where(eq(schema.orgSubscriptions.id, subId));
    }

    const result = await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly", // only monthly
      newPriceMonthly: 12_990,
      reason: "Cycle filter test",
      adminId,
    });

    // Only sub1 (monthly) should be affected
    expect(result.updatedCount).toBe(1);
    expect(result.adjustments[0].subscriptionId).toBe(sub1Id);

    // sub2 should be unchanged
    const [sub2] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, sub2Id))
      .limit(1);

    expect(sub2.priceAtPurchase).toBe(9990); // unchanged
  });

  test("should call updateSubscriptionItem for subscriptions with pagarmeSubscriptionId", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();

    const sub1Id = await SubscriptionFactory.createActive(org1.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
      pagarmeSubscriptionId: "pagarme_sub_1",
    });
    const sub2Id = await SubscriptionFactory.createActive(org2.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
      pagarmeSubscriptionId: "pagarme_sub_2",
    });

    for (const subId of [sub1Id, sub2Id]) {
      await db
        .update(schema.orgSubscriptions)
        .set({ priceAtPurchase: 9990 })
        .where(eq(schema.orgSubscriptions.id, subId));
    }

    await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 12_990,
      reason: "Pagar.me item update test",
      adminId,
    });

    expect(getSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(updateSubscriptionItemSpy).toHaveBeenCalledTimes(2);

    for (const call of updateSubscriptionItemSpy.mock.calls) {
      const [, , data] = call;
      expect(data.pricing_scheme.price).toBe(12_990);
      expect(data.pricing_scheme.scheme_type).toBe("unit");
    }
  });

  test("should include isCustomPrice in hook payload for each subscription (GAP 8)", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const org = await createTestOrganization();
    const subId = await SubscriptionFactory.createActive(org.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
    });

    await db
      .update(schema.orgSubscriptions)
      .set({ priceAtPurchase: 9990 })
      .where(eq(schema.orgSubscriptions.id, subId));

    await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 12_990,
      reason: "Hook isCustomPrice test",
      adminId,
    });

    expect(hookEmitSpy).toHaveBeenCalledTimes(1);
    const [, payload] = hookEmitSpy.mock.calls[0];
    expect(payload.subscription.isCustomPrice).toBe(true);
    expect(payload.subscription.priceAtPurchase).toBe(12_990);
    expect(payload.subscription.organizationId).toBeDefined();
    expect(payload.subscription.planId).toBeDefined();
  });

  test("should skip updatePlan when tier has no Pagar.me plan ID (GAP 5)", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    // PlanFactory doesn't set pagarmePlanIdMonthly/Yearly, so they're null
    // Confirm the tier has no Pagar.me plan ID
    expect(tier.pagarmePlanIdMonthly).toBeNull();

    await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 15_000,
      reason: "No Pagar.me plan test",
      adminId,
    });

    // updatePlan should NOT have been called
    expect(updatePlanSpy).not.toHaveBeenCalled();
  });

  test("should call updatePlan with correct args when tier has Pagar.me plan ID (GAP 7)", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    // Manually set pagarmePlanIdMonthly on the tier
    await db
      .update(schema.planPricingTiers)
      .set({ pagarmePlanIdMonthly: "plan_pagarme_abc" })
      .where(eq(schema.planPricingTiers.id, tier.id));

    await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 15_000,
      reason: "UpdatePlan args test",
      adminId,
    });

    expect(updatePlanSpy).toHaveBeenCalledTimes(1);
    expect(updatePlanSpy).toHaveBeenCalledWith("plan_pagarme_abc", {
      items: [
        {
          name: plan.displayName,
          quantity: 1,
          pricing_scheme: {
            price: 15_000,
            scheme_type: "unit",
          },
        },
      ],
    });
  });

  test("should return updatedCount 0 and no hooks when no subscriptions match (GAP 6)", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    // No subscriptions created for this tier
    const result = await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 15_000,
      reason: "Empty subs test",
      adminId,
    });

    expect(result.updatedCount).toBe(0);
    expect(result.adjustments).toHaveLength(0);
    expect(result.catalogUpdated).toBe(true);
    expect(hookEmitSpy).not.toHaveBeenCalled();
    expect(getSubscriptionSpy).not.toHaveBeenCalled();
    expect(updateSubscriptionItemSpy).not.toHaveBeenCalled();
  });

  test("should handle mixed pagarmeSubscriptionId (some null, some set) in bulk (GAP 9)", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();

    // sub1 has pagarmeSubscriptionId, sub2 does not
    const sub1Id = await SubscriptionFactory.createActive(org1.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
      pagarmeSubscriptionId: "pagarme_sub_mixed",
    });
    const sub2Id = await SubscriptionFactory.createActive(org2.id, plan.id, {
      pricingTierId: tier.id,
      billingCycle: "monthly",
      // no pagarmeSubscriptionId
    });

    for (const subId of [sub1Id, sub2Id]) {
      await db
        .update(schema.orgSubscriptions)
        .set({ priceAtPurchase: 9990 })
        .where(eq(schema.orgSubscriptions.id, subId));
    }

    const result = await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "monthly",
      newPriceMonthly: 12_990,
      reason: "Mixed Pagar.me ID test",
      adminId,
    });

    // Both should be adjusted in DB
    expect(result.updatedCount).toBe(2);

    // But only sub1 should trigger Pagar.me calls
    expect(getSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(getSubscriptionSpy).toHaveBeenCalledWith("pagarme_sub_mixed");
    expect(updateSubscriptionItemSpy).toHaveBeenCalledTimes(1);

    // Both subscriptions should have updated DB values
    for (const subId of [sub1Id, sub2Id]) {
      const [sub] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subId))
        .limit(1);

      expect(sub.priceAtPurchase).toBe(12_990);
      expect(sub.isCustomPrice).toBe(true);
    }
  });

  test("should update both priceMonthly and priceYearly for yearly billing cycle", async () => {
    mockPagarme();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const originalMonthly = tier.priceMonthly;
    const originalYearly = tier.priceYearly;

    await PriceAdjustmentService.adjustBulk({
      planId: plan.id,
      pricingTierId: tier.id,
      billingCycle: "yearly",
      newPriceMonthly: 15_000,
      reason: "Yearly catalog update",
      adminId,
    });

    const [updatedTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tier.id))
      .limit(1);

    // Both should be updated, even for yearly billing cycle
    expect(updatedTier.priceMonthly).toBe(15_000);
    expect(updatedTier.priceMonthly).not.toBe(originalMonthly);

    const expectedYearly = Math.round(15_000 * 12 * 0.8);
    expect(updatedTier.priceYearly).toBe(expectedYearly);
    expect(updatedTier.priceYearly).not.toBe(originalYearly);
  });
});
