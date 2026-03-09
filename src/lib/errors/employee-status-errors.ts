import { AppError } from "@/lib/errors/base-error";

export class EmployeeTerminatedError extends AppError {
  status = 422;
  code = "EMPLOYEE_TERMINATED";

  constructor(employeeId: string) {
    super(
      `Não é possível criar ocorrência para funcionário desligado: ${employeeId}`
    );
    this.details = { employeeId };
  }
}

export class EmployeeOnVacationError extends AppError {
  status = 422;
  code = "EMPLOYEE_ON_VACATION";

  constructor(employeeId: string) {
    super(
      `Não é possível criar ocorrência para funcionário em férias: ${employeeId}`
    );
    this.details = { employeeId };
  }
}
