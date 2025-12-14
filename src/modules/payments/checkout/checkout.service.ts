import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { CustomerService } from "../customer/customer.service";
import {
  EmailNotVerifiedError,
  YearlyBillingNotAvailableError,
} from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type { CreatePaymentLinkRequest } from "../pagarme/pagarme.types";
import { PlanService } from "../plan/plan.service";
import { SubscriptionService } from "../subscription/subscription.service";
import type {
  CreateCheckoutInput,
  CreateCheckoutResponse,
} from "./checkout.model";

const CHECKOUT_EXPIRATION_HOURS = 24;

export abstract class CheckoutService {
  static async create(
    input: CreateCheckoutInput
  ): Promise<CreateCheckoutResponse> {
    const {
      organizationId,
      planId,
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

    const plan = await PlanService.ensureSynced(planId);

    const pagarmePlanId =
      billingCycle === "yearly"
        ? plan.pagarmePlanIdYearly
        : plan.pagarmePlanIdMonthly;

    if (!pagarmePlanId) {
      throw new YearlyBillingNotAvailableError(planId);
    }

    const pagarmeCustomerId =
      await CustomerService.getCustomerId(organizationId);

    const paymentLinkData: CreatePaymentLinkRequest = {
      type: "subscription",
      name: `Upgrade para ${plan.displayName}${billingCycle === "yearly" ? " (Anual)" : ""}`,
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
        billing_cycle: billingCycle,
      },
    };

    if (pagarmeCustomerId) {
      paymentLinkData.customer_settings = {
        customer_id: pagarmeCustomerId,
      };
    }

    const paymentLink = await PagarmeClient.createPaymentLink(
      paymentLinkData,
      `checkout-${organizationId}-${planId}-${billingCycle}-${Date.now()}`
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHECKOUT_EXPIRATION_HOURS);

    await db.insert(schema.pendingCheckouts).values({
      id: `checkout-${crypto.randomUUID()}`,
      organizationId,
      planId,
      billingCycle,
      paymentLinkId: paymentLink.id,
      status: "pending",
      expiresAt,
    });

    return {
      success: true as const,
      data: {
        checkoutUrl: paymentLink.url,
        paymentLinkId: paymentLink.id,
      },
    };
  }
}
