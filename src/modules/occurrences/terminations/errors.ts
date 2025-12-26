import { AppError } from "@/lib/errors/base-error";

export class TerminationError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "TERMINATION_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class TerminationNotFoundError extends TerminationError {
  status = 404;

  constructor(terminationId: string) {
    super(`Termination not found: ${terminationId}`, "TERMINATION_NOT_FOUND", {
      terminationId,
    });
  }
}

export class TerminationAlreadyDeletedError extends TerminationError {
  status = 404;

  constructor(terminationId: string) {
    super(
      `Termination already deleted: ${terminationId}`,
      "TERMINATION_ALREADY_DELETED",
      {
        terminationId,
      }
    );
  }
}

export class EmployeeNotFoundError extends TerminationError {
  status = 404;

  constructor(employeeId: string) {
    super(`Employee not found: ${employeeId}`, "EMPLOYEE_NOT_FOUND", {
      employeeId,
    });
  }
}

export class EmployeeNotInOrganizationError extends TerminationError {
  status = 403;

  constructor(employeeId: string, organizationId: string) {
    super(
      `Employee ${employeeId} does not belong to organization ${organizationId}`,
      "EMPLOYEE_NOT_IN_ORGANIZATION",
      {
        employeeId,
        organizationId,
      }
    );
  }
}

export class TerminationInvalidEmployeeError extends TerminationError {
  status = 422;

  constructor(employeeId: string) {
    super(
      `Funcionário inválido: ${employeeId}`,
      "TERMINATION_INVALID_EMPLOYEE",
      {
        employeeId,
      }
    );
  }
}
