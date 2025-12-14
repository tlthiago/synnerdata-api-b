import type { OrgSubscription } from "@/db/schema";

// ============================================================
// EVENT PAYLOAD TYPES
// ============================================================

export type PaymentEvents = {
  "trial.started": { subscription: OrgSubscription };
  "trial.expiring": { subscription: OrgSubscription; daysRemaining: number };
  "trial.expired": { subscription: OrgSubscription };
  "subscription.activated": { subscription: OrgSubscription };
  "subscription.cancelScheduled": { subscription: OrgSubscription };
  "subscription.restored": { subscription: OrgSubscription };
  "subscription.canceled": { subscription: OrgSubscription };
  "subscription.renewed": { subscription: OrgSubscription };
  "subscription.updated": {
    subscription: OrgSubscription;
    changes: {
      cardUpdated?: boolean;
      statusChanged?: boolean;
      previousStatus?: string;
    };
  };
  "charge.paid": { subscriptionId: string; invoiceId: string };
  "charge.failed": {
    subscriptionId: string;
    invoiceId: string;
    error: string;
  };
  "charge.refunded": {
    subscriptionId: string;
    chargeId: string;
    amount: number;
    reason?: string;
  };
};

// ============================================================
// HELPER TYPES
// ============================================================

export type PaymentEventName = keyof PaymentEvents;
export type PaymentEventPayload<T extends PaymentEventName> = PaymentEvents[T];
