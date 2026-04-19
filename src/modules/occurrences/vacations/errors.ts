import { AppError } from "@/lib/errors/base-error";

export class VacationError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "VACATION_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class VacationNotFoundError extends VacationError {
  status = 404;

  constructor(vacationId: string) {
    super(`Férias não encontradas: ${vacationId}`, "VACATION_NOT_FOUND", {
      vacationId,
    });
  }
}

export class VacationAlreadyDeletedError extends VacationError {
  status = 404;

  constructor(vacationId: string) {
    super(`Férias já deletadas: ${vacationId}`, "VACATION_ALREADY_DELETED", {
      vacationId,
    });
  }
}

export class VacationInvalidEmployeeError extends VacationError {
  status = 404;

  constructor(employeeId: string) {
    super(
      `Funcionário não encontrado ou não pertence à organização: ${employeeId}`,
      "VACATION_INVALID_EMPLOYEE",
      { employeeId }
    );
  }
}

export class VacationInvalidDateRangeError extends VacationError {
  status = 422;

  constructor(startDate: string, endDate: string) {
    super(
      "Data inicial deve ser anterior ou igual à data final",
      "VACATION_INVALID_DATE_RANGE",
      { startDate, endDate }
    );
  }
}

export class VacationInvalidDaysError extends VacationError {
  status = 422;

  constructor(message: string) {
    super(message, "VACATION_INVALID_DAYS");
  }
}

export class VacationDateBeforeHireError extends VacationError {
  status = 422;

  constructor(field: string, date: string, hireDate: string) {
    super(
      `Data ${field} (${date}) não pode ser anterior à data de admissão (${hireDate})`,
      "VACATION_DATE_BEFORE_HIRE",
      { field, date, hireDate }
    );
  }
}

export class VacationOverlapError extends VacationError {
  status = 409;

  constructor(employeeId: string, startDate: string, endDate: string) {
    super(
      "Funcionário já possui férias sobrepondo este período",
      "VACATION_OVERLAP",
      { employeeId, startDate, endDate }
    );
  }
}
