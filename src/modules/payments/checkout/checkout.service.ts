import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pendingCheckouts, users } from "@/db/schema";
import { CustomerService } from "../customer/customer.service";
import { EmailNotVerifiedError } from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type { CreatePaymentLinkRequest } from "../pagarme/pagarme.types";
import { PlanService } from "../plan/plan.service";
import { SubscriptionService } from "../subscription/subscription.service";
import type { CheckoutResponse, CreateCheckoutInput } from "./checkout.model";

const CHECKOUT_EXPIRATION_HOURS = 24;

export abstract class CheckoutService {
  static async create(input: CreateCheckoutInput): Promise<CheckoutResponse> {
    const { organizationId, planId, successUrl, userId } = input;

    const [user] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.emailVerified) {
      throw new EmailNotVerifiedError();
    }

    await SubscriptionService.ensureNoPaidSubscription(organizationId);

    const plan = await PlanService.ensureSynced(planId);

    const pagarmeCustomerId =
      await CustomerService.getCustomerId(organizationId);

    const paymentLinkData: CreatePaymentLinkRequest = {
      type: "subscription",
      name: `Upgrade para ${plan.displayName}`,
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
            plan_id: plan.pagarmePlanId,
          },
        ],
      },
      success_url: successUrl,
      max_paid_sessions: 1,
      metadata: {
        organization_id: organizationId,
        plan_id: planId,
      },
    };

    if (pagarmeCustomerId) {
      paymentLinkData.customer_settings = {
        customer_id: pagarmeCustomerId,
      };
    }

    const paymentLink = await PagarmeClient.createPaymentLink(
      paymentLinkData,
      `checkout-${organizationId}-${planId}-${Date.now()}`
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHECKOUT_EXPIRATION_HOURS);

    await db.insert(pendingCheckouts).values({
      id: `checkout-${crypto.randomUUID()}`,
      organizationId,
      planId,
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
