import { AppError } from "@/lib/errors/base-error";

export class EmployeeError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "EMPLOYEE_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class EmployeeNotFoundError extends EmployeeError {
  status = 404;

  constructor(employeeId: string) {
    super(`Employee not found: ${employeeId}`, "EMPLOYEE_NOT_FOUND", {
      employeeId,
    });
  }
}

export class EmployeeAlreadyDeletedError extends EmployeeError {
  status = 404;

  constructor(employeeId: string) {
    super(
      `Employee already deleted: ${employeeId}`,
      "EMPLOYEE_ALREADY_DELETED",
      { employeeId }
    );
  }
}

export class EmployeeCpfAlreadyExistsError extends EmployeeError {
  status = 409;

  constructor(cpf: string) {
    super(`CPF já cadastrado: ${cpf}`, "EMPLOYEE_CPF_ALREADY_EXISTS", { cpf });
  }
}

export class EmployeeInvalidBranchError extends EmployeeError {
  status = 422;

  constructor(branchId: string) {
    super(`Filial inválida: ${branchId}`, "EMPLOYEE_INVALID_BRANCH", {
      branchId,
    });
  }
}

export class EmployeeInvalidSectorError extends EmployeeError {
  status = 422;

  constructor(sectorId: string) {
    super(`Setor inválido: ${sectorId}`, "EMPLOYEE_INVALID_SECTOR", {
      sectorId,
    });
  }
}

export class EmployeeInvalidCostCenterError extends EmployeeError {
  status = 422;

  constructor(costCenterId: string) {
    super(
      `Centro de custo inválido: ${costCenterId}`,
      "EMPLOYEE_INVALID_COST_CENTER",
      { costCenterId }
    );
  }
}

export class EmployeeInvalidJobPositionError extends EmployeeError {
  status = 422;

  constructor(jobPositionId: string) {
    super(`Cargo inválido: ${jobPositionId}`, "EMPLOYEE_INVALID_JOB_POSITION", {
      jobPositionId,
    });
  }
}

export class EmployeeInvalidJobClassificationError extends EmployeeError {
  status = 422;

  constructor(jobClassificationId: string) {
    super(
      `CBO inválido: ${jobClassificationId}`,
      "EMPLOYEE_INVALID_JOB_CLASSIFICATION",
      { jobClassificationId }
    );
  }
}
