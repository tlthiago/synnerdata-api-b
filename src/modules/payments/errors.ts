import { AppError } from "@/lib/errors/base-error";

export class PaymentError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "PAYMENT_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class CheckoutError extends PaymentError {
  status = 400;

  constructor(message: string, code = "CHECKOUT_ERROR") {
    super(message, code);
  }
}

export class MissingBillingDataError extends PaymentError {
  status = 400;

  constructor(missingFields: string[]) {
    super(
      `Dados de cobrança obrigatórios ausentes: ${missingFields.join(", ")}`,
      "MISSING_BILLING_DATA",
      { missingFields }
    );
  }
}

export class EmailNotVerifiedError extends PaymentError {
  status = 400;

  constructor() {
    super("E-mail deve ser verificado antes do checkout", "EMAIL_NOT_VERIFIED");
  }
}

export class SubscriptionNotFoundError extends PaymentError {
  status = 404;

  constructor(identifier: string) {
    super(
      `Assinatura não encontrada: ${identifier}`,
      "SUBSCRIPTION_NOT_FOUND",
      {
        identifier,
      }
    );
  }
}

export class SubscriptionAlreadyActiveError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Organização já possui uma assinatura ativa",
      "SUBSCRIPTION_ALREADY_ACTIVE"
    );
  }
}

export class SubscriptionNotCancelableError extends PaymentError {
  status = 400;

  constructor(subscriptionStatus: string) {
    super(
      `Não é possível cancelar assinatura com status: ${subscriptionStatus}`,
      "SUBSCRIPTION_NOT_CANCELABLE",
      { subscriptionStatus }
    );
  }
}

export class SubscriptionNotRestorableError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Assinatura só pode ser restaurada enquanto pendente de cancelamento",
      "SUBSCRIPTION_NOT_RESTORABLE"
    );
  }
}

export class TrialAlreadyUsedError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Esta organização já utilizou seu período de avaliação",
      "TRIAL_ALREADY_USED"
    );
  }
}

export class TrialExpiredError extends PaymentError {
  status = 403;

  constructor() {
    super(
      "Período de avaliação expirado. Faça upgrade para continuar.",
      "TRIAL_EXPIRED"
    );
  }
}

export class PlanNotFoundError extends PaymentError {
  status = 404;

  constructor(planId: string) {
    super(`Plano não encontrado: ${planId}`, "PLAN_NOT_FOUND", { planId });
  }
}

export class PlanNotAvailableError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(`Plano não disponível: ${planId}`, "PLAN_NOT_AVAILABLE", { planId });
  }
}

export class TrialPlanAsBaseError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(
      `Planos de avaliação não podem ser usados como base para checkout customizado: ${planId}`,
      "TRIAL_PLAN_AS_BASE",
      { planId }
    );
  }
}

export class YearlyBillingNotAvailableError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(
      `Cobrança anual não disponível para o plano: ${planId}`,
      "YEARLY_BILLING_NOT_AVAILABLE",
      { planId }
    );
  }
}

export class PlanNameAlreadyExistsError extends PaymentError {
  status = 400;

  constructor(name: string) {
    super(
      `Já existe um plano com o nome "${name}"`,
      "PLAN_NAME_ALREADY_EXISTS",
      {
        name,
      }
    );
  }
}

export class PlanHasActiveSubscriptionsError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(
      `Não é possível excluir o plano ${planId}: possui assinaturas ativas`,
      "PLAN_HAS_ACTIVE_SUBSCRIPTIONS",
      { planId }
    );
  }
}

export class OrganizationNotFoundError extends PaymentError {
  status = 404;

  constructor(organizationId: string) {
    super(
      `Organização não encontrada: ${organizationId}`,
      "ORGANIZATION_NOT_FOUND",
      {
        organizationId,
      }
    );
  }
}

export class NoActiveOrganizationError extends PaymentError {
  status = 400;

  constructor() {
    super("Nenhuma organização ativa na sessão", "NO_ACTIVE_ORGANIZATION");
  }
}

export class WebhookValidationError extends PaymentError {
  status = 401;

  constructor() {
    super("Credenciais de webhook inválidas", "INVALID_WEBHOOK_CREDENTIALS");
  }
}

export class WebhookProcessingError extends PaymentError {
  status = 500;

