import { SubscriptionAccessService } from "./subscription-access.service";
import { SubscriptionMutationService } from "./subscription-mutation.service";
import { SubscriptionQueryService } from "./subscription-query.service";

/**
 * Facade that combines all subscription operations.
 * Maintains backward compatibility with existing consumers.
 *
 * This class delegates to specialized services:
 * - SubscriptionQueryService: Read operations (find, get, hasPaid)
 * - SubscriptionAccessService: Access verification (checkAccess)
 * - SubscriptionMutationService: Write operations (cancel, restore, activate, etc.)
 *
 * @example
 * // All these calls work the same as before:
 * await SubscriptionService.findByOrganizationId(orgId);
 * await SubscriptionService.checkAccess(orgId);
 * await SubscriptionService.cancel({ organizationId });
 */
export abstract class SubscriptionService {
  // ============================================================
  // Query methods (delegated to SubscriptionQueryService)
  // ============================================================

  /**
   * Find subscription by organization ID.
   * Returns null if no subscription exists.
   */
  static findByOrganizationId = SubscriptionQueryService.findByOrganizationId;

  /**
   * Get subscription with plan details.
   * Throws SubscriptionNotFoundError if not found.
   */
  static getByOrganizationId = SubscriptionQueryService.getByOrganizationId;

  /**
   * Check if organization has an active paid subscription.
   */
  static hasPaidSubscription = SubscriptionQueryService.hasPaidSubscription;

  // ============================================================
  // Access check (delegated to SubscriptionAccessService)
  // ============================================================

  /**
   * Verifies the access status of an organization.
   * Returns computed state: trial, trial_expired, active, past_due, expired, canceled
   */
  static checkAccess = SubscriptionAccessService.checkAccess;

  // ============================================================
  // Mutation methods (delegated to SubscriptionMutationService)
  // ============================================================

  /**
   * Cancel a subscription (soft cancel - schedules cancellation at period end).
   */
  static cancel = SubscriptionMutationService.cancel;

  /**
   * Restore a subscription that was scheduled for cancellation.
   */
  static restore = SubscriptionMutationService.restore;

  /**
   * Creates a trial subscription for an organization.
   */
  static createTrial = SubscriptionMutationService.createTrial;

  /**
   * Activates a subscription (typically after successful payment via webhook).
   */
  static activate = SubscriptionMutationService.activate;

  /**
   * Marks a subscription as active after successful payment.
   */
  static markActive = SubscriptionMutationService.markActive;

  /**
   * Marks a subscription as past_due when payment fails.
   */
  static markPastDue = SubscriptionMutationService.markPastDue;

  /**
   * Expires a trial subscription.
   */
  static expireTrial = SubscriptionMutationService.expireTrial;

  /**
   * Suspends a subscription (changes from past_due to canceled).
   */
  static suspend = SubscriptionMutationService.suspend;

  /**
   * Cancels a subscription that was scheduled for cancellation.
   */
  static cancelScheduled = SubscriptionMutationService.cancelScheduled;

  /**
   * Cancels a subscription due to refund.
   */
  static cancelByRefund = SubscriptionMutationService.cancelByRefund;

  /**
   * Cancels a subscription via webhook (definitive cancellation from Pagarme).
   */
  static cancelByWebhook = SubscriptionMutationService.cancelByWebhook;

  /**
   * Cancels a subscription by Pagarme subscription ID.
   */
  static cancelByPagarmeId = SubscriptionMutationService.cancelByPagarmeId;

  /**
   * Ensures organization does not have an active paid subscription.
   */
  static ensureNoPaidSubscription =
    SubscriptionMutationService.ensureNoPaidSubscription;
}
