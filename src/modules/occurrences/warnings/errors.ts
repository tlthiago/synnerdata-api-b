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

export class WarningAcknowledgedBeforeDateError extends WarningError {
  status = 422;

  constructor() {
    super(
      "Data de ciência não pode ser anterior à data da advertência",
      "WARNING_ACKNOWLEDGED_BEFORE_DATE"
    );
  }
}

export class WarningDuplicateError extends WarningError {
  status = 409;

  constructor(employeeId: string, date: string, type: string) {
    super(
      `Employee already has a ${type} warning on ${date}`,
      "WARNING_DUPLICATE",
      { employeeId, date, type }
    );
  }
}