  constructor(eventType: string, reason: string) {
    super(
      `Falha ao processar evento de webhook ${eventType}: ${reason}`,
      "WEBHOOK_PROCESSING_ERROR",
      { eventType, reason }
    );
  }
}

export class CustomerNotFoundError extends PaymentError {
  status = 404;

  constructor(identifier: string) {
    super(`Cliente não encontrado: ${identifier}`, "CUSTOMER_NOT_FOUND", {
      identifier,
    });
  }
}

export class CustomerCreationError extends PaymentError {
  status = 502;

  constructor(reason: string) {
    super(`Falha ao criar cliente: ${reason}`, "CUSTOMER_CREATION_ERROR", {
      reason,
    });
  }
}

export class PagarmeAuthorizationError extends PaymentError {
  status = 400;

  constructor(operation: string) {
    super(
      "Falha na autenticação com o serviço de pagamento. Verifique as credenciais da API.",
      "PAGARME_AUTHORIZATION_ERROR",
      { operation }
    );
  }
}

export class InvoiceNotFoundError extends PaymentError {
  status = 404;

  constructor(invoiceId: string) {
    super(`Fatura não encontrada: ${invoiceId}`, "INVOICE_NOT_FOUND", {
      invoiceId,
    });
  }
}

export class PagarmeApiError extends PaymentError {
  constructor(
    httpStatus: number,
    apiError: { message?: string; errors?: Record<string, string[]> }
  ) {
    const message = apiError.message ?? "Unknown Pagarme API error";
    super(message, "PAGARME_API_ERROR", {
      httpStatus,
      errors: apiError.errors,
    });
    this.status = httpStatus >= 500 ? 502 : 400;
  }
}

export class PagarmeTimeoutError extends PaymentError {
  status = 504;

  constructor(endpoint: string) {
    super(`Timeout na API do Pagar.me: ${endpoint}`, "PAGARME_TIMEOUT", {
      endpoint,
    });
  }
}

export class PagarmeConnectionError extends PaymentError {
  status = 502;

  constructor(endpoint: string, reason: string) {
    super(
      "Não foi possível conectar ao serviço de pagamento. Tente novamente em alguns instantes.",
      "PAGARME_CONNECTION_ERROR",
      {
        endpoint,
        reason,
      }
    );
  }
}

export class SamePlanError extends PaymentError {
  status = 400;

  constructor() {
    super("Já inscrito neste plano", "SAME_PLAN");
  }
}

export class SameBillingCycleError extends PaymentError {
  status = 400;

  constructor() {
    super("Já está neste ciclo de cobrança", "SAME_BILLING_CYCLE");
  }
}

export class SubscriptionNotActiveError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Assinatura deve estar ativa para alterar planos",
      "SUBSCRIPTION_NOT_ACTIVE"
    );
  }
}

export class PlanChangeInProgressError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Já existe uma alteração de plano agendada. Cancele-a primeiro para fazer uma nova alteração.",
      "PLAN_CHANGE_IN_PROGRESS"
    );
  }
}

export class NoScheduledChangeError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Nenhuma alteração de plano agendada para cancelar",
      "NO_SCHEDULED_CHANGE"
    );
  }
}

export class EmployeeCountExceedsLimitError extends PaymentError {
  status = 400;

  constructor(employeeCount: number, maxAllowed = 180) {
    super(
      `Para ${employeeCount} funcionários, entre em contato para um plano Enterprise`,
      "EMPLOYEE_COUNT_EXCEEDS_LIMIT",
      { employeeCount, maxAllowed }
    );
  }
}

export class EmployeeCountRequiredError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "Quantidade de funcionários é obrigatória para checkout",
      "EMPLOYEE_COUNT_REQUIRED"
    );
  }
}

export class PricingTierNotFoundError extends PaymentError {
  status = 404;

  constructor(planId: string, employeeRange: string) {
    super(
      `Nenhuma faixa de preço encontrada para o intervalo "${employeeRange}" no plano ${planId}`,
      "PRICING_TIER_NOT_FOUND",
      { planId, employeeRange }
    );
  }
}

export class InvalidEmployeeRangeError extends PaymentError {
  status = 400;

  constructor(employeeRange: string) {
    super(
      `Formato de faixa de funcionários inválido: "${employeeRange}". Formato esperado: "min-max" (ex.: "0-10")`,
      "INVALID_EMPLOYEE_RANGE",
      { employeeRange }
    );
  }
}

