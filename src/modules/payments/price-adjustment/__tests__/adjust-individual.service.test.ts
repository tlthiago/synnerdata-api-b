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
import { SubscriptionNotAdjustableError } from "../errors";
import { PriceAdjustmentService } from "../price-adjustment.service";

describe("PriceAdjustmentService.adjustIndividual", () => {
  let adminId: string;
  let getSubscriptionSpy: ReturnType<typeof spyOn>;
  let updateSubscriptionItemSpy: ReturnType<typeof spyOn>;
  let hookEmitSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    const adminResult = await createTestAdminUser();
    adminId = adminResult.user.id;
  });

  afterEach(() => {
    getSubscriptionSpy?.mockRestore();
    updateSubscriptionItemSpy?.mockRestore();
    hookEmitSpy?.mockRestore();
  });

  function mockPagarme(pagarmeSubId = "sub_mock_123") {
    getSubscriptionSpy = spyOn(
      PagarmeClient,
      "getSubscription"
    ).mockResolvedValue({
      id: pagarmeSubId,
      plan: { name: "Plan" },
      items: [
        { id: "item_mock_1", name: "Plan", quantity: 1, status: "active" },
      ],
    } as never);

    updateSubscriptionItemSpy = spyOn(
      PagarmeClient,
      "updateSubscriptionItem"
    ).mockResolvedValue({ id: pagarmeSubId } as never);

    hookEmitSpy = spyOn(PaymentHooks, "emit");
  }

  async function createActiveSubscription(options: {
    priceAtPurchase: number;
    billingCycle?: "monthly" | "yearly";
    pagarmeSubscriptionId?: string;
  }) {
    const organization = await createTestOrganization();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const subId = await SubscriptionFactory.createActive(
      organization.id,
      plan.id,
      {
        pricingTierId: tier.id,
        billingCycle: options.billingCycle ?? "monthly",
        pagarmeSubscriptionId: options.pagarmeSubscriptionId,
      }
    );

    // Set priceAtPurchase directly (factory doesn't support it)
    await db
      .update(schema.orgSubscriptions)
      .set({
        priceAtPurchase: options.priceAtPurchase,
        isCustomPrice: false,
      })
      .where(eq(schema.orgSubscriptions.id, subId));

    return { subId, organizationId: organization.id, plan, tier };
  }

  test("should throw SubscriptionNotAdjustableError for non-existent subscription", async () => {
    mockPagarme();

    await expect(
      PriceAdjustmentService.adjustIndividual({
        subscriptionId: "sub-does-not-exist",
        newPriceMonthly: 15_000,
        reason: "Test",
        adminId,
      })
    ).rejects.toThrow(SubscriptionNotAdjustableError);
  });

  test("should throw SubscriptionNotAdjustableError for canceled subscription", async () => {
    mockPagarme();
    const organization = await createTestOrganization();
    const { plan, tiers } = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier({ plan, tiers });

    const subId = await SubscriptionFactory.createCanceled(
      organization.id,
      plan.id
    );

    // Set a priceAtPurchase so we know it's rejected for status, not null price
    await db
      .update(schema.orgSubscriptions)
      .set({ priceAtPurchase: 9990, pricingTierId: tier.id })
      .where(eq(schema.orgSubscriptions.id, subId));

    await expect(
      PriceAdjustmentService.adjustIndividual({
        subscriptionId: subId,
        newPriceMonthly: 15_000,
        reason: "Test",
        adminId,
      })
    ).rejects.toThrow("not active");
  });

  test("should throw SubscriptionNotAdjustableError for trial subscription (priceAtPurchase null)", async () => {
    mockPagarme();
    const organization = await createTestOrganization();
    const { plan: trialPlan } = await PlanFactory.createTrial();

    const subId = await SubscriptionFactory.createTrial(
      organization.id,
      trialPlan.id
    );

    await expect(
      PriceAdjustmentService.adjustIndividual({
        subscriptionId: subId,
        newPriceMonthly: 15_000,
        reason: "Test",
        adminId,
      })
    ).rejects.toThrow("trial");
  });

  test("should update priceAtPurchase and isCustomPrice in DB", async () => {
    mockPagarme();
    const { subId } = await createActiveSubscription({
      priceAtPurchase: 9990,
    });

    const result = await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Annual price increase",
      adminId,
    });

    // Check return value
    expect(result.subscription.priceAtPurchase).toBe(12_990);
    expect(result.subscription.isCustomPrice).toBe(true);

    // Verify DB was actually updated
    const [updatedSub] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subId))
      .limit(1);

    expect(updatedSub.priceAtPurchase).toBe(12_990);
    expect(updatedSub.isCustomPrice).toBe(true);
  });

  test("should insert a price_adjustments record", async () => {
    mockPagarme();
    const { subId, organizationId } = await createActiveSubscription({
      priceAtPurchase: 9990,
    });

    const result = await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Annual price increase",
      adminId,
    });

    // Check return value
    expect(result.adjustment.oldPrice).toBe(9990);
    expect(result.adjustment.newPrice).toBe(12_990);
    expect(result.adjustment.reason).toBe("Annual price increase");
    expect(result.adjustment.adjustmentType).toBe("individual");
    expect(result.adjustment.billingCycle).toBe("monthly");
    expect(result.adjustment.adminId).toBe(adminId);
    expect(result.adjustment.id).toStartWith("price-adj-");

    // Verify record exists in DB
    const [record] = await db
      .select()
      .from(schema.priceAdjustments)
      .where(eq(schema.priceAdjustments.id, result.adjustment.id))
      .limit(1);

    expect(record).toBeDefined();
    expect(record.subscriptionId).toBe(subId);
    expect(record.organizationId).toBe(organizationId);
    expect(record.oldPrice).toBe(9990);
    expect(record.newPrice).toBe(12_990);
  });

  test("should emit subscription.priceAdjusted hook with correct payload", async () => {
    mockPagarme();
    const { subId } = await createActiveSubscription({
      priceAtPurchase: 9990,
    });

    await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Annual increase",
      adminId,
    });

    expect(hookEmitSpy).toHaveBeenCalledTimes(1);
    const [eventName, payload] = hookEmitSpy.mock.calls[0];
    expect(eventName).toBe("subscription.priceAdjusted");
    expect(payload.oldPrice).toBe(9990);
    expect(payload.newPrice).toBe(12_990);
    expect(payload.reason).toBe("Annual increase");
    expect(payload.adjustmentType).toBe("individual");
    expect(payload.adminId).toBe(adminId);
    expect(payload.subscription.priceAtPurchase).toBe(12_990);
    expect(payload.subscription.isCustomPrice).toBe(true);
  });

  test("should calculate yearly price correctly when billingCycle is yearly", async () => {
    mockPagarme();
    const { subId } = await createActiveSubscription({
      priceAtPurchase: 95_904, // yearly price
      billingCycle: "yearly",
    });

    await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Yearly adjustment",
      adminId,
    });

    // calculateYearlyPrice(12990, 20) = 12990 * 12 * 0.8 = 124704
    const expectedYearlyPrice = Math.round(12_990 * 12 * 0.8);

    const [updatedSub] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.id, subId))
      .limit(1);

    expect(updatedSub.priceAtPurchase).toBe(expectedYearlyPrice);
  });

  test("should NOT create a custom plan — only updates item pricing", async () => {
    mockPagarme();
    const { subId } = await createActiveSubscription({
      priceAtPurchase: 9990,
      pagarmeSubscriptionId: "sub_mock_123",
    });

    await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Test",
      adminId,
    });

    // Should update subscription item pricing, NOT create a new plan
    expect(getSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(updateSubscriptionItemSpy).toHaveBeenCalledTimes(1);
  });

  test("should call PagarmeClient.updateSubscriptionItem when pagarmeSubscriptionId exists", async () => {
    const pagarmeSubId = "sub_pagarme_test_123";
    mockPagarme(pagarmeSubId);
    const { subId } = await createActiveSubscription({
      priceAtPurchase: 9990,
      pagarmeSubscriptionId: pagarmeSubId,
    });

    await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Test",
      adminId,
    });

    expect(getSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(getSubscriptionSpy.mock.calls[0][0]).toBe(pagarmeSubId);

    expect(updateSubscriptionItemSpy).toHaveBeenCalledTimes(1);
    expect(updateSubscriptionItemSpy.mock.calls[0][0]).toBe(pagarmeSubId);
    expect(updateSubscriptionItemSpy.mock.calls[0][1]).toBe("item_mock_1");
    expect(updateSubscriptionItemSpy.mock.calls[0][2]).toEqual({
      description: "Plan",
      quantity: 1,
      status: "active",
      pricing_scheme: { price: 12_990, scheme_type: "unit" },
    });
  });

  test("should NOT call PagarmeClient.getSubscription when no pagarmeSubscriptionId", async () => {
    mockPagarme();
    const { subId } = await createActiveSubscription({
      priceAtPurchase: 9990,
      // no pagarmeSubscriptionId
    });

    await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Test",
      adminId,
    });

    expect(getSubscriptionSpy).not.toHaveBeenCalled();
    expect(updateSubscriptionItemSpy).not.toHaveBeenCalled();
  });

  test("should skip updateSubscriptionItem when Pagar.me subscription has no items (GAP 1)", async () => {
    const pagarmeSubId = "sub_no_items";
    getSubscriptionSpy = spyOn(
      PagarmeClient,
      "getSubscription"
    ).mockResolvedValue({
      id: pagarmeSubId,
      plan: { name: "Plan" },
      items: [], // empty items
    } as never);
    updateSubscriptionItemSpy = spyOn(
      PagarmeClient,
      "updateSubscriptionItem"
    ).mockResolvedValue({ id: pagarmeSubId } as never);
    hookEmitSpy = spyOn(PaymentHooks, "emit");

    const { subId } = await createActiveSubscription({
      priceAtPurchase: 9990,
      pagarmeSubscriptionId: pagarmeSubId,
    });

    const result = await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "No items test",
      adminId,
    });

    // getSubscription called, but updateSubscriptionItem NOT called
    expect(getSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(updateSubscriptionItemSpy).not.toHaveBeenCalled();

    // Service should still complete successfully
    expect(result.subscription.priceAtPurchase).toBe(12_990);
    expect(result.subscription.isCustomPrice).toBe(true);
  });

  test("should use plan's yearlyDiscountPercent for yearly price calculation (GAP 2)", async () => {
    mockPagarme();
    const { subId, plan } = await createActiveSubscription({
      priceAtPurchase: 9990,
      billingCycle: "yearly",
      pagarmeSubscriptionId: "sub_mock_123",
    });

    const result = await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Plan info test",
      adminId,
    });

    // Yearly price should use plan's yearlyDiscountPercent
    const expectedYearly = Math.round(
      12_990 * 12 * (1 - (plan.yearlyDiscountPercent ?? 20) / 100)
    );
    expect(result.adjustment.newPrice).toBe(expectedYearly);
    expect(result.subscription.priceAtPurchase).toBe(expectedYearly);
  });

  test("should work correctly when pricingTierId is null (GAP 3)", async () => {
    mockPagarme();
    const organization = await createTestOrganization();
    const { plan } = await PlanFactory.createPaid("gold");

    // Create subscription without a pricingTierId
    const subId = await SubscriptionFactory.createActive(
      organization.id,
      plan.id,
      { billingCycle: "monthly" } // no pricingTierId
    );

    await db
      .update(schema.orgSubscriptions)
      .set({ priceAtPurchase: 9990, isCustomPrice: false })
      .where(eq(schema.orgSubscriptions.id, subId));

    const result = await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Null tier test",
      adminId,
    });

    expect(result.subscription.priceAtPurchase).toBe(12_990);
    expect(result.subscription.isCustomPrice).toBe(true);
    expect(result.adjustment.pricingTierId).toBeNull();
  });

  test("should include original subscription fields in hook payload (GAP 4)", async () => {
    mockPagarme();
    const { subId, organizationId, plan, tier } =
      await createActiveSubscription({
        priceAtPurchase: 9990,
      });

    await PriceAdjustmentService.adjustIndividual({
      subscriptionId: subId,
      newPriceMonthly: 12_990,
      reason: "Hook fields test",
      adminId,
    });

    expect(hookEmitSpy).toHaveBeenCalledTimes(1);
    const [, payload] = hookEmitSpy.mock.calls[0];

    // Overridden fields
    expect(payload.subscription.priceAtPurchase).toBe(12_990);
    expect(payload.subscription.isCustomPrice).toBe(true);

    // Spread fields from original subscription
    expect(payload.subscription.id).toBe(subId);
    expect(payload.subscription.organizationId).toBe(organizationId);
    expect(payload.subscription.planId).toBe(plan.id);
    expect(payload.subscription.pricingTierId).toBe(tier.id);
    expect(payload.subscription.billingCycle).toBe("monthly");
    expect(payload.subscription.status).toBe("active");
  });
});
