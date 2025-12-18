import { ForbiddenError } from "./http-errors";

export class SubscriptionRequiredError extends ForbiddenError {
  code = "SUBSCRIPTION_REQUIRED";

  constructor(status: string) {
    super(`Subscription required. Current status: ${status}`);
  }
}

export class FeatureNotAvailableError extends ForbiddenError {
  code = "FEATURE_NOT_AVAILABLE";

  constructor(featureName: string, requiredPlan?: string) {
    super(
      requiredPlan
        ? `Feature "${featureName}" requires plan ${requiredPlan}`
        : `Feature "${featureName}" is not available in your current plan`
    );
  }
}
