import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { SubscriptionNotFoundError } from "@/modules/payments/errors";
import { LimitsService } from "@/modules/payments/limits/limits.service";
import { PlansService } from "@/modules/payments/plans/plans.service";
import type {
  TrialLimitsData,
  UpdateTrialLimitsInput,
} from "./admin-subscription.model";
import {
  SubscriptionNotActiveOrExpiredError,
  SubscriptionNotTrialError,
  TrialEndInPastError,
  TrialMaxEmployeesTooLowError,
} from "./errors";

type SubscriptionRow = {
  subscription: typeof schema.orgSubscriptions.$inferSelect;
  planName: string | null;
  isTrial: boolean;
  currentMaxEmployees: number | null;
};

async function fetchSubscriptionRow(
  organizationId: string
): Promise<SubscriptionRow> {
  const [row] = await db
    .select({
      subscription: schema.orgSubscriptions,
      planName: schema.subscriptionPlans.displayName,
      isTrial: schema.subscriptionPlans.isTrial,
      currentMaxEmployees: schema.planPricingTiers.maxEmployees,
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

  if (!row) {
    throw new SubscriptionNotFoundError(organizationId);
  }

  return row;
}

function validateSubscription(
  row: SubscriptionRow,
  organizationId: string
): void {
  if (!row.isTrial) {
    throw new SubscriptionNotTrialError(organizationId);
  }

  const { status } = row.subscription;
  if (status !== "active" && status !== "expired") {
    throw new SubscriptionNotActiveOrExpiredError(status, organizationId);
  }
}

async function validateMaxEmployees(
  organizationId: string,
  maxEmployees: number
): Promise<void> {
  const { current } = await LimitsService.checkEmployeeLimit(organizationId);
  if (maxEmployees < current) {
    throw new TrialMaxEmployeesTooLowError(maxEmployees, current);
  }
}

function computeNewTrialEnd(
  trialStart: Date | null,
  trialDays: number
): Date | undefined {
  if (!trialStart) {
    return;
  }

  const newTrialEnd = new Date(trialStart);
  newTrialEnd.setDate(newTrialEnd.getDate() + trialDays);

  if (newTrialEnd <= new Date()) {
    throw new TrialEndInPastError(trialStart, newTrialEnd);
  }

  return newTrialEnd;
}

async function createDedicatedTier(maxEmployees: number): Promise<string> {
  const trialPlan = await PlansService.getTrialPlan();
  const tierId = `tier-${crypto.randomUUID()}`;
  await db.insert(schema.planPricingTiers).values({
    id: tierId,
    planId: trialPlan.id,
    minEmployees: 0,
    maxEmployees,
    priceMonthly: 0,
    priceYearly: 0,
  });
  return tierId;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export abstract class AdminSubscriptionService {
  static async updateTrialLimits(
    input: UpdateTrialLimitsInput
  ): Promise<TrialLimitsData> {
    const { organizationId, maxEmployees, trialDays } = input;

    const row = await fetchSubscriptionRow(organizationId);
    validateSubscription(row, organizationId);

    const { subscription, planName, currentMaxEmployees } = row;

    if (maxEmployees !== undefined) {
      await validateMaxEmployees(organizationId, maxEmployees);
    }

    const newTrialEnd =
      trialDays !== undefined
        ? computeNewTrialEnd(subscription.trialStart, trialDays)
        : undefined;

    const newTierId =
      maxEmployees !== undefined
        ? await createDedicatedTier(maxEmployees)
        : undefined;

    const wasExpired = subscription.status === "expired";
    const reactivated = wasExpired && newTrialEnd !== undefined;

    const updatePayload: Record<string, unknown> = {};
    if (newTierId) {
      updatePayload.pricingTierId = newTierId;
    }
    if (newTrialEnd) {
      updatePayload.trialEnd = newTrialEnd;
    }
    if (reactivated) {
      updatePayload.status = "active";
    }

    await db
      .update(schema.orgSubscriptions)
      .set(updatePayload)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const finalMaxEmployees = maxEmployees ?? currentMaxEmployees ?? 0;
    const finalTrialEnd = newTrialEnd ?? subscription.trialEnd;
    const finalTrialDays =
      subscription.trialStart && finalTrialEnd
        ? Math.round(
            (finalTrialEnd.getTime() - subscription.trialStart.getTime()) /
              MS_PER_DAY
          )
        : 0;

    return {
      organizationId,
      status: reactivated ? "active" : subscription.status,
      planName: planName ?? "Trial",
      trialDays: finalTrialDays,
      trialEnd: finalTrialEnd?.toISOString() ?? "",
      maxEmployees: finalMaxEmployees,
      reactivated,
    };
  }
}
