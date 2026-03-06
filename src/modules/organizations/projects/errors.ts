import { AppError } from "@/lib/errors/base-error";

export class ProjectError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "PROJECT_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class ProjectNotFoundError extends ProjectError {
  status = 404;

  constructor(projectId: string) {
    super(`Project not found: ${projectId}`, "PROJECT_NOT_FOUND", {
      projectId,
    });
  }
}

export class ProjectAlreadyDeletedError extends ProjectError {
  status = 404;

  constructor(projectId: string) {
    super(`Project already deleted: ${projectId}`, "PROJECT_ALREADY_DELETED", {
      projectId,
    });
  }
}

export class ProjectNameAlreadyExistsError extends ProjectError {
  status = 409;

  constructor(name: string) {
    super(
      `A project with the name "${name}" already exists`,
      "PROJECT_NAME_ALREADY_EXISTS",
      { name }
    );
  }
}

export class ProjectCnoAlreadyExistsError extends ProjectError {
  status = 409;

  constructor(cno: string) {
    super(
      `A project with the CNO "${cno}" already exists`,
      "PROJECT_CNO_ALREADY_EXISTS",
      { cno }
    );
  }
}

export class ProjectEmployeeNotFoundError extends ProjectError {
  status = 404;

  constructor(employeeId: string) {
    super(`Employee not found: ${employeeId}`, "EMPLOYEE_NOT_FOUND", {
      employeeId,
    });
  }
}

export class ProjectEmployeeAlreadyExistsError extends ProjectError {
  status = 409;

  constructor(projectId: string, employeeId: string) {
    super(
      `Employee ${employeeId} is already assigned to project ${projectId}`,
      "PROJECT_EMPLOYEE_ALREADY_EXISTS",
      { projectId, employeeId }
    );
  }
}

export class ProjectEmployeeNotAssignedError extends ProjectError {
  status = 404;

  constructor(projectId: string, employeeId: string) {
    super(
      `Employee ${employeeId} is not assigned to project ${projectId}`,
      "PROJECT_EMPLOYEE_NOT_ASSIGNED",
      { projectId, employeeId }
    );
  }
}
