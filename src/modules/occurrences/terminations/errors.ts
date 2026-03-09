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
    super(
      `Desligamento não encontrado: ${terminationId}`,
      "TERMINATION_NOT_FOUND",
      {
        terminationId,
      }
    );
  }
}

export class TerminationAlreadyDeletedError extends TerminationError {
  status = 404;

  constructor(terminationId: string) {
    super(
      `Desligamento já deletado: ${terminationId}`,
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
    super(`Funcionário não encontrado: ${employeeId}`, "EMPLOYEE_NOT_FOUND", {
      employeeId,
    });
  }
}

export class EmployeeNotInOrganizationError extends TerminationError {
  status = 403;

  constructor(employeeId: string, organizationId: string) {
    super(
      `Funcionário ${employeeId} não pertence à organização ${organizationId}`,
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

export class TerminationAlreadyExistsError extends TerminationError {
  status = 409;

  constructor(employeeId: string) {
    super(
      "Funcionário já possui um registro de desligamento ativo",
      "TERMINATION_ALREADY_EXISTS",
      { employeeId }
    );
  }
}
