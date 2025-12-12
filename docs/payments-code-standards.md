# Payments Module - Code Standards

Este documento define os padrões de código para implementação do módulo de payments, baseado nas best practices do Elysia e nos padrões já estabelecidos no projeto.

## Estrutura de Arquivos

```
src/modules/payments/
├── index.ts                      # Controller principal (composição)
├── errors.ts                     # Custom errors do módulo
├── types.ts                      # Types compartilhados (não Zod)
│
├── checkout/
│   ├── index.ts                  # Controller (rotas HTTP)
│   ├── checkout.service.ts       # Business logic
│   └── checkout.model.ts         # Schemas Zod + tipos inferidos
│
├── subscription/
│   ├── index.ts
│   ├── subscription.service.ts
│   └── subscription.model.ts
│
├── customer/
│   ├── customer.service.ts       # Sem controller (uso interno)
│   └── customer.model.ts
│
├── webhook/
│   ├── index.ts
│   ├── webhook.service.ts
│   └── webhook.model.ts
│
├── billing/
│   ├── index.ts
│   ├── billing.service.ts
│   └── billing.model.ts
│
├── plan/
│   ├── index.ts
│   ├── plan.service.ts
│   └── plan.model.ts
│
├── hooks/
│   ├── index.ts                  # Event emitter singleton
│   └── hooks.types.ts            # Event types
│
├── authorization/
│   └── authorization.service.ts  # Role-based authorization
│
├── jobs/
│   └── trial-expiration.ts       # Cron job
│
└── pagarme/
    ├── client.ts                 # HTTP Client
    └── pagarme.types.ts          # Pagarme API types
```

---

## Convenções de Nomenclatura

### Arquivos

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Controller | `index.ts` | `checkout/index.ts` |
| Service | `{feature}.service.ts` | `checkout.service.ts` |
| Model (schemas) | `{feature}.model.ts` | `checkout.model.ts` |
| Types gerais | `{feature}.types.ts` | `pagarme.types.ts` |

### Exports

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Controller | `{feature}Controller` | `checkoutController` |
| Service class | `{Feature}Service` | `CheckoutService` |
| Schema | `{action}{Entity}Schema` | `createCheckoutSchema` |
| Type (inferido) | `{Action}{Entity}` | `CreateCheckout` |

---

## Controllers (index.ts)

Controllers são instâncias Elysia responsáveis por:
- Definição de rotas HTTP
- Validação de request/response via schemas
- Delegação para services

### Padrão de Controller

```typescript
// src/modules/payments/checkout/index.ts
import { Elysia } from "elysia";
import { CheckoutService } from "./checkout.service";
import {
  createCheckoutSchema,
  createCheckoutResponseSchema,
  checkoutCallbackParamsSchema,
} from "./checkout.model";

export const checkoutController = new Elysia({
  name: "checkout",
  prefix: "/checkout",
  detail: { tags: ["Payments - Checkout"] },
})
  .post(
    "/",
    async ({ body, user }) => {
      return CheckoutService.create({
        ...body,
        userId: user.id,
      });
    },
    {
      body: createCheckoutSchema,
      response: createCheckoutResponseSchema,
      detail: { summary: "Create checkout session for upgrade" },
    }
  )
  .get(
    "/callback",
    async ({ query }) => {
      return CheckoutService.handleCallback(query);
    },
    {
      query: checkoutCallbackParamsSchema,
      detail: { summary: "Handle checkout callback (intermediate redirect)" },
    }
  );
```

### Regras para Controllers

1. **Sem lógica de negócio** - apenas chama services
2. **Validação via schemas** - nunca validar manualmente no handler
3. **OpenAPI tags** - usar `detail.tags` para agrupar no Swagger
4. **Prefixo descritivo** - facilita composição no controller principal
5. **Nome do plugin** - usar `name` para deduplicação e debugging

---

## Services

Services contêm a lógica de negócio. Existem dois padrões:

### 1. Services Independentes de Request (Preferido)

Para lógica que não depende do contexto HTTP, usar **abstract class com static methods**:

