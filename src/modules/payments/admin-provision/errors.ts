import { PaymentError } from "@/modules/payments/errors";

export class ProvisionNotFoundError extends PaymentError {
  status = 404;

  constructor(provisionId: string) {
    super(`Provision not found: ${provisionId}`, "PROVISION_NOT_FOUND", {
      provisionId,
    });
  }
}

export class UserAlreadyExistsError extends PaymentError {
  status = 409;

  constructor(email: string) {
    super(`User already exists with email: ${email}`, "USER_ALREADY_EXISTS", {
      email,
    });
  }
}

export class ProvisionAlreadyActiveError extends PaymentError {
  status = 400;

  constructor(provisionId: string) {
    super(
      `Provision is already active: ${provisionId}`,
      "PROVISION_ALREADY_ACTIVE",
      { provisionId }
    );
  }
}

export class ProvisionAlreadyDeletedError extends PaymentError {
  status = 400;

  constructor(provisionId: string) {
    super(
      `Provision is already deleted: ${provisionId}`,
      "PROVISION_ALREADY_DELETED",
      { provisionId }
    );
  }
}

export class ProvisionNotCheckoutTypeError extends PaymentError {
  status = 400;

  constructor(provisionId: string) {
    super(
      `Provision is not a checkout type: ${provisionId}`,
      "PROVISION_NOT_CHECKOUT_TYPE",
      { provisionId }
    );
  }
}

export class ProvisionPendingPaymentError extends PaymentError {
  status = 400;

  constructor(provisionId: string) {
    super(
      `Provision is still pending payment — cannot resend activation: ${provisionId}`,
      "PROVISION_PENDING_PAYMENT",
      { provisionId }
    );
  }
}

export class SlugAlreadyExistsError extends PaymentError {
  status = 409;

  constructor(slug: string) {
    super(
      `Organization with slug already exists: ${slug}`,
      "SLUG_ALREADY_EXISTS",
      { slug }
    );
  }
}
