import { AppError } from "@/lib/errors/base-error";

export class PaymentError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "PAYMENT_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class CheckoutError extends PaymentError {
  status = 400;

  constructor(message: string, code = "CHECKOUT_ERROR") {
    super(message, code);
  }
}

export class MissingBillingDataError extends PaymentError {
  status = 400;

  constructor(missingFields: string[]) {
    super(
      `Missing required billing data: ${missingFields.join(", ")}`,
      "MISSING_BILLING_DATA",
      { missingFields }
    );
  }
}

export class EmailNotVerifiedError extends PaymentError {
  status = 400;

  constructor() {
    super("Email must be verified before checkout", "EMAIL_NOT_VERIFIED");
  }
}

export class SubscriptionNotFoundError extends PaymentError {
  status = 404;

  constructor(identifier: string) {
    super(`Subscription not found: ${identifier}`, "SUBSCRIPTION_NOT_FOUND", {
      identifier,
    });
  }
}

export class SubscriptionAlreadyActiveError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Organization already has an active subscription",
      "SUBSCRIPTION_ALREADY_ACTIVE"
    );
  }
}

export class SubscriptionNotCancelableError extends PaymentError {
  status = 400;

  constructor(subscriptionStatus: string) {
    super(
      `Cannot cancel subscription with status: ${subscriptionStatus}`,
      "SUBSCRIPTION_NOT_CANCELABLE",
      { subscriptionStatus }
    );
  }
}

export class SubscriptionNotRestorableError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Subscription can only be restored while pending cancellation",
      "SUBSCRIPTION_NOT_RESTORABLE"
    );
  }
}

export class TrialAlreadyUsedError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "This organization has already used its trial period",
      "TRIAL_ALREADY_USED"
    );
  }
}

export class TrialExpiredError extends PaymentError {
  status = 403;

  constructor() {
    super(
      "Trial period has expired. Please upgrade to continue.",
      "TRIAL_EXPIRED"
    );
  }
}

export class PlanNotFoundError extends PaymentError {
  status = 404;

  constructor(planId: string) {
    super(`Plan not found: ${planId}`, "PLAN_NOT_FOUND", { planId });
  }
}

export class PlanNotAvailableError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(`Plan is not available: ${planId}`, "PLAN_NOT_AVAILABLE", { planId });
  }
}

export class TrialPlanAsBaseError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(
      `Trial plans cannot be used as base for custom checkout: ${planId}`,
      "TRIAL_PLAN_AS_BASE",
      { planId }
    );
  }
}

export class YearlyBillingNotAvailableError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(
      `Yearly billing not available for plan: ${planId}`,
      "YEARLY_BILLING_NOT_AVAILABLE",
      { planId }
    );
  }
}

export class PlanNameAlreadyExistsError extends PaymentError {
  status = 400;

  constructor(name: string) {
    super(
      `Plan with name "${name}" already exists`,
      "PLAN_NAME_ALREADY_EXISTS",
      {
        name,
      }
    );
  }
}

export class PlanHasActiveSubscriptionsError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(
      `Cannot delete plan ${planId}: it has active subscriptions`,
      "PLAN_HAS_ACTIVE_SUBSCRIPTIONS",
      { planId }
    );
  }
}

export class OrganizationNotFoundError extends PaymentError {
  status = 404;

  constructor(organizationId: string) {
    super(
      `Organization not found: ${organizationId}`,
      "ORGANIZATION_NOT_FOUND",
      {
        organizationId,
      }
    );
  }
}

export class NoActiveOrganizationError extends PaymentError {
  status = 400;

  constructor() {
    super("No active organization in session", "NO_ACTIVE_ORGANIZATION");
  }
}

export class WebhookValidationError extends PaymentError {
  status = 401;

  constructor() {
    super("Invalid webhook credentials", "INVALID_WEBHOOK_CREDENTIALS");
  }
}

export class WebhookProcessingError extends PaymentError {
  status = 500;

  constructor(eventType: string, reason: string) {
    super(
      `Failed to process webhook event ${eventType}: ${reason}`,
      "WEBHOOK_PROCESSING_ERROR",
      { eventType, reason }
    );
  }
}

export class CustomerNotFoundError extends PaymentError {
  status = 404;

  constructor(identifier: string) {
    super(`Customer not found: ${identifier}`, "CUSTOMER_NOT_FOUND", {
      identifier,
    });
  }
}

export class CustomerCreationError extends PaymentError {
  status = 500;

  constructor(reason: string) {
    super(`Failed to create customer: ${reason}`, "CUSTOMER_CREATION_ERROR", {
      reason,
    });
  }
}

