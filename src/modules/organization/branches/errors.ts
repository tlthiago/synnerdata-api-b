import { AppError } from "@/lib/errors/base-error";

export class BranchError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "BRANCH_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class BranchNotFoundError extends BranchError {
  status = 404;

  constructor(branchId: string) {
    super(`Branch not found: ${branchId}`, "BRANCH_NOT_FOUND", { branchId });
  }
}

export class BranchTaxIdAlreadyExistsError extends BranchError {
  status = 409;

  constructor(taxId: string) {
    super(`CNPJ já cadastrado: ${taxId}`, "BRANCH_TAX_ID_ALREADY_EXISTS", {
      taxId,
    });
  }
}

export class BranchAlreadyDeletedError extends BranchError {
  status = 404;

  constructor(branchId: string) {
    super(`Branch already deleted: ${branchId}`, "BRANCH_ALREADY_DELETED", {
      branchId,
    });
  }
}
