import { AppError } from "@/lib/errors/base-error";

export class ProjectNotFoundError extends AppError {
  status = 404;
  code = "PROJECT_NOT_FOUND";

  constructor(id: string) {
    super(`Projeto não encontrado: ${id}`);
  }
}

export class ProjectAlreadyDeletedError extends AppError {
  status = 404;
  code = "PROJECT_ALREADY_DELETED";

  constructor(id: string) {
    super(`Projeto já foi excluído: ${id}`);
  }
}

export class ProjectEmployeeNotFoundError extends AppError {
  status = 404;
  code = "EMPLOYEE_NOT_FOUND";

  constructor(employeeId: string) {
    super(`Funcionário não encontrado: ${employeeId}`);
  }
}

export class ProjectEmployeeAlreadyExistsError extends AppError {
  status = 409;
  code = "PROJECT_EMPLOYEE_ALREADY_EXISTS";

  constructor(projectId: string, employeeId: string) {
    super(
      `Funcionário ${employeeId} já está vinculado ao projeto ${projectId}`
    );
  }
}

export class ProjectEmployeeNotAssignedError extends AppError {
  status = 404;
  code = "PROJECT_EMPLOYEE_NOT_ASSIGNED";

  constructor(projectId: string, employeeId: string) {
    super(
      `Funcionário ${employeeId} não está vinculado ao projeto ${projectId}`
    );
  }
}