export class FeatureNotAvailableError extends PaymentError {
  status = 403;

  constructor(featureName: string, requiredPlan?: string) {
    super(
      requiredPlan
        ? `Funcionalidade "${featureName}" requer o plano ${requiredPlan}`
        : `Funcionalidade "${featureName}" não disponível no seu plano atual`,
      "FEATURE_NOT_AVAILABLE",
      { featureName }
    );
  }
}

export class EmployeeLimitReachedError extends PaymentError {
  status = 400;

  constructor(current: number, limit: number) {
    super(
      `Limite de funcionários atingido (${current}/${limit}). Faça upgrade para cadastrar mais.`,
      "EMPLOYEE_LIMIT_REACHED",
      { current, limit }
    );
  }
}

// 2.3 - No change requested (same configuration)
export class NoChangeRequestedError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "A configuração selecionada é igual à sua assinatura atual.",
      "NO_CHANGE_REQUESTED"
    );
  }
}

// 2.3b - Cannot change to a private (custom) plan via self-service
export class CannotChangeToPrivatePlanError extends PaymentError {
  status = 400;

  constructor(planId: string) {
    super(
      "Planos privados não estão disponíveis para mudança self-service. Entre em contato com o suporte.",
      "CANNOT_CHANGE_TO_PRIVATE_PLAN",
      { planId }
    );
  }
}

// 2.4 - Employee count exceeds new plan limit on downgrade
export class EmployeeCountExceedsNewPlanLimitError extends PaymentError {
  status = 400;

  constructor(currentCount: number, newLimit: number) {
    const toRemove = currentCount - newLimit;
    super(
      `Você tem ${currentCount} funcionários cadastrados. O plano selecionado permite máximo ${newLimit}. Remova ${toRemove} funcionário(s) para continuar.`,
      "EMPLOYEE_COUNT_EXCEEDS_NEW_PLAN_LIMIT",
      { currentCount, newLimit, toRemove }
    );
  }
}

export class EmployeeCountExceedsTierLimitError extends PaymentError {
  status = 400;

  constructor(currentCount: number, maxEmployees: number) {
    super(
      `A organização possui ${currentCount} funcionários ativos, mas o plano selecionado suporta até ${maxEmployees}. Remova ${currentCount - maxEmployees} funcionário(s) ou escolha um plano com limite maior.`,
      "EMPLOYEE_COUNT_EXCEEDS_TIER_LIMIT",
      { currentCount, maxEmployees, toRemove: currentCount - maxEmployees }
    );
  }
}

// Plans Module - Tier Errors

export class TrialPlanNotFoundError extends PaymentError {
  status = 500;

  constructor() {
    super(
      "Plano de avaliação não encontrado. Execute o seed do banco de dados.",
      "TRIAL_PLAN_NOT_FOUND"
    );
  }
}

export class TrialPlanMisconfiguredError extends PaymentError {
  status = 500;

  constructor() {
    super(
      "Plano de avaliação sem faixas de preço. Verifique o seed do banco de dados.",
      "TRIAL_PLAN_MISCONFIGURED"
    );
  }
}

export class TrialNotCancellableError extends PaymentError {
  status = 400;

  constructor(organizationId: string) {
    super(
      "Assinaturas de avaliação não podem ser canceladas. O período de avaliação expira naturalmente.",
      "TRIAL_NOT_CANCELLABLE",
      { organizationId }
    );
  }
}

export class BillingNotAvailableForTrialError extends PaymentError {
  status = 400;

  constructor(organizationId: string) {
    super(
      "Operações de cobrança não estão disponíveis para assinaturas de avaliação",
      "BILLING_NOT_AVAILABLE_FOR_TRIAL",
      { organizationId }
    );
  }
}

export class InvalidTierCountError extends PaymentError {
  status = 422;

  constructor(provided: number, minimum: number) {
    super(
      `São necessárias pelo menos ${minimum} faixa(s) de preço, mas foram recebidas ${provided}.`,
      "INVALID_TIER_COUNT",
      { provided, minimum }
    );
  }
}

export class InvalidTierRangeError extends PaymentError {
  status = 422;

  constructor(
    index: number,
    provided: { min: number; max: number },
    expected: { min: number; max: number }
  ) {
    super(
      `Faixa no índice ${index} tem intervalo inválido. Esperado ${expected.min}-${expected.max}, recebido ${provided.min}-${provided.max}.`,
      "INVALID_TIER_RANGE",
      { index, provided, expected }
    );
  }
}

