import { PaymentError } from "@/modules/payments/errors";

export class SubscriptionNotTrialError extends PaymentError {
  status = 400;

  constructor(organizationId: string) {
    super(
      `Assinatura da organização ${organizationId} não é um trial`,
      "SUBSCRIPTION_NOT_TRIAL",
      { organizationId }
    );
  }
}

export class TrialMaxEmployeesTooLowError extends PaymentError {
  status = 400;

  constructor(requested: number, current: number) {
    super(
      `Limite de funcionários (${requested}) não pode ser inferior à quantidade atual (${current})`,
      "TRIAL_MAX_EMPLOYEES_TOO_LOW",
      { requested, current }
    );
  }
}

export class TrialEndInPastError extends PaymentError {
  status = 400;

  constructor(trialStart: Date, computedTrialEnd: Date) {
    super(
      `A nova data de expiração do trial (${computedTrialEnd.toISOString()}) é no passado`,
      "TRIAL_END_IN_PAST",
      {
        trialStart: trialStart.toISOString(),
        computedTrialEnd: computedTrialEnd.toISOString(),
      }
    );
  }
}

export class SubscriptionNotActiveOrExpiredError extends PaymentError {
  status = 400;

  constructor(status: string, organizationId: string) {
    super(
      `Assinatura com status "${status}" não pode ter limites ajustados`,
      "SUBSCRIPTION_NOT_ACTIVE_OR_EXPIRED",
      { status, organizationId }
    );
  }
}
