import { PaymentError } from "@/modules/payments/errors";

export class ProvisionNotFoundError extends PaymentError {
  status = 404;

  constructor(provisionId: string) {
    super(
      `Provisionamento não encontrado: ${provisionId}`,
      "PROVISION_NOT_FOUND",
      {
        provisionId,
      }
    );
  }
}

export class UserAlreadyExistsError extends PaymentError {
  status = 409;

  constructor(email: string) {
    super(
      `Já existe um usuário com o e-mail: ${email}`,
      "USER_ALREADY_EXISTS",
      {
        email,
      }
    );
  }
}

export class ProvisionAlreadyActiveError extends PaymentError {
  status = 400;

  constructor(provisionId: string) {
    super(
      `Provisionamento já está ativo: ${provisionId}`,
      "PROVISION_ALREADY_ACTIVE",
      { provisionId }
    );
  }
}

export class ProvisionAlreadyDeletedError extends PaymentError {
  status = 400;

  constructor(provisionId: string) {
    super(
      `Provisionamento já foi deletado: ${provisionId}`,
      "PROVISION_ALREADY_DELETED",
      { provisionId }
    );
  }
}

export class ProvisionNotCheckoutTypeError extends PaymentError {
  status = 400;

  constructor(provisionId: string) {
    super(
      `Provisionamento não é do tipo checkout: ${provisionId}`,
      "PROVISION_NOT_CHECKOUT_TYPE",
      { provisionId }
    );
  }
}

export class ProvisionPendingPaymentError extends PaymentError {
  status = 400;

  constructor(provisionId: string) {
    super(
      `Provisionamento ainda está pendente de pagamento — não é possível reenviar ativação: ${provisionId}`,
      "PROVISION_PENDING_PAYMENT",
      { provisionId }
    );
  }
}

export class SlugAlreadyExistsError extends PaymentError {
  status = 409;

  constructor(slug: string) {
    super(
      `Já existe uma organização com o slug: ${slug}`,
      "SLUG_ALREADY_EXISTS",
      { slug }
    );
  }
}