export class InvoiceNotFoundError extends PaymentError {
  status = 404;

  constructor(invoiceId: string) {
    super(`Invoice not found: ${invoiceId}`, "INVOICE_NOT_FOUND", {
      invoiceId,
    });
  }
}

export class PagarmeApiError extends PaymentError {
  constructor(
    httpStatus: number,
    apiError: { message?: string; errors?: Record<string, string[]> }
  ) {
    const message = apiError.message ?? "Unknown Pagarme API error";
    super(message, "PAGARME_API_ERROR", {
      httpStatus,
      errors: apiError.errors,
    });
    this.status = httpStatus >= 500 ? 502 : 400;
  }
}

export class PagarmeTimeoutError extends PaymentError {
  status = 504;

  constructor(endpoint: string) {
    super(`Pagarme API timeout: ${endpoint}`, "PAGARME_TIMEOUT", { endpoint });
  }
}

export class SamePlanError extends PaymentError {
  status = 400;

  constructor() {
    super("Already subscribed to this plan", "SAME_PLAN");
  }
}

export class SameBillingCycleError extends PaymentError {
  status = 400;

  constructor() {
    super("Already on this billing cycle", "SAME_BILLING_CYCLE");
  }
}

export class SubscriptionNotActiveError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Subscription must be active to change plans",
      "SUBSCRIPTION_NOT_ACTIVE"
    );
  }
}

export class PlanChangeInProgressError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "A plan change is already scheduled. Cancel it first to make a new change.",
      "PLAN_CHANGE_IN_PROGRESS"
    );
  }
}

export class NoScheduledChangeError extends PaymentError {
  status = 400;

  constructor() {
    super("No scheduled plan change to cancel", "NO_SCHEDULED_CHANGE");
  }
}

export class EmployeeCountExceedsLimitError extends PaymentError {
  status = 400;

  constructor(employeeCount: number, maxAllowed = 180) {
    super(
      `Para ${employeeCount} funcionários, entre em contato para um plano Enterprise`,
      "EMPLOYEE_COUNT_EXCEEDS_LIMIT",
      { employeeCount, maxAllowed }
    );
  }
}

export class EmployeeCountRequiredError extends PaymentError {
  status = 400;

  constructor() {
    super("Employee count is required for checkout", "EMPLOYEE_COUNT_REQUIRED");
  }
}

export class PricingTierNotFoundError extends PaymentError {
  status = 404;

  constructor(planId: string, employeeRange: string) {
    super(
      `No pricing tier found for range "${employeeRange}" in plan ${planId}`,
      "PRICING_TIER_NOT_FOUND",
      { planId, employeeRange }
    );
  }
}

export class InvalidEmployeeRangeError extends PaymentError {
  status = 400;

  constructor(employeeRange: string) {
    super(
      `Invalid employee range format: "${employeeRange}". Expected format: "min-max" (e.g., "0-10")`,
      "INVALID_EMPLOYEE_RANGE",
      { employeeRange }
    );
  }
}

export class FeatureNotAvailableError extends PaymentError {
  status = 403;

  constructor(featureName: string) {
    super(
      `Feature "${featureName}" is not available in your current plan`,
      "FEATURE_NOT_AVAILABLE",
      { featureName }
    );
  }
}

export class EmployeeLimitReachedError extends PaymentError {
  status = 400;

  constructor(current: number, limit: number) {
    super(
      `Limite de funcionários atingido (${current}/${limit}). Faça upgrade para cadastrar mais.`,
      "EMPLOYEE_LIMIT_REACHED",
      { current, limit }
    );
  }
}

// 2.3 - No change requested (same configuration)
export class NoChangeRequestedError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "A configuração selecionada é igual à sua assinatura atual.",
      "NO_CHANGE_REQUESTED"
    );
  }
}

// 2.4 - Employee count exceeds new plan limit on downgrade
export class EmployeeCountExceedsNewPlanLimitError extends PaymentError {
  status = 400;

  constructor(currentCount: number, newLimit: number) {
    const toRemove = currentCount - newLimit;
    super(
      `Você tem ${currentCount} funcionários cadastrados. O plano selecionado permite máximo ${newLimit}. Remova ${toRemove} funcionário(s) para continuar.`,
      "EMPLOYEE_COUNT_EXCEEDS_NEW_PLAN_LIMIT",
      { currentCount, newLimit, toRemove }
    );
  }
}

// Plans Module - Tier Errors

export class TrialPlanNotFoundError extends PaymentError {
  status = 500;

  constructor() {
    super(
      "Trial plan not found. Please run database seed.",
      "TRIAL_PLAN_NOT_FOUND"
    );
  }
}

