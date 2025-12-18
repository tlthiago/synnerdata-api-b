import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import { CustomerService } from "../customer/customer.service";
import { EmailNotVerifiedError } from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type { CreatePaymentLinkRequest } from "../pagarme/pagarme.types";
import { PlanService } from "../plan/plan.service";
import { PricingTierService } from "../pricing/pricing.service";
import { SubscriptionService } from "../subscription/subscription.service";
import type { CheckoutData, CreateCheckoutInput } from "./checkout.model";

const CHECKOUT_EXPIRATION_HOURS = 24;

export abstract class CheckoutService {
  static async create(input: CreateCheckoutInput): Promise<CheckoutData> {
    const {
      organizationId,
      planId,
      employeeCount,
      successUrl,
      userId,
      billingCycle = "monthly",
    } = input;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.emailVerified) {
      throw new EmailNotVerifiedError();
    }

    await SubscriptionService.ensureNoPaidSubscription(organizationId);

    // Validate employee count and get pricing tier
    PricingTierService.validateEmployeeCount(employeeCount);

    // Get plan details
    const plan = await PlanService.getByIdForCheckout(planId);

    // Get pricing tier with Pagarme plan (lazy creation)
    const tier = await PricingTierService.getTierForCheckout(
      planId,
      employeeCount,
      billingCycle
    );

    const pagarmeCustomerId =
      await CustomerService.getCustomerId(organizationId);

    const tierLabel = `${tier.minEmployees}-${tier.maxEmployees} funcionários`;
    const paymentLinkData: CreatePaymentLinkRequest = {
      type: "subscription",
      name: `${plan.displayName} (${tierLabel})${billingCycle === "yearly" ? " - Anual" : ""}`,
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
            plan_id: tier.pagarmePlanId,
          },
        ],
      },
      success_url: successUrl,
      max_paid_sessions: 1,
      metadata: {
        organization_id: organizationId,
        plan_id: planId,
        pricing_tier_id: tier.id,
        employee_count: String(employeeCount),
        billing_cycle: billingCycle,
      },
    };

    if (pagarmeCustomerId) {
      paymentLinkData.customer_settings = {
        customer_id: pagarmeCustomerId,
      };
    }

    const paymentLink = await Retry.withRetry(
      () =>
        PagarmeClient.createPaymentLink(
          paymentLinkData,
          `checkout-${organizationId}-${planId}-${tier.id}-${billingCycle}-${Date.now()}`
        ),
      { maxAttempts: 3, delayMs: 1000 }
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHECKOUT_EXPIRATION_HOURS);

    await db.insert(schema.pendingCheckouts).values({
      id: `checkout-${crypto.randomUUID()}`,
      organizationId,
      planId,
      pricingTierId: tier.id,
      employeeCount,
      billingCycle,
      paymentLinkId: paymentLink.id,
      status: "pending",
      expiresAt,
    });

    return {
      checkoutUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
    };
  }
}
