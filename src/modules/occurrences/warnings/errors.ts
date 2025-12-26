import { AppError } from "@/lib/errors/base-error";

export class WarningError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "WARNING_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class WarningNotFoundError extends WarningError {
  status = 404;

  constructor(warningId: string) {
    super(`Warning not found: ${warningId}`, "WARNING_NOT_FOUND", {
      warningId,
    });
  }
}

export class WarningAlreadyDeletedError extends WarningError {
  status = 404;

  constructor(warningId: string) {
    super(`Warning already deleted: ${warningId}`, "WARNING_ALREADY_DELETED", {
      warningId,
    });
  }
}

export class WarningInvalidEmployeeError extends WarningError {
  status = 422;

  constructor(employeeId: string) {
    super(`Funcionário inválido: ${employeeId}`, "WARNING_INVALID_EMPLOYEE", {
      employeeId,
    });
  }
}
