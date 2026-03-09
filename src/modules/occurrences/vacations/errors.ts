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
    super(`Vacation not found: ${vacationId}`, "VACATION_NOT_FOUND", {
      vacationId,
    });
  }
}

export class VacationAlreadyDeletedError extends VacationError {
  status = 404;

  constructor(vacationId: string) {
    super(
      `Vacation already deleted: ${vacationId}`,
      "VACATION_ALREADY_DELETED",
      { vacationId }
    );
  }
}

export class VacationInvalidEmployeeError extends VacationError {
  status = 404;

  constructor(employeeId: string) {
    super(
      `Employee not found or not in organization: ${employeeId}`,
      "VACATION_INVALID_EMPLOYEE",
      { employeeId }
    );
  }
}

export class VacationInvalidDateRangeError extends VacationError {
  status = 422;

  constructor(startDate: string, endDate: string) {
    super(
      "Start date must be before or equal to end date",
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

export class VacationOverlapError extends VacationError {
  status = 409;

  constructor(employeeId: string, startDate: string, endDate: string) {
    super(
      "Employee already has a vacation overlapping this period",
      "VACATION_OVERLAP",
      { employeeId, startDate, endDate }
    );
  }
}
