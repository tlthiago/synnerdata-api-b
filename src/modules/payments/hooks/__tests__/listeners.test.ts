import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { PaymentHooks } from "@/modules/payments/hooks";
import { registerPaymentListeners } from "@/modules/payments/hooks/listeners";
import { type CreatePlanResult, createPaidPlan } from "@/test/factories/plan";
import {
  createActiveSubscription,
  createTestSubscription,
} from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";

// Mock email module
const mockSendTrialExpiringEmail = mock(() => Promise.resolve());
const mockSendTrialExpiredEmail = mock(() => Promise.resolve());
const mockSendUpgradeConfirmationEmail = mock(() => Promise.resolve());
const mockSendCancellationScheduledEmail = mock(() => Promise.resolve());
const mockSendSubscriptionCanceledEmail = mock(() => Promise.resolve());
const mockSendPaymentFailedEmail = mock(() => Promise.resolve());

mock.module("@/lib/email", () => ({
  sendTrialExpiringEmail: mockSendTrialExpiringEmail,
  sendTrialExpiredEmail: mockSendTrialExpiredEmail,
  sendUpgradeConfirmationEmail: mockSendUpgradeConfirmationEmail,
  sendCancellationScheduledEmail: mockSendCancellationScheduledEmail,
  sendSubscriptionCanceledEmail: mockSendSubscriptionCanceledEmail,
  sendPaymentFailedEmail: mockSendPaymentFailedEmail,
}));

let diamondPlanResult: CreatePlanResult;

describe("Payment Listeners", () => {
  beforeAll(async () => {
    // Register listeners for tests (normally done at app startup)
    registerPaymentListeners();
    diamondPlanResult = await createPaidPlan("diamond");
  });

  afterEach(() => {
    mockSendTrialExpiringEmail.mockClear();
    mockSendTrialExpiredEmail.mockClear();
    mockSendUpgradeConfirmationEmail.mockClear();
    mockSendCancellationScheduledEmail.mockClear();
    mockSendSubscriptionCanceledEmail.mockClear();
    mockSendPaymentFailedEmail.mockClear();
  });

  describe("trial.expiring listener", () => {
    test("should call sendTrialExpiringEmail when trial is expiring", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createTestSubscription(
        organizationId,
        diamondPlanResult.plan.id,
        "trial"
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      await PaymentHooks.emit("trial.expiring", {
        subscription,
        daysRemaining: 3,
      });

      // Wait for async listener
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendTrialExpiringEmail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendTrialExpiringEmail.mock.calls[0][0];
      expect(callArgs.daysRemaining).toBe(3);
    });

    test("should not send email if owner not found", async () => {
      // Create subscription without user/organization setup
      const subscription = {
        id: "sub_test",
        organizationId: "non-existent-org",
        planId: diamondPlanResult.plan.id,
        status: "trial" as const,
        trialEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        trialStart: new Date(),
        trialUsed: true,
        seats: 1,
        pricingTierId: diamondPlanResult.tiers[0].id,
        billingCycle: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        pagarmeSubscriptionId: null,
        pagarmeCustomerId: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        pastDueSince: null,
        gracePeriodEnds: null,
        pendingPlanId: null,
        pendingBillingCycle: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await PaymentHooks.emit("trial.expiring", {
        subscription,
        daysRemaining: 3,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendTrialExpiringEmail).not.toHaveBeenCalled();
    });
  });

  describe("trial.expired listener", () => {
    test("should call sendTrialExpiredEmail when trial expires", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createTestSubscription(
        organizationId,
        diamondPlanResult.plan.id,
        "trial"
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      await PaymentHooks.emit("trial.expired", { subscription });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendTrialExpiredEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("subscription.activated listener", () => {
    test("should call sendUpgradeConfirmationEmail when subscription is activated", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      await PaymentHooks.emit("subscription.activated", { subscription });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendUpgradeConfirmationEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("subscription.cancelScheduled listener", () => {
    test("should call sendCancellationScheduledEmail when cancellation is scheduled", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      await PaymentHooks.emit("subscription.cancelScheduled", { subscription });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendCancellationScheduledEmail).toHaveBeenCalledTimes(1);
    });

    test("should not send email if currentPeriodEnd is null", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createTestSubscription(
        organizationId,
        diamondPlanResult.plan.id,
        "trial"
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      // Trial subscriptions don't have currentPeriodEnd
      await PaymentHooks.emit("subscription.cancelScheduled", { subscription });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendCancellationScheduledEmail).not.toHaveBeenCalled();
    });
  });

  describe("subscription.canceled listener", () => {
    test("should call sendSubscriptionCanceledEmail when subscription is canceled", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      const canceledSubscription = {
        ...subscription,
        status: "canceled" as const,
        canceledAt: new Date(),
      };

      await PaymentHooks.emit("subscription.canceled", {
        subscription: canceledSubscription,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendSubscriptionCanceledEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("charge.failed listener", () => {
    test("should call sendPaymentFailedEmail when charge fails", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

      // Set grace period
      const gracePeriodEnds = new Date();
      gracePeriodEnds.setDate(gracePeriodEnds.getDate() + 15);

      await db
        .update(schema.orgSubscriptions)
        .set({
          status: "past_due",
          pastDueSince: new Date(),
          gracePeriodEnds,
        })
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      await PaymentHooks.emit("charge.failed", {
        subscriptionId: subscription.id,
        invoiceId: "inv_123",
        error: "Card declined",
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendPaymentFailedEmail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendPaymentFailedEmail.mock.calls[0][0];
      expect(callArgs.errorMessage).toBe("Card declined");
    });

    test("should not send email if gracePeriodEnds is not set", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });
      await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      await PaymentHooks.emit("charge.failed", {
        subscriptionId: subscription.id,
        invoiceId: "inv_123",
        error: "Card declined",
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
    });
  });
});
