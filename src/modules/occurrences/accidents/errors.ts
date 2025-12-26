import { AppError } from "@/lib/errors/base-error";

export class AccidentError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "ACCIDENT_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class AccidentNotFoundError extends AccidentError {
  status = 404;

  constructor(accidentId: string) {
    super(`Accident not found: ${accidentId}`, "ACCIDENT_NOT_FOUND", {
      accidentId,
    });
  }
}

export class AccidentAlreadyDeletedError extends AccidentError {
  status = 404;

  constructor(accidentId: string) {
    super(
      `Accident already deleted: ${accidentId}`,
      "ACCIDENT_ALREADY_DELETED",
      { accidentId }
    );
  }
}

export class AccidentInvalidEmployeeError extends AccidentError {
  status = 404;

  constructor(employeeId: string) {
    super(
      `Employee not found or not in organization: ${employeeId}`,
      "ACCIDENT_INVALID_EMPLOYEE",
      { employeeId }
    );
  }
}
