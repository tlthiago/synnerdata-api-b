import type { OrgSubscription } from "@/db/schema/payments";

// ============================================================
// EVENT PAYLOAD TYPES
// ============================================================

export type PaymentEvents = {
  "trial.started": { subscription: OrgSubscription };
  "trial.expiring": { subscription: OrgSubscription; daysRemaining: number };
  "trial.expired": { subscription: OrgSubscription };
  "subscription.activated": { subscription: OrgSubscription };
  "subscription.canceled": { subscription: OrgSubscription };
  "subscription.renewed": { subscription: OrgSubscription };
  "charge.paid": { subscriptionId: string; invoiceId: string };
  "charge.failed": {
    subscriptionId: string;
    invoiceId: string;
    error: string;
  };
};

// ============================================================
// HELPER TYPES
// ============================================================

export type PaymentEventName = keyof PaymentEvents;
export type PaymentEventPayload<T extends PaymentEventName> = PaymentEvents[T];
