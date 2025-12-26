import { AppError } from "@/lib/errors/base-error";

export class PpeItemError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "PPE_ITEM_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class PpeItemNotFoundError extends PpeItemError {
  status = 404;

  constructor(ppeItemId: string) {
    super(`PPE item not found: ${ppeItemId}`, "PPE_ITEM_NOT_FOUND", {
      ppeItemId,
    });
  }
}

export class PpeItemAlreadyDeletedError extends PpeItemError {
  status = 404;

  constructor(ppeItemId: string) {
    super(
      `PPE item already deleted: ${ppeItemId}`,
      "PPE_ITEM_ALREADY_DELETED",
      { ppeItemId }
    );
  }
}

export class PpeJobPositionNotFoundError extends PpeItemError {
  status = 404;

  constructor(ppeItemId: string, jobPositionId: string) {
    super("Job position association not found", "PPE_JOB_POSITION_NOT_FOUND", {
      ppeItemId,
      jobPositionId,
    });
  }
}

export class PpeJobPositionAlreadyExistsError extends PpeItemError {
  status = 409;

  constructor(ppeItemId: string, jobPositionId: string) {
    super(
      "Job position already associated with this PPE item",
      "PPE_JOB_POSITION_ALREADY_EXISTS",
      { ppeItemId, jobPositionId }
    );
  }
}
