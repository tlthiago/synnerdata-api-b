import { AppError } from "@/lib/errors/base-error";

export class CboOccupationError extends AppError {
  status = 400;
  code: string;

  constructor(
    message: string,
    code = "CBO_OCCUPATION_ERROR",
    details?: unknown
  ) {
    super(message, details);
    this.code = code;
  }
}

export class CboOccupationNotFoundError extends CboOccupationError {
  status = 404;

  constructor(cboOccupationId: string) {
    super(
      `CBO occupation not found: ${cboOccupationId}`,
      "CBO_OCCUPATION_NOT_FOUND",
      { cboOccupationId }
    );
  }
}
