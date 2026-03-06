import { AppError } from "@/lib/errors/base-error";

export class AbsenceError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "ABSENCE_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class AbsenceNotFoundError extends AbsenceError {
  status = 404;

  constructor(absenceId: string) {
    super(`Absence not found: ${absenceId}`, "ABSENCE_NOT_FOUND", {
      absenceId,
    });
  }
}

export class AbsenceAlreadyDeletedError extends AbsenceError {
  status = 404;

  constructor(absenceId: string) {
    super(`Absence already deleted: ${absenceId}`, "ABSENCE_ALREADY_DELETED", {
      absenceId,
    });
  }
}

export class AbsenceInvalidDateRangeError extends AbsenceError {
  status = 422;

  constructor() {
    super(
      "Data final deve ser maior ou igual à data inicial",
      "ABSENCE_INVALID_DATE_RANGE"
    );
  }
}

export class AbsenceInvalidEmployeeError extends AbsenceError {
  status = 422;

  constructor(employeeId: string) {
    super(`Funcionário inválido: ${employeeId}`, "ABSENCE_INVALID_EMPLOYEE", {
      employeeId,
    });
  }
}

export class AbsenceOverlapError extends AbsenceError {
  status = 409;

  constructor(employeeId: string, startDate: string, endDate: string) {
    super(
      "Employee already has an absence overlapping this period",
      "ABSENCE_OVERLAP",
      { employeeId, startDate, endDate }
    );
  }
}
