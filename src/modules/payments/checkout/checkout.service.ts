import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import { BillingProfileIncompleteError } from "@/modules/organizations/profile/errors";
import { OrganizationService } from "@/modules/organizations/profile/organization.service";
import { CustomerService } from "@/modules/payments/customer/customer.service";
import { EmailNotVerifiedError } from "@/modules/payments/errors";
import { PagarmeClient } from "@/modules/payments/pagarme/client";
import type { CreatePaymentLinkRequest } from "@/modules/payments/pagarme/pagarme.types";
import { PagarmePlanService } from "@/modules/payments/pagarme/pagarme-plan.service";
import { PlansService } from "@/modules/payments/plans/plans.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import type { CheckoutData, CreateCheckoutInput } from "./checkout.model";

const CHECKOUT_EXPIRATION_HOURS = 24;

export abstract class CheckoutService {
  static async create(input: CreateCheckoutInput): Promise<CheckoutData> {
    const {
      organizationId,
      planId,
      tierId,
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

    const billingStatus =
      await OrganizationService.checkBillingRequirements(organizationId);
    if (!billingStatus.complete) {
      throw new BillingProfileIncompleteError(billingStatus.missingFields);
    }

    // Get plan and tier details
    const plan = await PlansService.getAvailableById(planId);
    const tier = await PlansService.getTierById(tierId);

    // Ensure Pagarme plan exists (lazy creation)
    const pagarmePlanId = await PagarmePlanService.ensurePlan(
      tierId,
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
            plan_id: pagarmePlanId,
          },
        ],
      },
      success_url: successUrl,
      max_paid_sessions: 1,
      metadata: {
        organization_id: organizationId,
        plan_id: planId,
        pricing_tier_id: tier.id,
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
      billingCycle,
      paymentLinkId: paymentLink.id,
      status: "pending",
      expiresAt,
    });

    // Send checkout link email
    const [emailData] = await db
      .select({
        userName: schema.users.name,
        userEmail: schema.users.email,
        organizationName: schema.organizations.name,
      })
      .from(schema.users)
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, organizationId)
      )
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (emailData) {
      const { sendCheckoutLinkEmail } = await import("@/lib/email");
      await sendCheckoutLinkEmail({
        to: emailData.userEmail,
        userName: emailData.userName,
        organizationName: emailData.organizationName,
        planName: plan.displayName,
        checkoutUrl: paymentLink.url,
        expiresAt,
      }).catch(() => {
        // Email failure should not fail checkout
      });
    }

    return {
      checkoutUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
    };
  }
}
