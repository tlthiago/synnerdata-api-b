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
    super(`Promotion not found: ${promotionId}`, "PROMOTION_NOT_FOUND", {
      promotionId,
    });
  }
}

export class PromotionAlreadyDeletedError extends PromotionError {
  status = 404;

  constructor(promotionId: string) {
    super(
      `Promotion already deleted: ${promotionId}`,
      "PROMOTION_ALREADY_DELETED",
      { promotionId }
    );
  }
}

export class InvalidPromotionDataError extends PromotionError {
  constructor(message: string, details?: unknown) {
    super(message, "INVALID_PROMOTION_DATA", details);
  }
}
