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
      `Job classification not found: ${jobClassificationId}`,
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
      `A job classification with the name "${name}" already exists`,
      "JOB_CLASSIFICATION_ALREADY_EXISTS",
      { name }
    );
  }
}

export class JobClassificationAlreadyDeletedError extends JobClassificationError {
  status = 404;

  constructor(jobClassificationId: string) {
    super(
      `Job classification already deleted: ${jobClassificationId}`,
      "JOB_CLASSIFICATION_ALREADY_DELETED",
      {
        jobClassificationId,
      }
    );
  }
}