```typescript
// src/modules/payments/checkout/checkout.service.ts
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { schema } from "@/db/schema";
import { PagarmeClient } from "../pagarme/client";
import { CustomerService } from "../customer/customer.service";
import { PaymentHooks } from "../hooks";
import type { CreateCheckoutInput, CheckoutCallbackInput } from "./checkout.model";
import { CheckoutError } from "../errors";

export abstract class CheckoutService {
  static async create(input: CreateCheckoutInput) {
    const { organizationId, planId, successUrl, cancelUrl, annual, billing } = input;

    // Buscar organization profile
    const profile = await db.query.organizationProfiles.findFirst({
      where: eq(schema.organizationProfiles.organizationId, organizationId),
    });

    if (!profile) {
      throw new CheckoutError("Organization profile not found");
    }

    // Validar dados obrigatórios para checkout
    if (!profile.taxId || !profile.phone) {
      throw new CheckoutError(
        "CNPJ and phone are required for checkout",
        "MISSING_BILLING_DATA"
      );
    }

    // Criar/atualizar customer no Pagarme
    const customer = await CustomerService.getOrCreateForCheckout(profile, billing);

    // Buscar plano
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(schema.subscriptionPlans.id, planId),
    });

    if (!plan) {
      throw new CheckoutError("Plan not found", "PLAN_NOT_FOUND");
    }

    // Criar checkout no Pagarme
    const checkout = await PagarmeClient.createCheckout({
      customerId: customer.pagarmeCustomerId,
      planId: plan.pagarmePlanId,
      amount: annual ? plan.priceYearly : plan.priceMonthly,
      successUrl: `${process.env.API_URL}/payments/checkout/callback?org=${organizationId}`,
      cancelUrl,
    });

    return {
      checkoutUrl: checkout.url,
    };
  }

  static async handleCallback(input: CheckoutCallbackInput) {
    const { org, status } = input;

    // Aguardar processamento do webhook (polling ou delay)
    await this.waitForWebhookProcessing(org);

    // Buscar subscription atualizada
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.organizationId, org),
    });

    // Emitir evento
    if (subscription?.status === "active") {
      PaymentHooks.emit("subscription.activated", { subscription });
    }

    // Redirecionar para success URL original
    return { redirect: `${process.env.APP_URL}/dashboard?upgrade=success` };
  }

  private static async waitForWebhookProcessing(
    organizationId: string,
    maxAttempts = 10,
    delayMs = 500
  ) {
    for (let i = 0; i < maxAttempts; i++) {
      const subscription = await db.query.subscriptions.findFirst({
        where: eq(schema.subscriptions.organizationId, organizationId),
      });

      if (subscription?.status === "active") {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
```

### 2. Services Dependentes de Request

Para lógica que precisa de acesso ao contexto HTTP (headers, cookies), usar **plugin Elysia**:

```typescript
// src/modules/payments/authorization/index.ts
import { Elysia } from "elysia";
import { db } from "@/db";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db/schema";

export const authorizationPlugin = new Elysia({ name: "payments-authorization" })
  .derive(async ({ user }) => ({
    async canManageBilling(organizationId: string) {
      if (!user) return false;

      const member = await db.query.members.findFirst({
        where: and(
          eq(schema.members.organizationId, organizationId),
          eq(schema.members.userId, user.id)
        ),
      });

      return member?.role === "owner" || member?.role === "admin";
    },
  }));
```

### Regras para Services

1. **Sem dependência do Elysia** - services independentes não importam Elysia
2. **Transações explícitas** - usar `db.transaction()` quando necessário
3. **Erros tipados** - throw custom errors, nunca strings
4. **Sem side effects ocultos** - efeitos colaterais devem ser explícitos
5. **Métodos private** - usar para lógica auxiliar interna

---

## Models (Schemas Zod)

Models definem schemas de validação e tipos inferidos.

### Padrão de Model

