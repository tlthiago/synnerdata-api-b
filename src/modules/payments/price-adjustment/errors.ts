import { AppError } from "@/lib/errors/base-error";

export class PriceAdjustmentError extends AppError {
  status = 400;
  code: string;

  constructor(
    message: string,
    code = "PRICE_ADJUSTMENT_ERROR",
    details?: unknown
  ) {
    super(message, details);
    this.code = code;
  }
}

export class SubscriptionNotAdjustableError extends PriceAdjustmentError {
  status = 400;

  constructor(subscriptionId: string, reason: string) {
    super(
      `Subscription ${subscriptionId} cannot be price-adjusted: ${reason}`,
      "SUBSCRIPTION_NOT_ADJUSTABLE",
      { subscriptionId, reason }
    );
  }
}

export class PriceAdjustmentNotFoundError extends PriceAdjustmentError {
  status = 404;

  constructor(subscriptionId: string) {
    super(
      `No price adjustments found for subscription ${subscriptionId}`,
      "PRICE_ADJUSTMENTS_NOT_FOUND",
      { subscriptionId }
    );
  }
}
