import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import { BillingService } from "@/modules/payments/billing/billing.service";
import { CustomerService } from "@/modules/payments/customer/customer.service";
import {
  BillingProfileRequiredError,
  OrganizationNotFoundError,
  TrialPlanAsBaseError,
} from "@/modules/payments/errors";
import {
  PAGARME_RETRY_CONFIG,
  PagarmeClient,
} from "@/modules/payments/pagarme/client";
import type { CreatePaymentLinkRequest } from "@/modules/payments/pagarme/pagarme.types";
import { PagarmePlanService } from "@/modules/payments/pagarme/pagarme-plan.service";
import { calculateYearlyPrice } from "@/modules/payments/plans/plans.constants";
import { PlansService } from "@/modules/payments/plans/plans.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type {
  AdminCheckoutData,
  CreateAdminCheckoutInput,
} from "./admin-checkout.model";

const CHECKOUT_EXPIRATION_HOURS = 24;

export abstract class AdminCheckoutService {
  static async create(
    input: CreateAdminCheckoutInput
  ): Promise<AdminCheckoutData> {
    const {
      organizationId,
      adminUserId,
      basePlanId,
      minEmployees,
      maxEmployees,
      billingCycle = "monthly",
      customPriceMonthly,
      successUrl,
      notes,
      billing,
    } = input;

    // 1. Validate organization exists
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new OrganizationNotFoundError(organizationId);
    }

    // 2. Validate no active paid subscription
    await SubscriptionService.ensureNoPaidSubscription(organizationId);

    // 3. Validate base plan (must be active, non-trial)
    const basePlan = await PlansService.getAvailableById(basePlanId);

    if (basePlan.isTrial) {
      throw new TrialPlanAsBaseError(basePlanId);
    }

    // 4. Handle billing profile
    await AdminCheckoutService.ensureBillingProfile(organizationId, billing);

    // 5. Get or create Pagarme customer
    const { pagarmeCustomerId } =
      await CustomerService.getOrCreateForCheckout(organizationId);

    // 6. Calculate prices
    const basePlanDiscount = basePlan.yearlyDiscountPercent ?? 20;
    const customPriceYearly = calculateYearlyPrice(
      customPriceMonthly,
      basePlanDiscount
    );
    const effectivePrice =
      billingCycle === "monthly" ? customPriceMonthly : customPriceYearly;

    const matchingTier = basePlan.pricingTiers.find(
      (tier) =>
        tier.minEmployees === minEmployees && tier.maxEmployees === maxEmployees
    );
    const catalogPriceMonthly = matchingTier?.priceMonthly ?? 0;
    const discountPercentage =
      catalogPriceMonthly > 0
        ? Math.round(
            ((catalogPriceMonthly - customPriceMonthly) / catalogPriceMonthly) *
              100
          )
        : 0;

    // 7. Create private plan + tier in transaction
    const privatePlanId = `plan-${crypto.randomUUID()}`;
    const privateTierId = `tier-${crypto.randomUUID()}`;
    const timestamp = Date.now();
    const privatePlanName = `custom-${basePlan.name}-${organizationId}-${timestamp}`;

    await db.transaction(async (tx) => {
      await tx.insert(schema.subscriptionPlans).values({
        id: privatePlanId,
        name: privatePlanName,
        displayName: basePlan.displayName,
        description: `Custom plan based on ${basePlan.displayName} for org ${organizationId}`,
        trialDays: 0,
        isActive: true,
        isPublic: false,
        isTrial: false,
        sortOrder: basePlan.sortOrder,
        yearlyDiscountPercent: basePlanDiscount,
        organizationId,
        basePlanId,
      });

      // Copy features from base plan
      const baseFeatures = await tx
        .select({ featureId: schema.planFeatures.featureId })
        .from(schema.planFeatures)
        .where(eq(schema.planFeatures.planId, basePlanId));

      if (baseFeatures.length > 0) {
        await tx.insert(schema.planFeatures).values(
          baseFeatures.map((f) => ({
            planId: privatePlanId,
            featureId: f.featureId,
          }))
        );
      }

      await tx.insert(schema.planPricingTiers).values({
        id: privateTierId,
        planId: privatePlanId,
        minEmployees,
        maxEmployees,
        priceMonthly: customPriceMonthly,
        priceYearly: customPriceYearly,
      });
    });

