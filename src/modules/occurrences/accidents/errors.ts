import { AppError } from "@/lib/errors/base-error";

export class AccidentError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "ACCIDENT_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class AccidentNotFoundError extends AccidentError {
  status = 404;

  constructor(accidentId: string) {
    super(`Acidente não encontrado: ${accidentId}`, "ACCIDENT_NOT_FOUND", {
      accidentId,
    });
  }
}

export class AccidentAlreadyDeletedError extends AccidentError {
  status = 404;

  constructor(accidentId: string) {
    super(`Acidente já deletado: ${accidentId}`, "ACCIDENT_ALREADY_DELETED", {
      accidentId,
    });
  }
}

export class AccidentInvalidEmployeeError extends AccidentError {
  status = 404;

  constructor(employeeId: string) {
    super(
      `Funcionário não encontrado ou não pertence à organização: ${employeeId}`,
      "ACCIDENT_INVALID_EMPLOYEE",
      { employeeId }
    );
  }
}

export class AccidentCatAlreadyExistsError extends AccidentError {
  status = 409;

  constructor(cat: string) {
    super(
      `Já existe um acidente com o número de CAT "${cat}"`,
      "ACCIDENT_CAT_ALREADY_EXISTS",
      { cat }
    );
  }
}
