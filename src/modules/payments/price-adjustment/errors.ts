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
      `Assinatura ${subscriptionId} não pode ter preço reajustado: ${reason}`,
      "SUBSCRIPTION_NOT_ADJUSTABLE",
      { subscriptionId, reason }
    );
  }
}

export class TierNotFoundForAdjustmentError extends PriceAdjustmentError {
  status = 404;

  constructor(pricingTierId: string, planId: string) {
    super(
      `Faixa de preço ${pricingTierId} não encontrada ou não pertence ao plano ${planId}`,
      "TIER_NOT_FOUND_FOR_ADJUSTMENT",
      { pricingTierId, planId }
    );
  }
}
