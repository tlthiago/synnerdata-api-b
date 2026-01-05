import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  sendCancellationScheduledEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
  sendTrialExpiredEmail,
  sendTrialExpiringEmail,
  sendUpgradeConfirmationEmail,
} from "@/lib/email";
import { logger } from "@/lib/logger";
import { PaymentHooks } from "./index";

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function getOrganizationOwnerEmail(
  organizationId: string
): Promise<string | null> {
  const [owner] = await db
    .select({ email: schema.users.email })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
    .where(
      and(
        eq(schema.members.organizationId, organizationId),
        eq(schema.members.role, "owner")
      )
    )
    .limit(1);

  return owner?.email ?? null;
}

async function getOrganizationName(
  organizationId: string
): Promise<string | null> {
  const [org] = await db
    .select({ name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  return org?.name ?? null;
}

async function getPlanDisplayName(planId: string): Promise<string | null> {
  const [plan] = await db
    .select({ displayName: schema.subscriptionPlans.displayName })
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .limit(1);

  return plan?.displayName ?? null;
}

async function getSubscriptionWithPlanAndTier(organizationId: string) {
  const [result] = await db
    .select({
      displayName: schema.subscriptionPlans.displayName,
      priceMonthly: schema.planPricingTiers.priceMonthly,
      currentPeriodEnd: schema.orgSubscriptions.currentPeriodEnd,
    })
    .from(schema.orgSubscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
    )
    .leftJoin(
      schema.planPricingTiers,
      eq(schema.orgSubscriptions.pricingTierId, schema.planPricingTiers.id)
    )
    .where(eq(schema.orgSubscriptions.organizationId, organizationId))
    .limit(1);

  return result;
}

// ============================================================
// LISTENER REGISTRATION
// ============================================================

let listenersRegistered = false;

export function registerPaymentListeners() {
  // Prevent double registration (can happen when multiple test files run)
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  // trial.expiring → sendTrialExpiringEmail
  PaymentHooks.on("trial.expiring", async (payload) => {
    try {
      const { subscription, daysRemaining } = payload;
      const ownerEmail = await getOrganizationOwnerEmail(
        subscription.organizationId
      );
      if (!(ownerEmail && subscription.trialEnd)) {
        return;
      }

      const orgName = await getOrganizationName(subscription.organizationId);

      // Get owner's name for the email
      const [owner] = await db
        .select({ name: schema.users.name })
        .from(schema.members)
        .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
        .where(
          and(
            eq(schema.members.organizationId, subscription.organizationId),
            eq(schema.members.role, "owner")
          )
        )
        .limit(1);

      await sendTrialExpiringEmail({
        to: ownerEmail,
        userName: owner?.name ?? "Usuário",
        organizationName: orgName ?? "Sua organização",
        daysRemaining,
        trialEndDate: subscription.trialEnd,
      });
    } catch (error) {
      logger.error({
        type: "payment:listener:error",
        event: "trial.expiring",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // trial.expired → sendTrialExpiredEmail
  PaymentHooks.on("trial.expired", async (payload) => {
    try {
      const { subscription } = payload;
      const ownerEmail = await getOrganizationOwnerEmail(
        subscription.organizationId
      );
      if (!ownerEmail) {
        return;
      }

      const orgName = await getOrganizationName(subscription.organizationId);

      const [owner] = await db
        .select({ name: schema.users.name })
        .from(schema.members)
        .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
        .where(
          and(
            eq(schema.members.organizationId, subscription.organizationId),
            eq(schema.members.role, "owner")
          )
        )
        .limit(1);

      await sendTrialExpiredEmail({
        to: ownerEmail,
        userName: owner?.name ?? "Usuário",
        organizationName: orgName ?? "Sua organização",
      });
    } catch (error) {
      logger.error({
        type: "payment:listener:error",
        event: "trial.expired",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // subscription.activated → sendUpgradeConfirmationEmail
  PaymentHooks.on("subscription.activated", async (payload) => {
    try {
      const { subscription } = payload;
      const ownerEmail = await getOrganizationOwnerEmail(
        subscription.organizationId
      );
      if (!ownerEmail) {
        return;
      }

      const orgName = await getOrganizationName(subscription.organizationId);
      const subData = await getSubscriptionWithPlanAndTier(
        subscription.organizationId
      );
      if (!subData) {
        return;
      }

      await sendUpgradeConfirmationEmail({
        to: ownerEmail,
        organizationName: orgName ?? "Sua organização",
        planName: subData.displayName,
        planPrice: subData.priceMonthly ?? 0,
        nextBillingDate: subData.currentPeriodEnd,
      });
    } catch (error) {
      logger.error({
        type: "payment:listener:error",
        event: "subscription.activated",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // subscription.cancelScheduled → sendCancellationScheduledEmail
  PaymentHooks.on("subscription.cancelScheduled", async (payload) => {
    try {
      const { subscription } = payload;
      const ownerEmail = await getOrganizationOwnerEmail(
        subscription.organizationId
      );
      if (!(ownerEmail && subscription.currentPeriodEnd)) {
        return;
      }

      const orgName = await getOrganizationName(subscription.organizationId);
      const planName = await getPlanDisplayName(subscription.planId);
      if (!planName) {
        return;
      }

      await sendCancellationScheduledEmail({
        to: ownerEmail,
        organizationName: orgName ?? "Sua organização",
        planName,
        accessUntil: subscription.currentPeriodEnd,
      });
    } catch (error) {
      logger.error({
        type: "payment:listener:error",
        event: "subscription.cancelScheduled",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // subscription.canceled → sendSubscriptionCanceledEmail
  PaymentHooks.on("subscription.canceled", async (payload) => {
    try {
      const { subscription } = payload;
      const ownerEmail = await getOrganizationOwnerEmail(
        subscription.organizationId
      );
      if (!ownerEmail) {
        return;
      }

      const orgName = await getOrganizationName(subscription.organizationId);
      const planName = await getPlanDisplayName(subscription.planId);
      if (!planName) {
        return;
      }

      await sendSubscriptionCanceledEmail({
        to: ownerEmail,
        organizationName: orgName ?? "Sua organização",
        planName,
        canceledAt: subscription.canceledAt ?? new Date(),
        accessUntil: subscription.currentPeriodEnd,
      });
    } catch (error) {
      logger.error({
        type: "payment:listener:error",
        event: "subscription.canceled",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // charge.failed → sendPaymentFailedEmail
  PaymentHooks.on("charge.failed", async (payload) => {
    try {
      const { subscriptionId, error: errorMessage } = payload;

      // Get subscription with organization info
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription?.gracePeriodEnds) {
        return;
      }

      const ownerEmail = await getOrganizationOwnerEmail(
        subscription.organizationId
      );
      if (!ownerEmail) {
        return;
      }

      const orgName = await getOrganizationName(subscription.organizationId);
      const planName = await getPlanDisplayName(subscription.planId);
      if (!planName) {
        return;
      }

      await sendPaymentFailedEmail({
        to: ownerEmail,
        organizationName: orgName ?? "Sua organização",
        planName,
        gracePeriodEnds: subscription.gracePeriodEnds,
        errorMessage,
      });
    } catch (error) {
      logger.error({
        type: "payment:listener:error",
        event: "charge.failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  logger.info({ type: "payment:listeners:registered" });
}