    // 8. Create custom Pagarme plan
    const pagarmePlanId = await PagarmePlanService.createCustomPlan({
      plan: {
        id: privatePlanId,
        name: basePlan.name,
        displayName: basePlan.displayName,
      },
      tier: { id: privateTierId, minEmployees, maxEmployees },
      billingCycle,
      price: effectivePrice,
    });

    // 9. Create payment link
    const tierLabel = `${minEmployees}-${maxEmployees} funcionarios`;
    const paymentLinkData: CreatePaymentLinkRequest = {
      type: "subscription",
      name: `${basePlan.displayName} (${tierLabel})${billingCycle === "yearly" ? " - Anual" : ""} [Custom]`,
      payment_settings: {
        accepted_payment_methods: ["credit_card"],
        credit_card_settings: {
          operation_type: "auth_and_capture",
        },
      },
      cart_settings: {
        recurrences: [
          {
            start_in: 1,
            plan_id: pagarmePlanId,
          },
        ],
      },
      success_url: successUrl,
      max_paid_sessions: 1,
      metadata: {
        organization_id: organizationId,
        plan_id: privatePlanId,
        pricing_tier_id: privateTierId,
        billing_cycle: billingCycle,
        is_custom_price: "true",
        custom_price_monthly: String(customPriceMonthly),
        custom_price_yearly: String(customPriceYearly),
      },
      customer_settings: {
        customer_id: pagarmeCustomerId,
      },
    };

    const paymentLink = await Retry.withRetry(
      () =>
        PagarmeClient.createPaymentLink(
          paymentLinkData,
          `admin-checkout-${organizationId}-${privatePlanId}-${Date.now()}`
        ),
      PAGARME_RETRY_CONFIG.WRITE
    );

    // 10. Save pending checkout
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHECKOUT_EXPIRATION_HOURS);

    await db.insert(schema.pendingCheckouts).values({
      id: `checkout-${crypto.randomUUID()}`,
      organizationId,
      planId: privatePlanId,
      pricingTierId: privateTierId,
      billingCycle,
      paymentLinkId: paymentLink.id,
      status: "pending",
      expiresAt,
      customPriceMonthly,
      customPriceYearly,
      createdByAdminId: adminUserId,
      notes: notes ?? null,
      pagarmePlanId,
    });

    // 11. Return checkout data
    return {
      checkoutUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
      privatePlanId,
      privateTierId,
      customPriceMonthly,
      customPriceYearly,
      catalogPriceMonthly,
      discountPercentage,
      basePlanDisplayName: basePlan.displayName,
      minEmployees,
      maxEmployees,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private static async ensureBillingProfile(
    organizationId: string,
    billing?: {
      legalName: string;
      taxId: string;
      email: string;
      phone: string;
      street: string;
      number: string;
      complement?: string;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
    }
  ): Promise<void> {
    const existingProfile = await BillingService.getProfile(organizationId);

    if (existingProfile) {
      return;
    }

    if (!billing) {
      throw new BillingProfileRequiredError(organizationId);
    }

    await BillingService.createProfile(organizationId, {
      legalName: billing.legalName,
      taxId: billing.taxId,
      email: billing.email,
      phone: billing.phone,
      address: {
        street: billing.street,
        number: billing.number,
        complement: billing.complement,
        neighborhood: billing.neighborhood,
        city: billing.city,
        state: billing.state,
        zipCode: billing.zipCode,
      },
    });
  }
}