export class TrialPlanMisconfiguredError extends PaymentError {
  status = 500;

  constructor() {
    super(
      "Trial plan has no pricing tiers. Please verify the database seed.",
      "TRIAL_PLAN_MISCONFIGURED"
    );
  }
}

export class TrialNotCancellableError extends PaymentError {
  status = 400;

  constructor(organizationId: string) {
    super(
      "Trial subscriptions cannot be canceled. The trial expires naturally.",
      "TRIAL_NOT_CANCELLABLE",
      { organizationId }
    );
  }
}

export class BillingNotAvailableForTrialError extends PaymentError {
  status = 400;

  constructor(organizationId: string) {
    super(
      "Billing operations are not available for trial subscriptions",
      "BILLING_NOT_AVAILABLE_FOR_TRIAL",
      { organizationId }
    );
  }
}

export class InvalidTierCountError extends PaymentError {
  status = 422;

  constructor(provided: number, minimum: number) {
    super(
      `At least ${minimum} pricing tier(s) required, but received ${provided}.`,
      "INVALID_TIER_COUNT",
      { provided, minimum }
    );
  }
}

export class InvalidTierRangeError extends PaymentError {
  status = 422;

  constructor(
    index: number,
    provided: { min: number; max: number },
    expected: { min: number; max: number }
  ) {
    super(
      `Tier at index ${index} has invalid range. Expected ${expected.min}-${expected.max}, got ${provided.min}-${provided.max}.`,
      "INVALID_TIER_RANGE",
      { index, provided, expected }
    );
  }
}

export class TierNegativeMinError extends PaymentError {
  status = 422;

  constructor(index: number, minEmployees: number) {
    super(
      `Tier at index ${index} has negative minEmployees (${minEmployees}). Must be >= 0.`,
      "TIER_NEGATIVE_MIN",
      { index, minEmployees }
    );
  }
}

export class TierMinExceedsMaxError extends PaymentError {
  status = 422;

  constructor(index: number, min: number, max: number) {
    super(
      `Tier at index ${index} has minEmployees (${min}) > maxEmployees (${max}).`,
      "TIER_MIN_EXCEEDS_MAX",
      { index, min, max }
    );
  }
}

export class TierOverlapError extends PaymentError {
  status = 422;

  constructor(index: number, previousMax: number, currentMin: number) {
    super(
      `Tier at index ${index} overlaps with previous tier: previous max is ${previousMax}, current min is ${currentMin}.`,
      "TIER_OVERLAP",
      { index, previousMax, currentMin }
    );
  }
}

export class TierGapError extends PaymentError {
  status = 422;

  constructor(index: number, expectedMin: number, actualMin: number) {
    super(
      `Gap between tiers at index ${index - 1} and ${index}: expected min ${expectedMin}, got ${actualMin}.`,
      "TIER_GAP",
      { index, expectedMin, actualMin }
    );
  }
}

export class TierNotFoundError extends PaymentError {
  status = 404;

  constructor(tierId: string, planId: string) {
    super(`Tier "${tierId}" not found in plan "${planId}".`, "TIER_NOT_FOUND", {
      tierId,
      planId,
    });
  }
}

export class TiersInUseError extends PaymentError {
  status = 409;

  constructor(
    activeSubscriptions: number,
    pendingCheckouts: number,
    pendingChanges: number
  ) {
    super(
      `Cannot delete tiers: ${activeSubscriptions} active subscription(s), ${pendingCheckouts} pending checkout(s), ${pendingChanges} pending plan change(s) reference current tiers.`,
      "TIERS_IN_USE",
      { activeSubscriptions, pendingCheckouts, pendingChanges }
    );
  }
}

// Billing Profile Errors

export class BillingProfileNotFoundError extends PaymentError {
  status = 404;

  constructor(organizationId: string) {
    super(
      `Perfil de cobrança não encontrado para a organização: ${organizationId}`,
      "BILLING_PROFILE_NOT_FOUND",
      { organizationId }
    );
  }
}

export class BillingProfileAlreadyExistsError extends PaymentError {
  status = 409;

  constructor(organizationId: string) {
    super(
      `Perfil de cobrança já existe para a organização: ${organizationId}`,
      "BILLING_PROFILE_ALREADY_EXISTS",
      { organizationId }
    );
  }
}

export class BillingProfileRequiredError extends PaymentError {
  status = 400;

  constructor(organizationId: string) {
    super(
      `Billing profile is required for checkout. Organization ${organizationId} has no billing profile and no billing data was provided.`,
      "BILLING_PROFILE_REQUIRED",
      { organizationId }
    );
  }
}