export class TierNegativeMinError extends PaymentError {
  status = 422;

  constructor(index: number, minEmployees: number) {
    super(
      `Faixa no índice ${index} tem minEmployees negativo (${minEmployees}). Deve ser >= 0.`,
      "TIER_NEGATIVE_MIN",
      { index, minEmployees }
    );
  }
}

export class TierMinExceedsMaxError extends PaymentError {
  status = 422;

  constructor(index: number, min: number, max: number) {
    super(
      `Faixa no índice ${index} tem minEmployees (${min}) > maxEmployees (${max}).`,
      "TIER_MIN_EXCEEDS_MAX",
      { index, min, max }
    );
  }
}

export class TierOverlapError extends PaymentError {
  status = 422;

  constructor(index: number, previousMax: number, currentMin: number) {
    super(
      `Faixa no índice ${index} sobrepõe a faixa anterior: máximo anterior é ${previousMax}, mínimo atual é ${currentMin}.`,
      "TIER_OVERLAP",
      { index, previousMax, currentMin }
    );
  }
}

export class TierGapError extends PaymentError {
  status = 422;

  constructor(index: number, expectedMin: number, actualMin: number) {
    super(
      `Lacuna entre faixas nos índices ${index - 1} e ${index}: mínimo esperado ${expectedMin}, recebido ${actualMin}.`,
      "TIER_GAP",
      { index, expectedMin, actualMin }
    );
  }
}

export class TierNotFoundError extends PaymentError {
  status = 404;

  constructor(tierId: string, planId?: string) {
    const message = planId
      ? `Faixa "${tierId}" não encontrada no plano "${planId}".`
      : `Faixa "${tierId}" não encontrada.`;
    super(message, "TIER_NOT_FOUND", {
      tierId,
      ...(planId && { planId }),
    });
  }
}

export class TiersInUseError extends PaymentError {
  status = 409;

  constructor(
    activeSubscriptions: number,
    pendingCheckouts: number,
    pendingChanges: number
  ) {
    super(
      `Não é possível excluir faixas: ${activeSubscriptions} assinatura(s) ativa(s), ${pendingCheckouts} checkout(s) pendente(s), ${pendingChanges} alteração(ões) de plano pendente(s) referenciam as faixas atuais.`,
      "TIERS_IN_USE",
      { activeSubscriptions, pendingCheckouts, pendingChanges }
    );
  }
}

// Feature Errors

export class InvalidFeatureIdsError extends PaymentError {
  status = 422;

  constructor(invalidIds: string[]) {
    super(
      `Funcionalidades não encontradas ou inativas: ${invalidIds.join(", ")}`,
      "INVALID_FEATURE_IDS",
      { invalidIds }
    );
  }
}

export class FeatureNotFoundError extends PaymentError {
  status = 404;

  constructor(featureId: string) {
    super(`Funcionalidade não encontrada: ${featureId}`, "FEATURE_NOT_FOUND", {
      featureId,
    });
  }
}

export class FeatureAlreadyExistsError extends PaymentError {
  status = 409;

  constructor(featureId: string) {
    super(
      `Funcionalidade com id "${featureId}" já existe`,
      "FEATURE_ALREADY_EXISTS",
      { featureId }
    );
  }
}

// Billing Profile Errors

export class BillingProfileNotFoundError extends PaymentError {
  status = 404;

  constructor(organizationId: string) {
    super(
      `Perfil de cobrança não encontrado para a organização: ${organizationId}`,
      "BILLING_PROFILE_NOT_FOUND",
      { organizationId }
    );
  }
}

export class BillingProfileAlreadyExistsError extends PaymentError {
  status = 409;

  constructor(organizationId: string) {
    super(
      `Perfil de cobrança já existe para a organização: ${organizationId}`,
      "BILLING_PROFILE_ALREADY_EXISTS",
      { organizationId }
    );
  }
}

export class BillingProfileRequiredError extends PaymentError {
  status = 400;

  constructor(organizationId: string) {
    super(
      `Perfil de cobrança é obrigatório para checkout. Organização ${organizationId} não possui perfil de cobrança e nenhum dado de cobrança foi fornecido.`,
      "BILLING_PROFILE_REQUIRED",
      { organizationId }
    );
  }
}
