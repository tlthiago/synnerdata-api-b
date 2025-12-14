import { AppError } from "../../lib/errors/base-error";

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
