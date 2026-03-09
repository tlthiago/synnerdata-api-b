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
    super(
      `Centro de custo não encontrado: ${costCenterId}`,
      "COST_CENTER_NOT_FOUND",
      {
        costCenterId,
      }
    );
  }
}

export class CostCenterAlreadyExistsError extends CostCenterError {
  status = 409;

  constructor(name: string) {
    super(
      `Centro de custo com o nome "${name}" já existe`,
      "COST_CENTER_ALREADY_EXISTS",
      { name }
    );
  }
}

export class CostCenterAlreadyDeletedError extends CostCenterError {
  status = 404;

  constructor(costCenterId: string) {
    super(
      `Centro de custo já deletado: ${costCenterId}`,
      "COST_CENTER_ALREADY_DELETED",
      {
        costCenterId,
      }
    );
  }
}
