import { AppError } from "@/lib/errors/base-error";

export class JobClassificationError extends AppError {
  status = 400;
  code: string;

  constructor(
    message: string,
    code = "JOB_CLASSIFICATION_ERROR",
    details?: unknown
  ) {
    super(message, details);
    this.code = code;
  }
}

export class JobClassificationNotFoundError extends JobClassificationError {
  status = 404;

  constructor(jobClassificationId: string) {
    super(
      `Classificação de cargo não encontrada: ${jobClassificationId}`,
      "JOB_CLASSIFICATION_NOT_FOUND",
      {
        jobClassificationId,
      }
    );
  }
}

export class JobClassificationAlreadyExistsError extends JobClassificationError {
  status = 409;

  constructor(name: string) {
    super(
      `Classificação de cargo com o nome "${name}" já existe`,
      "JOB_CLASSIFICATION_ALREADY_EXISTS",
      { name }
    );
  }
}

export class JobClassificationAlreadyDeletedError extends JobClassificationError {
  status = 404;

  constructor(jobClassificationId: string) {
    super(
      `Classificação de cargo já deletada: ${jobClassificationId}`,
      "JOB_CLASSIFICATION_ALREADY_DELETED",
      {
        jobClassificationId,
      }
    );
  }
}

export class InvalidCboOccupationError extends JobClassificationError {
  status = 422;

  constructor(cboOccupationId: string) {
    super(
      `Ocupação CBO não encontrada: ${cboOccupationId}`,
      "INVALID_CBO_OCCUPATION",
      { cboOccupationId }
    );
  }
}
