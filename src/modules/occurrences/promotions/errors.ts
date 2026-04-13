import { AppError } from "@/lib/errors/base-error";

export class PromotionError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "PROMOTION_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class PromotionNotFoundError extends PromotionError {
  status = 404;

  constructor(promotionId: string) {
    super(`Promoção não encontrada: ${promotionId}`, "PROMOTION_NOT_FOUND", {
      promotionId,
    });
  }
}

export class PromotionAlreadyDeletedError extends PromotionError {
  status = 404;

  constructor(promotionId: string) {
    super(`Promoção já deletada: ${promotionId}`, "PROMOTION_ALREADY_DELETED", {
      promotionId,
    });
  }
}

export class InvalidPromotionDataError extends PromotionError {
  constructor(message: string, details?: unknown) {
    super(message, "INVALID_PROMOTION_DATA", details);
  }
}

export class PromotionDuplicateDateError extends PromotionError {
  status = 409;

  constructor(employeeId: string, promotionDate: string) {
    super(
      `Funcionário já possui uma promoção na data ${promotionDate}`,
      "PROMOTION_DUPLICATE_DATE",
      { employeeId, promotionDate }
    );
  }
}

export class PromotionNotLatestError extends PromotionError {
  status = 422;

  constructor(promotionId: string) {
    super(
      "Apenas a promoção mais recente do funcionário pode ser alterada ou excluída",
      "PROMOTION_NOT_LATEST",
      { promotionId }
    );
  }
}