```typescript
// src/modules/payments/checkout/checkout.model.ts
import { z } from "zod";

// ============================================================
// INPUT SCHEMAS
// ============================================================

export const billingDataSchema = z.object({
  document: z.string().min(14).max(18).optional(),
  phone: z.string().min(10).max(15).optional(),
  billingEmail: z.string().email().optional(),
});

export const createCheckoutSchema = z.object({
  organizationId: z.string().min(1),
  planId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  annual: z.boolean().default(false),
  billing: billingDataSchema.optional(),
});

export const checkoutCallbackParamsSchema = z.object({
  org: z.string().min(1),
  status: z.enum(["success", "canceled"]).optional(),
});

// ============================================================
// OUTPUT SCHEMAS
// ============================================================

export const createCheckoutResponseSchema = z.object({
  checkoutUrl: z.string().url(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type BillingData = z.infer<typeof billingDataSchema>;
export type CreateCheckout = z.infer<typeof createCheckoutSchema>;
export type CreateCheckoutInput = CreateCheckout & { userId: string };
export type CheckoutCallbackInput = z.infer<typeof checkoutCallbackParamsSchema>;
export type CreateCheckoutResponse = z.infer<typeof createCheckoutResponseSchema>;
```

### Regras para Models

1. **Zod como fonte única** - tipos derivados via `z.infer<>`
2. **Schemas separados** - input, output, params em schemas distintos
3. **Naming consistente** - `{action}{Entity}Schema` para schemas
4. **Types exportados** - sempre exportar tipos inferidos
5. **Validações ricas** - usar refinements e transforms quando necessário

### Validações Comuns

```typescript
// CPF/CNPJ
const documentSchema = z.string().refine(
  (val) => val.length === 11 || val.length === 14,
  { message: "Document must be CPF (11) or CNPJ (14)" }
);

// Valor monetário (centavos)
const amountSchema = z.number().int().positive();

// Status de subscription
const subscriptionStatusSchema = z.enum([
  "trial",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

// UUID
const idSchema = z.string().uuid();

// Paginação
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
```

---

## Custom Errors

Erros customizados permitem tratamento consistente e status codes apropriados.

### Definição de Errors

```typescript
// src/modules/payments/errors.ts

export class PaymentError extends Error {
  status = 400;
  code: string;

  constructor(message: string, code = "PAYMENT_ERROR") {
    super(message);
    this.code = code;
    this.name = "PaymentError";
  }

  toResponse() {
    return {
      error: this.message,
      code: this.code,
    };
  }
}

export class CheckoutError extends PaymentError {
  status = 400;

  constructor(message: string, code = "CHECKOUT_ERROR") {
    super(message, code);
    this.name = "CheckoutError";
  }
}

export class SubscriptionNotFoundError extends PaymentError {
  status = 404;

  constructor(organizationId: string) {
    super(
      `Subscription not found for organization ${organizationId}`,
      "SUBSCRIPTION_NOT_FOUND"
    );
    this.name = "SubscriptionNotFoundError";
  }
}

export class UnauthorizedBillingError extends PaymentError {
  status = 403;

  constructor() {
    super(
      "You don't have permission to manage billing for this organization",
      "UNAUTHORIZED_BILLING"
    );
    this.name = "UnauthorizedBillingError";
  }
}

export class TrialAlreadyUsedError extends PaymentError {
  status = 400;

  constructor() {
    super(
      "This organization has already used its trial period",
      "TRIAL_ALREADY_USED"
    );
    this.name = "TrialAlreadyUsedError";
  }
}

export class WebhookValidationError extends PaymentError {
  status = 401;

  constructor() {
    super("Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE");
    this.name = "WebhookValidationError";
  }
}
```

### Registro e Tratamento

```typescript
// src/modules/payments/index.ts
import { Elysia } from "elysia";
import {
  PaymentError,
  CheckoutError,
  SubscriptionNotFoundError,
  UnauthorizedBillingError,
  TrialAlreadyUsedError,
  WebhookValidationError,
} from "./errors";

export const paymentsController = new Elysia({
  name: "payments",
  prefix: "/payments",
})
  // Registrar errors para type safety no onError
  .error({
    PaymentError,
    CheckoutError,
    SubscriptionNotFoundError,
    UnauthorizedBillingError,
    TrialAlreadyUsedError,
    WebhookValidationError,
  })
  // Error handler do módulo
  .onError(({ code, error, status }) => {
    // Errors registrados têm tratamento tipado
    switch (code) {
      case "SubscriptionNotFoundError":
        return status(404, error.toResponse());

      case "UnauthorizedBillingError":
        return status(403, error.toResponse());

      case "TrialAlreadyUsedError":
      case "CheckoutError":
      case "PaymentError":
        return status(error.status, error.toResponse());

      case "WebhookValidationError":
        return status(401, error.toResponse());

      // Validation errors (Zod)
      case "VALIDATION":
        return status(422, {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: error.all,
        });
    }
  })
  // ... controllers
```

