import { AppError } from "@/lib/errors/base-error";

export class OrganizationError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "ORGANIZATION_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class ProfileNotFoundError extends OrganizationError {
  status = 404;

  constructor(organizationId: string) {
    super(`Profile not found: ${organizationId}`, "PROFILE_NOT_FOUND", {
      organizationId,
    });
  }
}

export class BillingProfileIncompleteError extends OrganizationError {
  constructor(missingFields: string[]) {
    super(
      `Dados de cobrança incompletos: ${missingFields.join(", ")}`,
      "BILLING_PROFILE_INCOMPLETE",
      { missingFields }
    );
  }
}

export class ProfileAlreadyExistsError extends OrganizationError {
  constructor(organizationId: string) {
    super(
      `Profile already exists: ${organizationId}`,
      "PROFILE_ALREADY_EXISTS",
      { organizationId }
    );
  }
}

export class TaxIdAlreadyExistsError extends OrganizationError {
  status = 409;

  constructor(taxId: string) {
    super(`CNPJ/CPF já cadastrado: ${taxId}`, "TAX_ID_ALREADY_EXISTS", {
      taxId,
    });
  }
}
