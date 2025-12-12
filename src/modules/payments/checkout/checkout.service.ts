import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  organizationProfiles,
  orgSubscriptions,
  pendingCheckouts,
  users,
} from "@/db/schema";
import {
  EmailNotVerifiedError,
  SubscriptionAlreadyActiveError,
} from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type { CreatePaymentLinkRequest } from "../pagarme/pagarme.types";
import { PlanService } from "../plan/plan.service";
import type { CheckoutResponse, CreateCheckoutInput } from "./checkout.model";

const CHECKOUT_EXPIRATION_HOURS = 24;

export abstract class CheckoutService {
  /**
   * Create a checkout session for upgrading from trial to paid.
   * Uses Payment Links with type="subscription".
   */
  static async create(input: CreateCheckoutInput): Promise<CheckoutResponse> {
    const { organizationId, planId, successUrl, userId } = input;

    // 1. Verify user email is verified
    const [user] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.emailVerified) {
      throw new EmailNotVerifiedError();
    }

    // 2. Check if organization already has an active subscription
    const [existingSubscription] = await db
      .select({ status: orgSubscriptions.status })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (existingSubscription?.status === "active") {
      throw new SubscriptionAlreadyActiveError();
    }

    // 3. Ensure plan is synced to Pagarme (creates if not exists)
    const plan = await PlanService.ensureSynced(planId);

    // 4. Check if we have a customer_id to pre-fill checkout
    const [profile] = await db
      .select({ pagarmeCustomerId: organizationProfiles.pagarmeCustomerId })
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, organizationId))
      .limit(1);

    // 5. Build payment link request
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

    // 6. Add customer_id if exists (pre-fills checkout form)
    if (profile?.pagarmeCustomerId) {
      paymentLinkData.customer_settings = {
        customer_id: profile.pagarmeCustomerId,
      };
    }

    // 7. Create payment link
    const paymentLink = await PagarmeClient.createPaymentLink(
      paymentLinkData,
      `checkout-${organizationId}-${planId}-${Date.now()}`
    );

    // 8. Store pending checkout for webhook lookup
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