---

## Controller Principal (Composição)

O controller principal compõe todos os sub-controllers.

```typescript
// src/modules/payments/index.ts
import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { checkoutController } from "./checkout";
import { subscriptionController } from "./subscription";
import { webhookController } from "./webhook";
import { billingController } from "./billing";
import { planController } from "./plan";
import { authorizationPlugin } from "./authorization";
import {
  PaymentError,
  CheckoutError,
  SubscriptionNotFoundError,
  UnauthorizedBillingError,
  TrialAlreadyUsedError,
  WebhookValidationError,
} from "./errors";

export const paymentsController = new Elysia({
  name: "payments",
  prefix: "/payments",
})
  // Error types
  .error({
    PaymentError,
    CheckoutError,
    SubscriptionNotFoundError,
    UnauthorizedBillingError,
    TrialAlreadyUsedError,
    WebhookValidationError,
  })
  // Error handler
  .onError(({ code, error, status }) => {
    switch (code) {
      case "SubscriptionNotFoundError":
        return status(404, error.toResponse());
      case "UnauthorizedBillingError":
        return status(403, error.toResponse());
      case "WebhookValidationError":
        return status(401, error.toResponse());
      case "TrialAlreadyUsedError":
      case "CheckoutError":
      case "PaymentError":
        return status(error.status, error.toResponse());
      case "VALIDATION":
        return status(422, {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
        });
    }
  })

  // Webhook (sem auth - usa HMAC)
  .use(webhookController)

  // Plans (público para listagem)
  .use(planController)

  // Rotas protegidas
  .use(betterAuthPlugin)
  .use(authorizationPlugin)
  .guard(
    {
      auth: true,
      detail: { security: [{ bearerAuth: [] }] },
    },
    (app) =>
      app
        .use(checkoutController)
        .use(subscriptionController)
        .use(billingController)
  );
```

---

## Pagarme Client

Cliente HTTP para comunicação com a API Pagarme.

