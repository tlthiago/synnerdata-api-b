import { AppError } from "@/lib/errors/base-error";

export class EmployeeTerminatedError extends AppError {
  status = 422;
  code = "EMPLOYEE_TERMINATED";

  constructor(employeeId: string) {
    super(`Cannot create occurrence for terminated employee: ${employeeId}`);
    this.details = { employeeId };
  }
}

export class EmployeeOnVacationError extends AppError {
  status = 422;
  code = "EMPLOYEE_ON_VACATION";

  constructor(employeeId: string) {
    super(`Cannot create occurrence for employee on vacation: ${employeeId}`);
    this.details = { employeeId };
  }
}
