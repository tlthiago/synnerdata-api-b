import { AppError } from "@/lib/errors/base-error";

export class AcquisitionPeriodError extends AppError {
  status = 400;
  code: string;
  constructor(
    message: string,
    code = "ACQUISITION_PERIOD_ERROR",
    details?: unknown
  ) {
    super(message, details);
    this.code = code;
  }
}

export class AcquisitionPeriodNotFoundError extends AcquisitionPeriodError {
  status = 404;
  constructor(periodId: string) {
    super(
      `Acquisition period not found: ${periodId}`,
      "ACQUISITION_PERIOD_NOT_FOUND",
      { periodId }
    );
  }
}

export class AcquisitionPeriodAlreadyDeletedError extends AcquisitionPeriodError {
  status = 404;
  constructor(periodId: string) {
    super(
      `Acquisition period already deleted: ${periodId}`,
      "ACQUISITION_PERIOD_ALREADY_DELETED",
      { periodId }
    );
  }
}

export class AcquisitionPeriodInvalidEmployeeError extends AcquisitionPeriodError {
  status = 404;
  constructor(employeeId: string) {
    super(
      `Employee not found: ${employeeId}`,
      "ACQUISITION_PERIOD_INVALID_EMPLOYEE",
      { employeeId }
    );
  }
}

export class AcquisitionPeriodNotAvailableError extends AcquisitionPeriodError {
  status = 422;
  constructor(periodId: string, currentStatus: string) {
    super(
      `Acquisition period is not available: ${periodId} (status: ${currentStatus})`,
      "ACQUISITION_PERIOD_NOT_AVAILABLE",
      { periodId, currentStatus }
    );
  }
}

export class AcquisitionPeriodInsufficientDaysError extends AcquisitionPeriodError {
  status = 422;
  constructor(periodId: string, requested: number, remaining: number) {
    super(
      `Insufficient days in acquisition period ${periodId}: requested ${requested}, remaining ${remaining}`,
      "ACQUISITION_PERIOD_INSUFFICIENT_DAYS",
      { periodId, requested, remaining }
    );
  }
}

export class AcquisitionPeriodDuplicateError extends AcquisitionPeriodError {
  status = 409;
  constructor(employeeId: string, acquisitionStart: string) {
    super(
      `Duplicate acquisition period for employee ${employeeId} starting at ${acquisitionStart}`,
      "ACQUISITION_PERIOD_DUPLICATE",
      { employeeId, acquisitionStart }
    );
  }
}

export class HireDateUpdateBlockedError extends AcquisitionPeriodError {
  status = 409;
  constructor(employeeId: string) {
    super(
      "Nao e possivel alterar a data de admissao: existem ferias vinculadas a periodos aquisitivos deste funcionario. Cancele ou delete as ferias antes de alterar a data de admissao.",
      "HIRE_DATE_UPDATE_BLOCKED",
      { employeeId }
    );
  }
}
