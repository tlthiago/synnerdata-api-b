// ============================================================
// BASE PAYMENT ERROR
// ============================================================

export class PaymentError extends Error {
  status = 400;
  code: string;

  constructor(message: string, code = "PAYMENT_ERROR") {
    super(message);
    this.code = code;
    this.name = "PaymentError";
  }

  toResponse() {
    return {
      error: this.message,
      code: this.code,
    };
  }
}

// ============================================================
// CHECKOUT ERRORS
// ============================================================

export class CheckoutError extends PaymentError {
  status = 400;

  constructor(message: string, code = "CHECKOUT_ERROR") {
    super(message, code);
    this.name = "CheckoutError";
  }
}

export class MissingBillingDataError extends PaymentError {
  status = 400;

  constructor(missingFields: string[]) {
    super(
      `Missing required billing data: ${missingFields.join(", ")}`,
      "MISSING_BILLING_DATA"
    );
    this.name = "MissingBillingDataError";
  }
}

export class EmailNotVerifiedError extends PaymentError {
  status = 400;

  constructor() {
    super("Email must be verified before checkout", "EMAIL_NOT_VERIFIED");
    this.name = "EmailNotVerifiedError";
  }
}

// ============================================================
// SUBSCRIPTION ERRORS
// ============================================================

export class SubscriptionNotFoundError extends PaymentError {
  status = 404;

  constructor(identifier: string) {
    super(`Subscription not found: ${identifier}`, "SUBSCRIPTION_NOT_FOUND");
    this.name = "SubscriptionNotFoundError";
  }
}

export class SubscriptionAlreadyActiveError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Organization already has an active subscription",
      "SUBSCRIPTION_ALREADY_ACTIVE"
    );
    this.name = "SubscriptionAlreadyActiveError";
  }
}

export class SubscriptionNotCancelableError extends PaymentError {
  status = 400;

  constructor(status: string) {
    super(
      `Cannot cancel subscription with status: ${status}`,
      "SUBSCRIPTION_NOT_CANCELABLE"
    );
    this.name = "SubscriptionNotCancelableError";
  }
}

export class SubscriptionNotRestorableError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Subscription can only be restored while pending cancellation",
      "SUBSCRIPTION_NOT_RESTORABLE"
    );
    this.name = "SubscriptionNotRestorableError";
  }
}

// ============================================================
// TRIAL ERRORS
// ============================================================

export class TrialAlreadyUsedError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "This organization has already used its trial period",
      "TRIAL_ALREADY_USED"
    );
    this.name = "TrialAlreadyUsedError";
  }
}

export class TrialExpiredError extends PaymentError {
  status = 403;

  constructor() {
    super(
      "Trial period has expired. Please upgrade to continue.",
      "TRIAL_EXPIRED"
    );
    this.name = "TrialExpiredError";
  }
}

// ============================================================
// PLAN ERRORS
// ============================================================

export class PlanNotFoundError extends PaymentError {
  status = 404;

  constructor(planId: string) {
    super(`Plan not found: ${planId}`, "PLAN_NOT_FOUND");
    this.name = "PlanNotFoundError";
  }
}

export class PlanNotAvailableError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(`Plan is not available: ${planId}`, "PLAN_NOT_AVAILABLE");
    this.name = "PlanNotAvailableError";
  }
}

export class PlanNameAlreadyExistsError extends PaymentError {
  status = 400;

  constructor(name: string) {
    super(
      `Plan with name "${name}" already exists`,
      "PLAN_NAME_ALREADY_EXISTS"
    );
    this.name = "PlanNameAlreadyExistsError";
  }
}

export class PlanHasActiveSubscriptionsError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(
      `Cannot delete plan ${planId}: it has active subscriptions`,
      "PLAN_HAS_ACTIVE_SUBSCRIPTIONS"
    );
    this.name = "PlanHasActiveSubscriptionsError";
  }
}

export class OrganizationNotFoundError extends PaymentError {
  status = 404;

  constructor(organizationId: string) {
    super(
      `Organization not found: ${organizationId}`,
      "ORGANIZATION_NOT_FOUND"
    );
    this.name = "OrganizationNotFoundError";
  }
}

// ============================================================
// WEBHOOK ERRORS
// ============================================================

export class WebhookValidationError extends PaymentError {
  status = 401;

  constructor() {
    super("Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE");
    this.name = "WebhookValidationError";
  }
}

export class WebhookProcessingError extends PaymentError {
  status = 500;

  constructor(eventType: string, reason: string) {
    super(
      `Failed to process webhook event ${eventType}: ${reason}`,
      "WEBHOOK_PROCESSING_ERROR"
    );
    this.name = "WebhookProcessingError";
  }
}

// ============================================================
// CUSTOMER ERRORS
// ============================================================

export class CustomerNotFoundError extends PaymentError {
  status = 404;

  constructor(identifier: string) {
    super(`Customer not found: ${identifier}`, "CUSTOMER_NOT_FOUND");
    this.name = "CustomerNotFoundError";
  }
}

export class CustomerCreationError extends PaymentError {
  status = 500;

  constructor(reason: string) {
    super(`Failed to create customer: ${reason}`, "CUSTOMER_CREATION_ERROR");
    this.name = "CustomerCreationError";
  }
}

// ============================================================
// INVOICE ERRORS
// ============================================================

export class InvoiceNotFoundError extends PaymentError {
  status = 404;

  constructor(invoiceId: string) {
    super(`Invoice not found: ${invoiceId}`, "INVOICE_NOT_FOUND");
    this.name = "InvoiceNotFoundError";
  }
}