```typescript
// src/modules/payments/pagarme/client.ts
import { env } from "@/env";
import type {
  CreateCustomerRequest,
  CreateCustomerResponse,
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  GetSubscriptionResponse,
  CancelSubscriptionResponse,
} from "./pagarme.types";

const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";

export abstract class PagarmeClient {
  private static headers = {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${env.PAGARME_SECRET_KEY}:`).toString("base64")}`,
  };

  private static async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const headers: Record<string, string> = { ...this.headers };

    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch(`${PAGARME_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Pagarme API error: ${response.status} - ${JSON.stringify(error)}`
      );
    }

    return response.json();
  }

  // ============================================================
  // CUSTOMERS
  // ============================================================

  static async createCustomer(
    data: CreateCustomerRequest,
    idempotencyKey?: string
  ): Promise<CreateCustomerResponse> {
    return this.request("POST", "/customers", data, idempotencyKey);
  }

  static async getCustomer(customerId: string): Promise<CreateCustomerResponse> {
    return this.request("GET", `/customers/${customerId}`);
  }

  static async updateCustomer(
    customerId: string,
    data: Partial<CreateCustomerRequest>
  ): Promise<CreateCustomerResponse> {
    return this.request("PUT", `/customers/${customerId}`, data);
  }

  // ============================================================
  // SUBSCRIPTIONS
  // ============================================================

  static async createSubscription(
    data: CreateCheckoutRequest,
    idempotencyKey?: string
  ): Promise<CreateCheckoutResponse> {
    return this.request("POST", "/subscriptions", data, idempotencyKey);
  }

  static async getSubscription(
    subscriptionId: string
  ): Promise<GetSubscriptionResponse> {
    return this.request("GET", `/subscriptions/${subscriptionId}`);
  }

  static async cancelSubscription(
    subscriptionId: string,
    cancelPendingInvoices = true
  ): Promise<CancelSubscriptionResponse> {
    return this.request("DELETE", `/subscriptions/${subscriptionId}`, {
      cancel_pending_invoices: cancelPendingInvoices,
    });
  }

  // ============================================================
  // INVOICES
  // ============================================================

  static async getInvoices(
    subscriptionId: string,
    page = 1,
    size = 20
  ) {
    return this.request(
      "GET",
      `/invoices?subscription_id=${subscriptionId}&page=${page}&size=${size}`
    );
  }

  static async getInvoice(invoiceId: string) {
    return this.request("GET", `/invoices/${invoiceId}`);
  }

  // ============================================================
  // CHECKOUT / ORDERS
  // ============================================================

  static async createCheckout(
    data: CreateCheckoutRequest,
    idempotencyKey?: string
  ): Promise<CreateCheckoutResponse> {
    return this.request("POST", "/orders", data, idempotencyKey);
  }

  // ============================================================
  // CUSTOMER PORTAL
  // ============================================================

  static async createAccessToken(customerId: string) {
    return this.request("POST", `/customers/${customerId}/access_tokens`);
  }
}
```

---

## Hooks (Event Emitter)

Sistema de eventos para notificações e integrações.

```typescript
// src/modules/payments/hooks/hooks.types.ts
import type { Subscription } from "@/db/schema/payments";

export interface PaymentEvents {
  "trial.started": { subscription: Subscription };
  "trial.expiring": { subscription: Subscription; daysRemaining: number };
  "trial.expired": { subscription: Subscription };
  "subscription.activated": { subscription: Subscription };
  "subscription.canceled": { subscription: Subscription };
  "subscription.renewed": { subscription: Subscription };
  "charge.paid": { subscriptionId: string; invoiceId: string };
  "charge.failed": { subscriptionId: string; invoiceId: string; error: string };
}

export type PaymentEventName = keyof PaymentEvents;
export type PaymentEventPayload<T extends PaymentEventName> = PaymentEvents[T];
```

```typescript
// src/modules/payments/hooks/index.ts
import type { PaymentEventName, PaymentEventPayload, PaymentEvents } from "./hooks.types";

type EventHandler<T extends PaymentEventName> = (
  payload: PaymentEventPayload<T>
) => void | Promise<void>;

class PaymentHooksEmitter {
  private handlers = new Map<PaymentEventName, Set<EventHandler<PaymentEventName>>>();

  on<T extends PaymentEventName>(event: T, handler: EventHandler<T>) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler<PaymentEventName>);
    return () => this.off(event, handler);
  }

  off<T extends PaymentEventName>(event: T, handler: EventHandler<T>) {
    this.handlers.get(event)?.delete(handler as EventHandler<PaymentEventName>);
  }

  async emit<T extends PaymentEventName>(event: T, payload: PaymentEventPayload<T>) {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;

    const promises = Array.from(eventHandlers).map((handler) =>
      Promise.resolve(handler(payload)).catch((error) => {
        console.error(`Error in payment hook handler for ${event}:`, error);
      })
    );

    await Promise.all(promises);
  }
}

// Singleton
export const PaymentHooks = new PaymentHooksEmitter();

// Re-export types
export type { PaymentEventName, PaymentEventPayload, PaymentEvents };
```

### Uso dos Hooks

```typescript
// Registrar handlers (geralmente no bootstrap da aplicação)
import { PaymentHooks } from "@/modules/payments/hooks";

// Enviar email quando trial está expirando
PaymentHooks.on("trial.expiring", async ({ subscription, daysRemaining }) => {
  await sendEmail({
    to: subscription.billingEmail,
    template: "trial-expiring",
    data: { daysRemaining },
  });
});

// Atualizar analytics quando subscription é ativada
PaymentHooks.on("subscription.activated", async ({ subscription }) => {
  await analytics.track("subscription_activated", {
    organizationId: subscription.organizationId,
    plan: subscription.planId,
  });
});
```

---

## Webhook Handler

Processamento seguro de webhooks com validação HMAC.

```typescript
// src/modules/payments/webhook/index.ts
import { Elysia } from "elysia";
import { WebhookService } from "./webhook.service";
import { webhookPayloadSchema } from "./webhook.model";

export const webhookController = new Elysia({
  name: "webhook",
  prefix: "/webhooks",
  detail: { tags: ["Payments - Webhook"] },
}).post(
  "/pagarme",
  async ({ body, request }) => {
    const signature = request.headers.get("x-hub-signature");
    await WebhookService.process(body, signature);
    return { received: true };
  },
  {
    body: webhookPayloadSchema,
    detail: { summary: "Process Pagarme webhook" },
  }
);
```

```typescript
// src/modules/payments/webhook/webhook.service.ts
import { createHmac } from "node:crypto";
import { env } from "@/env";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { schema } from "@/db/schema";
import { WebhookValidationError } from "../errors";
import { PaymentHooks } from "../hooks";
import type { WebhookPayload } from "./webhook.model";

export abstract class WebhookService {
  static async process(payload: WebhookPayload, signature: string | null) {
    // Validar assinatura HMAC
    this.validateSignature(payload, signature);

    // Verificar idempotência
    const existingEvent = await db.query.subscriptionEvents.findFirst({
      where: eq(schema.subscriptionEvents.pagarmeEventId, payload.id),
    });

    if (existingEvent?.processedAt) {
      return; // Já processado
    }

    // Processar por tipo de evento
    switch (payload.type) {
      case "charge.paid":
        await this.handleChargePaid(payload);
        break;
      case "charge.payment_failed":
        await this.handleChargeFailed(payload);
        break;
      case "subscription.canceled":
        await this.handleSubscriptionCanceled(payload);
        break;
      case "invoice.created":
        await this.handleInvoiceCreated(payload);
        break;
    }

    // Registrar evento como processado
    await db.insert(schema.subscriptionEvents).values({
      id: crypto.randomUUID(),
      pagarmeEventId: payload.id,
      eventType: payload.type,
      payload: JSON.stringify(payload),
      processedAt: new Date(),
    });
  }

  private static validateSignature(payload: WebhookPayload, signature: string | null) {
    if (!signature) {
      throw new WebhookValidationError();
    }

    const expectedSignature = createHmac("sha256", env.PAGARME_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest("hex");

    if (signature !== `sha256=${expectedSignature}`) {
      throw new WebhookValidationError();
    }
  }

  private static async handleChargePaid(payload: WebhookPayload) {
    const subscriptionId = payload.data.subscription?.id;
    if (!subscriptionId) return;

    // Atualizar subscription para active
    await db
      .update(schema.subscriptions)
      .set({
        status: "active",
        currentPeriodStart: new Date(payload.data.current_period.start_at),
        currentPeriodEnd: new Date(payload.data.current_period.end_at),
      })
      .where(eq(schema.subscriptions.pagarmeSubscriptionId, subscriptionId));

    // Buscar subscription atualizada
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.pagarmeSubscriptionId, subscriptionId),
    });

    if (subscription) {
      PaymentHooks.emit("charge.paid", {
        subscriptionId: subscription.id,
        invoiceId: payload.data.invoice?.id ?? "",
      });
    }
  }

  private static async handleChargeFailed(payload: WebhookPayload) {
    const subscriptionId = payload.data.subscription?.id;
    if (!subscriptionId) return;

    // Atualizar subscription para past_due
    await db
      .update(schema.subscriptions)
      .set({ status: "past_due" })
      .where(eq(schema.subscriptions.pagarmeSubscriptionId, subscriptionId));

    const subscription = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.pagarmeSubscriptionId, subscriptionId),
    });

    if (subscription) {
      PaymentHooks.emit("charge.failed", {
        subscriptionId: subscription.id,
        invoiceId: payload.data.invoice?.id ?? "",
        error: payload.data.last_transaction?.gateway_response?.message ?? "Unknown error",
      });
    }
  }

  private static async handleSubscriptionCanceled(payload: WebhookPayload) {
    const subscriptionId = payload.data.id;

    await db
      .update(schema.subscriptions)
      .set({
        status: "canceled",
        canceledAt: new Date(),
      })
      .where(eq(schema.subscriptions.pagarmeSubscriptionId, subscriptionId));

    const subscription = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.pagarmeSubscriptionId, subscriptionId),
    });

    if (subscription) {
      PaymentHooks.emit("subscription.canceled", { subscription });
    }
  }

  private static async handleInvoiceCreated(payload: WebhookPayload) {
    // Log para auditoria, sem ação específica
    console.log("Invoice created:", payload.data.id);
  }
}
```

---

## Database Schema (Payments)

Tabelas específicas do módulo de payments.

```typescript
// src/db/schema/payments.ts
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

// ============================================================
// ENUMS
// ============================================================

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

// ============================================================
// TABLES
// ============================================================

export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  pagarmePlanId: text("pagarme_plan_id"),
  priceMonthly: integer("price_monthly").notNull(), // centavos
  priceYearly: integer("price_yearly").notNull(), // centavos
  trialDays: integer("trial_days").default(14).notNull(),
  limits: jsonb("limits").$type<PlanLimits>(),
  isActive: boolean("is_active").default(true).notNull(),
  isPublic: boolean("is_public").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    status: subscriptionStatusEnum("status").default("trial").notNull(),
    pagarmeSubscriptionId: text("pagarme_subscription_id"),
    pagarmeCustomerId: text("pagarme_customer_id"),
    trialStart: timestamp("trial_start", { withTimezone: true }),
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    trialUsed: boolean("trial_used").default(false).notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    seats: integer("seats").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("subscriptions_organization_id_idx").on(table.organizationId),
    index("subscriptions_status_idx").on(table.status),
    index("subscriptions_pagarme_subscription_id_idx").on(table.pagarmeSubscriptionId),
  ]
);

export const subscriptionEvents = pgTable(
  "subscription_events",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").references(() => subscriptions.id),
    eventType: text("event_type").notNull(),
    pagarmeEventId: text("pagarme_event_id").unique(),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("subscription_events_subscription_id_idx").on(table.subscriptionId),
    index("subscription_events_pagarme_event_id_idx").on(table.pagarmeEventId),
    index("subscription_events_event_type_idx").on(table.eventType),
  ]
);

// ============================================================
// RELATIONS
// ============================================================

export const subscriptionRelations = relations(subscriptions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [subscriptions.planId],
    references: [subscriptionPlans.id],
  }),
  events: many(subscriptionEvents),
}));

export const subscriptionEventRelations = relations(subscriptionEvents, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscriptionEvents.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const subscriptionPlanRelations = relations(subscriptionPlans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

// ============================================================
// TYPES
// ============================================================

export interface PlanLimits {
  maxMembers: number;
  maxProjects: number;
  maxStorage: number; // MB
  features: string[];
}

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
```

---

## Env Variables

Adicionar variáveis de ambiente para Pagarme.

```typescript
// src/env.ts
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),

  // Pagarme
  PAGARME_SECRET_KEY: z.string().min(1),
  PAGARME_PUBLIC_KEY: z.string().min(1),
  PAGARME_WEBHOOK_SECRET: z.string().min(1),

  // App URLs
  API_URL: z.string().url().default("http://localhost:3000"),
  APP_URL: z.string().url().default("http://localhost:3001"),

  // CORS
  CORS_ORIGIN: z.string().url().default("http://localhost:3001"),
});

export const env = envSchema.parse(process.env);
```

---

## Checklist de Implementação

Use este checklist para garantir consistência ao implementar cada feature:

### Para cada Controller

- [ ] Usar `new Elysia({ name, prefix, detail: { tags } })`
- [ ] Validar body/query/params com schemas Zod
- [ ] Definir response schema para documentação
- [ ] Delegar lógica para Service
- [ ] Usar `detail.summary` para descrição no Swagger

### Para cada Service

- [ ] Usar `abstract class` com `static` methods
- [ ] Não importar Elysia
- [ ] Usar tipos do Model (`z.infer<>`)
- [ ] Throw custom errors (não strings)
- [ ] Documentar side effects (hooks, emails, etc.)

### Para cada Model

- [ ] Definir schemas de input separados de output
- [ ] Exportar tipos inferidos (`z.infer<>`)
- [ ] Usar naming consistente (`{action}{Entity}Schema`)
- [ ] Adicionar validações específicas (email, url, etc.)

### Para cada Error

- [ ] Estender `PaymentError`
- [ ] Definir `status` code
- [ ] Definir `code` único
- [ ] Implementar `toResponse()`
- [ ] Registrar no controller principal

---

## Referências

- [Elysia Best Practices](https://elysiajs.com/essential/best-practice)
- [Elysia Validation](https://elysiajs.com/essential/validation)
- [Zod Documentation](https://zod.dev)
- [Drizzle ORM](https://orm.drizzle.team)
- [Pagarme API](https://docs.pagar.me)
