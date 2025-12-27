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
      `Labor lawsuit not found: ${laborLawsuitId}`,
      "LABOR_LAWSUIT_NOT_FOUND",
      { laborLawsuitId }
    );
  }
}

export class LaborLawsuitAlreadyDeletedError extends LaborLawsuitError {
  status = 404;

  constructor(laborLawsuitId: string) {
    super(
      `Labor lawsuit already deleted: ${laborLawsuitId}`,
      "LABOR_LAWSUIT_ALREADY_DELETED",
      { laborLawsuitId }
    );
  }
}

export class LaborLawsuitEmployeeNotFoundError extends LaborLawsuitError {
  status = 404;

  constructor(employeeId: string) {
    super(`Employee not found: ${employeeId}`, "EMPLOYEE_NOT_FOUND", {
      employeeId,
    });
  }
}
