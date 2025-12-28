import { AppError } from "@/lib/errors/base-error";

export class CostCenterError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "COST_CENTER_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class CostCenterNotFoundError extends CostCenterError {
  status = 404;

  constructor(costCenterId: string) {
    super(`Cost center not found: ${costCenterId}`, "COST_CENTER_NOT_FOUND", {
      costCenterId,
    });
  }
}

export class CostCenterAlreadyDeletedError extends CostCenterError {
  status = 404;

  constructor(costCenterId: string) {
    super(
      `Cost center already deleted: ${costCenterId}`,
      "COST_CENTER_ALREADY_DELETED",
      {
        costCenterId,
      }
    );
  }
}
