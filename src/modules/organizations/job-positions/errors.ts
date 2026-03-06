import { AppError } from "@/lib/errors/base-error";

export class JobPositionError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "JOB_POSITION_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class JobPositionNotFoundError extends JobPositionError {
  status = 404;

  constructor(jobPositionId: string) {
    super(
      `Job position not found: ${jobPositionId}`,
      "JOB_POSITION_NOT_FOUND",
      { jobPositionId }
    );
  }
}

export class JobPositionAlreadyExistsError extends JobPositionError {
  status = 409;

  constructor(name: string) {
    super(
      `A job position with the name "${name}" already exists`,
      "JOB_POSITION_ALREADY_EXISTS",
      { name }
    );
  }
}

export class JobPositionAlreadyDeletedError extends JobPositionError {
  status = 404;

  constructor(jobPositionId: string) {
    super(
      `Job position already deleted: ${jobPositionId}`,
      "JOB_POSITION_ALREADY_DELETED",
      { jobPositionId }
    );
  }
}
