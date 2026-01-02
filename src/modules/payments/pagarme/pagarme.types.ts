export type PagarmePhone = {
  country_code: string;
  area_code: string;
  number: string;
};

export type PagarmeAddress = {
  country: string;
  state: string;
  city: string;
  zip_code: string;
  line_1: string;
  line_2?: string;
};

export type CreateCustomerRequest = {
  name: string;
  email: string;
  document: string;
  type: "individual" | "company";
  phones?: {
    mobile_phone?: PagarmePhone;
    home_phone?: PagarmePhone;
  };
  address?: PagarmeAddress;
  metadata?: Record<string, string>;
};

export type PagarmeCustomer = {
  id: string;
  name: string;
  email: string;
  document: string;
  type: "individual" | "company";
  delinquent?: boolean;
  phones?: {
    mobile_phone?: PagarmePhone;
    home_phone?: PagarmePhone;
  };
  address?: PagarmeAddress;
  metadata?: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type ListCustomersResponse = {
  data: PagarmeCustomer[];
  paging: {
    total: number;
    previous?: string;
    next?: string;
  };
};

export type CreatePlanRequest = {
  name: string;
  description?: string;
  statement_descriptor?: string;
  interval: "day" | "week" | "month" | "year";
  interval_count: number;
  billing_type: "prepaid" | "postpaid" | "exact_day";
  payment_methods: string[];
  currency: string;
  items: PlanItem[];
  trial_period_days?: number;
  metadata?: Record<string, string>;
};

export type PlanItem = {
  name: string;
  quantity: number;
  pricing_scheme: {
    price: number; // centavos
    scheme_type: "unit" | "package" | "volume" | "tier";
  };
};

export type PagarmePlan = {
  id: string;
  name: string;
  description?: string;
  interval: string;
  interval_count: number;
  billing_type: string;
  payment_methods: string[];
  currency: string;
  items: PlanItem[];
  trial_period_days?: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CreateSubscriptionRequest = {
  customer_id: string;
  plan_id: string;
  payment_method: "credit_card" | "boleto" | "debit_card";
  card_id?: string;
  card?: {
    number: string;
    holder_name: string;
    exp_month: number;
    exp_year: number;
    cvv: string;
    billing_address?: PagarmeAddress;
  };
  metadata?: Record<string, string>;
};

export type PagarmeSubscription = {
  id: string;
  code: string;
  start_at: string;
  interval: string;
  interval_count: number;
  billing_type: string;
  current_cycle?: {
    id: string;
    start_at: string;
    end_at: string;
    billing_at: string;
    status: string;
  };
  next_billing_at: string;
  payment_method: string;
  currency: string;
  status: "active" | "canceled" | "pending" | "failed";
  created_at: string;
  updated_at: string;
  customer: PagarmeCustomer;
  plan: PagarmePlan;
  metadata?: Record<string, string>;
};

export type CreateOrderRequest = {
  customer_id: string;
  items: OrderItem[];
  payments: OrderPayment[];
  closed?: boolean;
  metadata?: Record<string, string>;
};

export type OrderItem = {
  amount: number; // centavos
  description: string;
  quantity: number;
  code?: string;
};

export type OrderPayment = {
  payment_method: "checkout";
  checkout: CheckoutPayment;
};

export type CheckoutPayment = {
  accepted_payment_methods: string[];
  success_url: string;
  skip_checkout_success_page?: boolean;
  customer_editable?: boolean;
  billing_address_editable?: boolean;
  expires_in?: number; // minutos
};

export type PagarmeOrder = {
  id: string;
  code: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "canceled" | "failed";
  customer: PagarmeCustomer;
  items: OrderItem[];
  checkouts?: PagarmeCheckout[];
  created_at: string;
  updated_at: string;
};

export type PagarmeCheckout = {
  id: string;
  url: string;
  amount: number;
  status: string;
  success_url: string;
  payment_url: string;
  expires_at: string;
};

export type PagarmeInvoice = {
  id: string;
  code: string;
  url: string;
  amount: number;
  status: "pending" | "paid" | "canceled" | "scheduled" | "failed";
  due_at: string;
  paid_at?: string;
  subscription_id: string;
  cycle?: {
    id: string;
    start_at: string;
    end_at: string;
  };
  created_at: string;
};

export type ListInvoicesResponse = {
  data: PagarmeInvoice[];
  paging?: {
    total?: number;
    previous?: string;
    next?: string;
  };
};

export type PagarmeWebhookPayload = {
  id: string;
  type: PagarmeWebhookEventType;
  created_at: string;
  data: PagarmeWebhookData;
};

export type PagarmeWebhookEventType =
  | "charge.paid"
  | "charge.payment_failed"
  | "charge.refunded"
  | "charge.pending"
  | "subscription.created"
  | "subscription.canceled"
  | "subscription.updated";

export type PagarmeWebhookData = {
  id: string;
  code?: string;
  status?: string;
  amount?: number;
  // Subscription start date (used in subscription.created from payment link)
  start_at?: string;
  subscription?: {
    id: string;
    status: string;
  };
  invoice?: {
    id: string;
    code: string;
    url: string;
  };
  current_period?: {
    start_at: string;
    end_at: string;
  };
  last_transaction?: {
    id: string;
    status: string;
    gateway_response?: {
      code: string;
      message: string;
    };
  };
  // Plan data (used in subscription.created from payment link)
  plan?: {
    id: string;
    name: string;
    metadata?: {
      local_plan_id?: string;
    };
  };
  // Customer data from webhook (expanded for subscription.created)
  customer?: {
    id: string;
    name: string;
    email: string;
    document: string;
    document_type: "CPF" | "CNPJ";
    type: "individual" | "company";
    phones?: {
      mobile_phone?: {
        country_code: string;
        area_code: string;
        number: string;
      };
    };
  };
  // Card data (masked)
  card?: {
    id: string;
    last_four_digits: string;
    brand: string;
    exp_month: number;
    exp_year: number;
  };
  // Subscription updated timestamp
  updated_at?: string;
  metadata?: Record<string, string>;
};

export type CreateAccessTokenResponse = {
  token: string;
  expires_at: string;
};

export type PaymentLinkPaymentSettings = {
  accepted_payment_methods: Array<"credit_card" | "boleto" | "pix">;
  credit_card_settings?: {
    operation_type: "auth_and_capture" | "auth_only" | "pre_auth";
    installments_setup?: {
      interest_type?: "simple" | "compound";
    };
  };
};

export type CreatePaymentLinkRequest = {
  type: "order" | "subscription";
  name: string;
  payment_settings: PaymentLinkPaymentSettings;
  customer_settings?: {
    customer_id: string;
  };
  cart_settings?: {
    recurrences?: Array<{
      start_in: number;
      plan_id: string;
    }>;
    items?: Array<{
      amount: number;
      description: string;
      quantity: number;
    }>;
  };
  success_url?: string;
  max_paid_sessions?: number;
  metadata?: Record<string, string>;
};

export type PagarmePaymentLink = {
  id: string;
  url: string;
  short_url: string;
  status: "active" | "inactive" | "expired";
  type: "order" | "subscription";
  name: string;
  success_url: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
};

export type PagarmeApiErrorResponse = {
  message?: string;
  errors?: Record<string, string[]>;
};
