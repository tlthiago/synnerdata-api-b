import { AppError } from "@/lib/errors/base-error";

export class LaborLawsuitError extends AppError {
  status = 400;
  code: string;

  constructor(
    message: string,
    code = "LABOR_LAWSUIT_ERROR",
    details?: unknown
  ) {
    super(message, details);
    this.code = code;
  }
}

export class LaborLawsuitNotFoundError extends LaborLawsuitError {
  status = 404;

  constructor(laborLawsuitId: string) {
    super(
      `Processo trabalhista não encontrado: ${laborLawsuitId}`,
      "LABOR_LAWSUIT_NOT_FOUND",
      { laborLawsuitId }
    );
  }
}

export class LaborLawsuitAlreadyDeletedError extends LaborLawsuitError {
  status = 404;

  constructor(laborLawsuitId: string) {
    super(
      `Processo trabalhista já deletado: ${laborLawsuitId}`,
      "LABOR_LAWSUIT_ALREADY_DELETED",
      { laborLawsuitId }
    );
  }
}

export class LaborLawsuitEmployeeNotFoundError extends LaborLawsuitError {
  status = 404;

  constructor(employeeId: string) {
    super(`Funcionário não encontrado: ${employeeId}`, "EMPLOYEE_NOT_FOUND", {
      employeeId,
    });
  }
}

export class LaborLawsuitInvalidDateOrderError extends LaborLawsuitError {
  status = 422;

  constructor(message: string, details?: unknown) {
    super(message, "LABOR_LAWSUIT_INVALID_DATE_ORDER", details);
  }
}

export class LaborLawsuitProcessNumberAlreadyExistsError extends LaborLawsuitError {
  status = 409;

  constructor(processNumber: string) {
    super(
      `Número do processo já existe: ${processNumber}`,
      "LABOR_LAWSUIT_PROCESS_NUMBER_ALREADY_EXISTS",
      { processNumber }
    );
  }
}
