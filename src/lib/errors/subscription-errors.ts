import { ForbiddenError } from "./http-errors";

export class SubscriptionRequiredError extends ForbiddenError {
  code = "SUBSCRIPTION_REQUIRED";

  constructor(status: string) {
    super(`Assinatura necessária. Status atual: ${status}`);
  }
}

export class FeatureNotAvailableError extends ForbiddenError {
  code = "FEATURE_NOT_AVAILABLE";

  constructor(featureName: string, requiredPlan?: string) {
    super(
      requiredPlan
        ? `Funcionalidade "${featureName}" requer o plano ${requiredPlan}`
        : `Funcionalidade "${featureName}" não está disponível no seu plano atual`
    );
  }
}
