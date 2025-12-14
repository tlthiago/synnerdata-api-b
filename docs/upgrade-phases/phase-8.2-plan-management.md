# Fase 8.2: Gerenciamento de Planos

> **Prioridade:** Alta
> **Complexidade:** Alta
> **Status:** 🟡 Parcial (8.2.1 Completo)

## Objetivo

Implementar funcionalidades avançadas de gerenciamento de planos: billing anual e mudança de plano (upgrade/downgrade) com cálculo de proration.

## Pré-requisitos

- Fases 1-7 completas
- Portal de Billing (8.1) recomendado

---

## 8.2.1 Billing Anual

Permitir que clientes escolham entre cobrança mensal ou anual, com desconto para pagamento anual.

> **Impacto:** Aumenta LTV e reduz churn

### Modelo de Dados

A tabela `subscription_plans` já possui campos para preço anual:

```typescript
// Em src/db/schema/payments.ts (já existe)
priceMonthly: integer("price_monthly").notNull(), // R$ 99,00 = 9900
priceYearly: integer("price_yearly").notNull(),   // R$ 948,00 = 94800 (20% off)
```

### Estratégia no Pagarme

O Pagarme cobra por **ciclo de billing** (interval). Para suportar mensal e anual:

#### Opção 1: Planos Duplicados (Recomendado)

Criar dois planos no Pagarme para cada plano local:

```typescript
// Plano local
{
  id: "plan-123",
  name: "pro",
  priceMonthly: 9900,
  priceYearly: 94800,
  pagarmePlanIdMonthly: "plan_abc123",  // interval: month
  pagarmePlanIdYearly: "plan_xyz789",   // interval: year
}
```

#### Opção 2: Plano Único com Ciclos Diferentes

Criar subscription com `interval: "year"` manualmente (sem usar plano pré-definido).

---

### Alteração no Schema

> **Abordagem:** Reconstruir tabelas sem compatibilidade retroativa.

**Arquivo:** `src/db/schema/payments.ts`

```typescript
// subscriptionPlans - REMOVER pagarmePlanId e ADICIONAR:
export const subscriptionPlans = pgTable("subscription_plans", {
  // ... campos existentes ...
  // pagarmePlanId: REMOVER
  pagarmePlanIdMonthly: text("pagarme_plan_id_monthly"),
  pagarmePlanIdYearly: text("pagarme_plan_id_yearly"),
});

// orgSubscriptions - adicionar billingCycle
export const orgSubscriptions = pgTable("org_subscriptions", {
  // ... campos existentes ...
  billingCycle: text("billing_cycle").default("monthly"), // "monthly" | "yearly"
});

// pendingCheckouts - adicionar billingCycle
export const pendingCheckouts = pgTable("pending_checkouts", {
  // ... campos existentes ...
  billingCycle: text("billing_cycle").default("monthly"), // "monthly" | "yearly"
});
```

**Executar:** `bun run db:generate && bun run db:migrate`

---

### Erros de Domínio

**Arquivo:** `src/modules/payments/errors.ts`

> **Nota:** `PlanNotAvailableError` já existe no código.

```typescript
// Adicionar novos erros específicos
export class BillingCycleAlreadyActiveError extends PaymentError {
  status = 400;
  constructor(cycle: string) {
    super(`Already on ${cycle} billing cycle`, "BILLING_CYCLE_ALREADY_ACTIVE", { cycle });
  }
}

export class PlanChangeNotAllowedError extends PaymentError {
  status = 400;
  constructor(reason: string) {
    super(`Plan change not allowed: ${reason}`, "PLAN_CHANGE_NOT_ALLOWED", { reason });
  }
}
```

---

### Sync de Planos para Pagarme

**Arquivo:** `src/modules/payments/plan/plan.model.ts`

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// Schema de dados da resposta de sync
const syncPlanDataSchema = z.object({
  id: z.string().describe("Plan ID"),
  pagarmePlanIdMonthly: z.string().nullable().describe("Pagarme monthly plan ID"),
  pagarmePlanIdYearly: z.string().nullable().describe("Pagarme yearly plan ID"),
});

export const syncPlanResponseSchema = successResponseSchema(syncPlanDataSchema);

export type SyncPlanData = z.infer<typeof syncPlanDataSchema>;
export type SyncPlanResponse = z.infer<typeof syncPlanResponseSchema>;
```

**Arquivo:** `src/modules/payments/plan/plan.service.ts`

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { PlanNotFoundError } from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type { SyncPlanResponse } from "./plan.model";

export abstract class PlanService {
  static async syncToPagarme(planId: string): Promise<SyncPlanResponse> {
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new PlanNotFoundError(planId);
    }

    let pagarmePlanIdMonthly = plan.pagarmePlanIdMonthly;
    let pagarmePlanIdYearly = plan.pagarmePlanIdYearly;

    // Criar plano mensal se não existir
    if (!pagarmePlanIdMonthly) {
      const monthlyPlan = await PagarmeClient.createPlan(
        {
          name: `${plan.name}-monthly`,
          description: plan.displayName,
          currency: "BRL",
          interval: "month",
          interval_count: 1,
          billing_type: "prepaid",
          payment_methods: ["credit_card"],
          items: [
            {
              name: plan.displayName,
              quantity: 1,
              pricing_scheme: {
                price: plan.priceMonthly,
                scheme_type: "unit",
              },
            },
          ],
          metadata: { local_plan_id: plan.id, billing_cycle: "monthly" },
        },
        `create-plan-monthly-${plan.id}`
      );
      pagarmePlanIdMonthly = monthlyPlan.id;
    }

    // Criar plano anual se não existir
    if (!pagarmePlanIdYearly && plan.priceYearly > 0) {
      const yearlyPlan = await PagarmeClient.createPlan(
        {
          name: `${plan.name}-yearly`,
          description: `${plan.displayName} (Anual)`,
          currency: "BRL",
          interval: "year",
          interval_count: 1,
          billing_type: "prepaid",
          payment_methods: ["credit_card"],
          items: [
            {
              name: `${plan.displayName} (Anual)`,
              quantity: 1,
              pricing_scheme: {
                price: plan.priceYearly,
                scheme_type: "unit",
              },
            },
          ],
          metadata: { local_plan_id: plan.id, billing_cycle: "yearly" },
        },
        `create-plan-yearly-${plan.id}`
      );
      pagarmePlanIdYearly = yearlyPlan.id;
    }

    // Atualizar banco local
    await db
      .update(schema.subscriptionPlans)
      .set({ pagarmePlanIdMonthly, pagarmePlanIdYearly })
      .where(eq(schema.subscriptionPlans.id, planId));

    return {
      success: true as const,
      data: {
        id: plan.id,
        pagarmePlanIdMonthly,
        pagarmePlanIdYearly,
      },
    };
  }
}
```

---

### Checkout com Billing Cycle

**Arquivo:** `src/modules/payments/checkout/checkout.model.ts`

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// Schema de entrada
export const createCheckoutSchema = z.object({
  planId: z.string().min(1).describe("ID of the plan to checkout"),
  successUrl: z.string().url().describe("URL to redirect after successful payment"),
  billingCycle: z
    .enum(["monthly", "yearly"])
    .default("monthly")
    .describe("Billing cycle: monthly or yearly"),
});

// Schema de dados da resposta
const checkoutDataSchema = z.object({
  checkoutUrl: z.string().url().describe("URL to redirect user for payment"),
  paymentLinkId: z.string().describe("Pagarme payment link ID"),
});

export const createCheckoutResponseSchema = successResponseSchema(checkoutDataSchema);

// Tipos inferidos dos schemas
export type CreateCheckout = z.infer<typeof createCheckoutSchema>;
export type CreateCheckoutInput = CreateCheckout & {
  userId: string;
  organizationId: string;
};
export type CreateCheckoutResponse = z.infer<typeof createCheckoutResponseSchema>;
```

**Arquivo:** `src/modules/payments/checkout/checkout.service.ts`

```typescript
import { db } from "@/db";
import { schema } from "@/db/schema";
import { PlanNotAvailableError } from "../errors";
import { PlanService } from "../plan/plan.service";
import type { CreateCheckoutInput, CreateCheckoutResponse } from "./checkout.model";

export abstract class CheckoutService {
  static async create(input: CreateCheckoutInput): Promise<CreateCheckoutResponse> {
    const { organizationId, planId, successUrl, userId, billingCycle = "monthly" } = input;

    // ... validações existentes ...

    // Obter plano com IDs do Pagarme
    const plan = await PlanService.ensureSynced(planId);

    const pagarmePlanId = billingCycle === "yearly"
      ? plan.pagarmePlanIdYearly
      : plan.pagarmePlanIdMonthly;

    if (!pagarmePlanId) {
      throw new PlanNotAvailableError(planId);
    }

    // ... resto da implementação usando pagarmePlanId ...

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Salvar billing cycle no pending checkout
    await db.insert(schema.pendingCheckouts).values({
      id: `checkout-${Bun.randomUUIDv7()}`,
      organizationId,
      planId,
      billingCycle,
      paymentLinkId: paymentLink.id,
      status: "pending",
      expiresAt,
    });

    return {
      success: true as const,
      data: {
        checkoutUrl: paymentLink.url,
        paymentLinkId: paymentLink.id,
      },
    };
  }
}
```

---

### Exibição de Preços no Frontend

**Endpoint:** `GET /v1/payments/plans`

```typescript
// Resposta já inclui priceMonthly e priceYearly
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "plan-123",
        "name": "pro",
        "displayName": "Profissional",
        "priceMonthly": 9900,
        "priceYearly": 94800,
        "savingsYearly": 23400,
        "monthlyEquivalent": 7900,
        "savingsPercent": 20
      }
    ]
  }
}
```

**Arquivo:** `src/modules/payments/plan/plan.model.ts`

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// Schema de dados do plano na listagem
const planListItemSchema = z.object({
  id: z.string().describe("Plan ID"),
  name: z.string().describe("Plan internal name"),
  displayName: z.string().describe("Plan display name"),
  priceMonthly: z.number().describe("Monthly price in cents"),
  priceYearly: z.number().describe("Yearly price in cents"),
  monthlyEquivalent: z.number().describe("Monthly equivalent when paying yearly"),
  savingsYearly: z.number().describe("Yearly savings in cents"),
  savingsPercent: z.number().describe("Yearly savings percentage"),
  trialDays: z.number().describe("Trial period in days"),
  limits: z.record(z.unknown()).describe("Plan limits"),
  isActive: z.boolean().describe("Whether plan is active"),
  isPublic: z.boolean().describe("Whether plan is publicly visible"),
  sortOrder: z.number().describe("Display order"),
});

const listPlansDataSchema = z.object({
  plans: z.array(planListItemSchema).describe("List of available plans"),
});

export const listPlansResponseSchema = successResponseSchema(listPlansDataSchema);

export type ListPlansResponse = z.infer<typeof listPlansResponseSchema>;
```

**Arquivo:** `src/modules/payments/plan/plan.service.ts`

```typescript
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { ListPlansResponse } from "./plan.model";

export abstract class PlanService {
  static async list(): Promise<ListPlansResponse> {
    const plans = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(
        and(
          eq(schema.subscriptionPlans.isActive, true),
          eq(schema.subscriptionPlans.isPublic, true)
        )
      )
      .orderBy(schema.subscriptionPlans.sortOrder);

    return {
      success: true as const,
      data: {
        plans: plans.map((plan) => {
          const monthlyEquivalent = plan.priceYearly > 0
            ? Math.round(plan.priceYearly / 12)
            : plan.priceMonthly;
          const savingsYearly = (plan.priceMonthly * 12) - plan.priceYearly;

          return {
            id: plan.id,
            name: plan.name,
            displayName: plan.displayName,
            priceMonthly: plan.priceMonthly,
            priceYearly: plan.priceYearly,
            monthlyEquivalent,
            savingsYearly: savingsYearly > 0 ? savingsYearly : 0,
            savingsPercent: savingsYearly > 0
              ? Math.round((savingsYearly / (plan.priceMonthly * 12)) * 100)
              : 0,
            trialDays: plan.trialDays,
            limits: plan.limits,
            isActive: plan.isActive,
            isPublic: plan.isPublic,
            sortOrder: plan.sortOrder,
          };
        }),
      },
    };
  }
}
```

---

### Mudança de Ciclo (Mensal ↔ Anual)

**Endpoint:** `POST /v1/payments/subscription/change-cycle`

**Arquivo:** `src/modules/payments/subscription/subscription.model.ts`

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// Schema de entrada
export const changeCycleSchema = z.object({
  billingCycle: z.enum(["monthly", "yearly"]).describe("New billing cycle"),
});

// Schema de dados da resposta
const changeCycleDataSchema = z.object({
  changed: z.boolean().describe("Whether the cycle was changed"),
  reason: z.string().optional().describe("Reason if not changed"),
  effectiveAt: z.string().nullable().optional().describe("When change takes effect"),
  newCycle: z.enum(["monthly", "yearly"]).optional().describe("New billing cycle"),
});

export const changeCycleResponseSchema = successResponseSchema(changeCycleDataSchema);

// Tipos inferidos
export type ChangeCycle = z.infer<typeof changeCycleSchema>;
export type ChangeCycleInput = ChangeCycle & {
  userId: string;
  organizationId: string;
};
export type ChangeCycleResponse = z.infer<typeof changeCycleResponseSchema>;
```

**Arquivo:** `src/modules/payments/subscription/index.ts`

```typescript
import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { changeCycleSchema, changeCycleResponseSchema } from "./subscription.model";
import { SubscriptionService } from "./subscription.service";

export const subscriptionController = new Elysia({
  name: "subscription",
  prefix: "/subscription",
  detail: { tags: ["Payments - Subscription"] },
})
  .use(betterAuthPlugin)
  .post(
    "/change-cycle",
    ({ user, session, body }) =>
      SubscriptionService.changeBillingCycle({
        userId: user.id,
        organizationId: session.activeOrganizationId as string,
        billingCycle: body.billingCycle,
      }),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      body: changeCycleSchema,
      response: {
        200: changeCycleResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Change billing cycle",
        description: "Schedule a billing cycle change (monthly to yearly or vice versa).",
      },
    }
  );
```

**Arquivo:** `src/modules/payments/subscription/subscription.service.ts`

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { SubscriptionNotFoundError } from "../errors";
import type { ChangeCycleInput, ChangeCycleResponse } from "./subscription.model";

export abstract class SubscriptionService {
  static async changeBillingCycle(input: ChangeCycleInput): Promise<ChangeCycleResponse> {
    const { organizationId, billingCycle } = input;

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!subscription) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    if (subscription.billingCycle === billingCycle) {
      return {
        success: true as const,
        data: { changed: false, reason: "already_on_cycle" },
      };
    }

    // Estratégia: Agendar mudança para próximo ciclo
    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingBillingCycle: billingCycle,
        billingCycleChangeAt: subscription.currentPeriodEnd,
      })
      .where(eq(schema.orgSubscriptions.id, subscription.id));

    return {
      success: true as const,
      data: {
        changed: true,
        effectiveAt: subscription.currentPeriodEnd?.toISOString() ?? null,
        newCycle: billingCycle,
      },
    };
  }
}
```

---

## 8.2.2 Mudança de Plano (Upgrade/Downgrade)

Permitir que clientes troquem de plano mantendo a subscription ativa.

> **Impacto:** Essencial para upsell

### Estratégias de Mudança

| Tipo | Comportamento | Cobrança |
|------|---------------|----------|
| **Upgrade** | Imediato | Cobra diferença proporcional |
| **Downgrade** | No próximo ciclo | Sem reembolso |
| **Mesmo valor** | Imediato | Sem cobrança adicional |

### Model

**Arquivo:** `src/modules/payments/subscription/subscription.model.ts`

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// Schema de entrada
export const changePlanSchema = z.object({
  newPlanId: z.string().min(1).describe("ID of the new plan"),
  billingCycle: z
    .enum(["monthly", "yearly"])
    .optional()
    .describe("Billing cycle for new plan (optional, keeps current)"),
});

// Schema de dados da resposta
const changePlanDataSchema = z.object({
  type: z.enum(["upgrade", "downgrade", "same"]).describe("Type of plan change"),
  immediate: z.boolean().describe("Whether change is immediate"),
  effectiveAt: z.string().nullable().optional().describe("When change takes effect"),
  prorationAmount: z.number().optional().describe("Amount charged for proration"),
  currentPlan: z.string().describe("Current plan name"),
  newPlan: z.string().describe("New plan name"),
});

export const changePlanResponseSchema = successResponseSchema(changePlanDataSchema);

// Tipos inferidos
export type ChangePlan = z.infer<typeof changePlanSchema>;
export type ChangePlanInput = ChangePlan & {
  userId: string;
  organizationId: string;
};
export type ChangePlanResponse = z.infer<typeof changePlanResponseSchema>;
```

### Controller

**Arquivo:** `src/modules/payments/subscription/index.ts`

```typescript
import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { changePlanSchema, changePlanResponseSchema } from "./subscription.model";
import { SubscriptionService } from "./subscription.service";

export const subscriptionController = new Elysia({
  name: "subscription",
  prefix: "/subscription",
  detail: { tags: ["Payments - Subscription"] },
})
  .use(betterAuthPlugin)
  .post(
    "/change-plan",
    ({ user, session, body }) =>
      SubscriptionService.changePlan({
        userId: user.id,
        organizationId: session.activeOrganizationId as string,
        newPlanId: body.newPlanId,
        billingCycle: body.billingCycle,
      }),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      body: changePlanSchema,
      response: {
        200: changePlanResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Change subscription plan",
        description: "Upgrade or downgrade subscription plan with proration calculation.",
      },
    }
  );
```

### Service

**Arquivo:** `src/modules/payments/subscription/subscription.service.ts`

> **Nota:** A implementação abaixo considera as limitações da API v5 do Pagarme, que não possui endpoint direto para mudança de plano. Utilizamos a estratégia híbrida de cancelar e recriar subscriptions.

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { SubscriptionNotFoundError, PlanChangeNotAllowedError } from "../errors";
import { PlanService } from "../plan/plan.service";
import { PagarmeClient } from "../pagarme/client";
import type { ChangePlanInput, ChangePlanResponse } from "./subscription.model";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export abstract class SubscriptionService {
  /**
   * Calcula o valor de proration para upgrade de plano.
   * Como a API v5 do Pagarme não suporta proration nativo, calculamos manualmente.
   */
  private static calculateProration(params: {
    currentPrice: number;
    newPrice: number;
    periodStart: Date;
    periodEnd: Date;
    now: Date;
  }): { creditAmount: number; debitAmount: number; prorationAmount: number } {
    const { currentPrice, newPrice, periodStart, periodEnd, now } = params;

    const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY);
    const remainingDays = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / MS_PER_DAY));

    const dailyRateCurrent = currentPrice / totalDays;
    const creditAmount = Math.round(dailyRateCurrent * remainingDays);

    const dailyRateNew = newPrice / totalDays;
    const debitAmount = Math.round(dailyRateNew * remainingDays);

    const prorationAmount = Math.max(0, debitAmount - creditAmount);

    return { creditAmount, debitAmount, prorationAmount };
  }

  static async changePlan(input: ChangePlanInput): Promise<ChangePlanResponse> {
    const { organizationId, newPlanId, billingCycle } = input;

    // 1. Buscar subscription atual com dados do Pagarme
    const [current] = await db
      .select({
        subscription: schema.orgSubscriptions,
        plan: schema.subscriptionPlans,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    if (!current) {
      throw new SubscriptionNotFoundError(organizationId);
    }

    if (!["active", "trial"].includes(current.subscription.status)) {
      throw new PlanChangeNotAllowedError(`invalid status: ${current.subscription.status}`);
    }

    // 2. Buscar novo plano (já sincronizado com Pagarme)
    const newPlan = await PlanService.ensureSynced(newPlanId);

    const currentCycle = current.subscription.billingCycle ?? "monthly";
    const targetCycle = billingCycle ?? currentCycle;

    const currentPrice = currentCycle === "yearly"
      ? current.plan.priceYearly
      : current.plan.priceMonthly;

    const newPrice = targetCycle === "yearly"
      ? newPlan.priceYearly
      : newPlan.priceMonthly;

    // 3. Determinar tipo de mudança
    const isUpgrade = newPrice > currentPrice;
    const isDowngrade = newPrice < currentPrice;

    // ==========================================
    // DOWNGRADE: Agendar para próximo ciclo
    // ==========================================
    if (isDowngrade) {
      await db
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: newPlanId,
          pendingBillingCycle: targetCycle,
          planChangeAt: current.subscription.currentPeriodEnd,
        })
        .where(eq(schema.orgSubscriptions.id, current.subscription.id));

      return {
        success: true as const,
        data: {
          type: "downgrade",
          immediate: false,
          effectiveAt: current.subscription.currentPeriodEnd?.toISOString() ?? null,
          currentPlan: current.plan.displayName,
          newPlan: newPlan.displayName,
        },
      };
    }

    // ==========================================
    // UPGRADE: Processar imediatamente
    // ==========================================
    const now = new Date();
    const periodEnd = current.subscription.currentPeriodEnd ?? now;
    const periodStart = current.subscription.currentPeriodStart ?? now;

    // 4. Calcular proration (manual, pois API v5 não suporta)
    const { prorationAmount } = SubscriptionService.calculateProration({
      currentPrice,
      newPrice,
      periodStart,
      periodEnd,
      now,
    });

    // 5. Cobrar diferença via Order (se houver)
    if (prorationAmount > 0 && current.subscription.pagarmeCustomerId) {
      await PagarmeClient.createOrder(
        {
          customer_id: current.subscription.pagarmeCustomerId,
          items: [
            {
              amount: prorationAmount,
              description: `Upgrade: ${current.plan.displayName} → ${newPlan.displayName}`,
              quantity: 1,
            },
          ],
          payments: [
            {
              payment_method: "checkout",
              checkout: {
                accepted_payment_methods: ["credit_card", "pix"],
                success_url: `${process.env.APP_URL}/billing?upgrade=success`,
                expires_in: 60,
              },
            },
          ],
          metadata: {
            type: "upgrade_proration",
            organization_id: organizationId,
            from_plan: current.plan.id,
            to_plan: newPlanId,
          },
        },
        `upgrade-${organizationId}-${Date.now()}`
      );
    }

    // 6. Cancelar subscription atual no Pagarme
    if (current.subscription.pagarmeSubscriptionId) {
      await PagarmeClient.cancelSubscription(
        current.subscription.pagarmeSubscriptionId,
        true // cancel pending invoices
      );
    }

    // 7. Criar nova subscription no Pagarme com novo plano
    // Nota: A criação da nova subscription será feita via checkout/payment link
    // ou diretamente se tivermos o card_id salvo

    // 8. Atualizar banco local
    await db
      .update(schema.orgSubscriptions)
      .set({
        planId: newPlanId,
        billingCycle: targetCycle,
        // pagarmeSubscriptionId será atualizado pelo webhook da nova subscription
        pendingPlanId: null,
        pendingBillingCycle: null,
        planChangeAt: null,
      })
      .where(eq(schema.orgSubscriptions.id, current.subscription.id));

    return {
      success: true as const,
      data: {
        type: isUpgrade ? "upgrade" : "same",
        immediate: true,
        prorationAmount,
        currentPlan: current.plan.displayName,
        newPlan: newPlan.displayName,
      },
    };
  }
}
```

> **⚠️ Considerações de Implementação:**
>
> 1. **Cobrança de Proration**: O código acima cria um Order com checkout. Alternativamente, se tivermos o `card_id` do cliente, podemos cobrar diretamente.
> 2. **Nova Subscription**: Após cancelar a atual, precisamos criar uma nova. Isso pode ser feito via Payment Link ou diretamente via API se tivermos os dados do cartão.
> 3. **Atomicidade**: Considerar usar transações e rollback em caso de falha.
> 4. **Webhook**: O `pagarmeSubscriptionId` será atualizado quando recebermos o webhook `subscription.created` da nova subscription.

---

### Fluxo Visual

```text
                       MUDANÇA DE PLANO (API v5)
                              │
               ┌──────────────┼──────────────┐
               │              │              │
           UPGRADE        SAME PRICE     DOWNGRADE
               │              │              │
               ▼              ▼              ▼
        Calcula proration   Muda         Agenda para
        (manual)          imediato      próximo ciclo
               │              │              │
               ▼              │              │
        Cobra via Order       │              │
        (checkout)            │              │
               │              │              │
               ▼              │              │
        Cancela subscription  │              │
        atual no Pagarme      │              │
               │              │              │
               ▼              │              │
        Redireciona para      │              │
        Payment Link          │              │
        (nova subscription)   │              │
               │              │              │
               └──────────────┼──────────────┘
                              │
                              ▼
                       Atualiza banco local
                              │
                              ▼
                  Webhook subscription.created
                  atualiza pagarmeSubscriptionId
```

> **Nota:** Na API v5 do Pagarme, upgrades requerem cancelar a subscription atual e criar uma nova, pois não há endpoint para alterar o `plan_id` diretamente.

---

### Considerações com Pagarme

> **⚠️ IMPORTANTE:** A API v5 do Pagarme (utilizada neste projeto) possui limitações significativas para mudança de plano.

#### Limitações da API v5

| Funcionalidade | API v1/v2 | API v5 (atual) | Status |
|---------------|-----------|----------------|--------|
| Mudança de Plano | ✅ `PUT /subscriptions/{id}` com `plan_id` | ❌ Não tem endpoint direto | Requer workaround |
| Mudança de Ciclo | ⚠️ Via mudança de plano | ⚠️ Via mudança de plano | Requer workaround |
| Pro Rata automático | ✅ Nativo | ❌ Não disponível | Manual |
| Cobrança avulsa | ✅ Orders | ✅ Orders | Suportado |

#### Endpoints Disponíveis na API v5

O `PagarmeClient` atual usa `/core/v5`. Os endpoints de update disponíveis são:

- `PATCH /subscriptions/{id}/card` - Atualizar cartão ✅ (já implementado)
- `PATCH /subscriptions/{id}/payment-method` - Método de pagamento
- `PUT /subscriptions/{id}/items/{item_id}` - Atualizar item (preço/quantidade)
- `PATCH /subscriptions/{id}/billing-date` - Data de cobrança

**Não existe:** `PUT /subscriptions/{id}` com `plan_id` na v5.

#### Estratégias de Implementação

**Opção 1: Atualização de Itens** (para ajuste de preço sem mudar plano)
```typescript
// PUT /subscriptions/{sub_id}/items/{item_id}
{
  "pricing_scheme": {
    "price": 19900,
    "scheme_type": "unit"
  }
}
```
- **Prós**: Mantém subscription ativa, histórico preservado
- **Contras**: Não muda o `plan_id`, precisa controlar localmente

**Opção 2: Cancelar e Recriar** (Recomendada para mudança de plano)
1. Calcular proration manualmente
2. Cancelar subscription atual
3. Criar nova subscription com novo plano
4. Cobrar diferença via Order (se upgrade)

- **Prós**: Mudança real de plano no Pagarme
- **Contras**: Perde histórico de subscription, mais complexo

**Opção 3: Híbrida** (Adotada neste projeto)

Para **mudança de ciclo** (mensal ↔ anual):
- Agendar no banco local (`pendingBillingCycle`)
- No fim do ciclo atual, cancelar e criar nova subscription com plano do ciclo correto

Para **upgrade**:
- Calcular proration manualmente
- Cobrar diferença via `PagarmeClient.createOrder()`
- Cancelar subscription atual
- Criar nova subscription com novo plano

Para **downgrade**:
- Agendar para próximo ciclo (`pendingPlanId`)
- No vencimento, cancelar e criar nova subscription

#### Cálculo de Proration Manual

```typescript
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function calculateProration(params: {
  currentPrice: number;
  newPrice: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): { creditAmount: number; debitAmount: number; prorationAmount: number } {
  const { currentPrice, newPrice, periodStart, periodEnd, now } = params;

  const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY);
  const remainingDays = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / MS_PER_DAY));

  // Crédito do plano atual (proporcional aos dias restantes)
  const dailyRateCurrent = currentPrice / totalDays;
  const creditAmount = Math.round(dailyRateCurrent * remainingDays);

  // Custo do novo plano (proporcional aos dias restantes)
  const dailyRateNew = newPrice / totalDays;
  const debitAmount = Math.round(dailyRateNew * remainingDays);

  // Diferença a cobrar (apenas se positivo)
  const prorationAmount = Math.max(0, debitAmount - creditAmount);

  return { creditAmount, debitAmount, prorationAmount };
}
```

#### Referências da API Pagarme

- [Upgrade e Downgrade de Assinatura](https://pagarme.helpjuice.com/pt_BR/p1-funcionalidades/assinatura-%C3%A9-poss%C3%ADvel-fazer-upgrade-e-downgrade-de-assinatura)
- [Fluxos de Cobrança](https://docs.pagar.me/v2/docs/fluxos-de-cobran%C3%A7a)
- [Editar Item de Assinatura](https://docs.pagar.me/reference/editar-item)
- [Pagarme .NET SDK - Subscriptions](https://github.com/pagarme/pagarme-net-standard-sdk/blob/main/doc/controllers/subscriptions.md)

---

### Componentes Frontend

```text
components/billing/
├── BillingCycleToggle.tsx     # Switch mensal/anual com animação de preço
├── PricingCard.tsx            # Card de plano com preços mensal e anual
├── SavingsBadge.tsx           # Badge "Economize 20%"
├── CycleChangeConfirm.tsx     # Modal de confirmação de mudança de ciclo
├── PlanComparison.tsx         # Comparação lado a lado dos planos
└── UpgradeModal.tsx           # Modal de upgrade com proration
```

---

### Fluxo de Mudança de Ciclo

```text
Usuário em Plano Pro Mensal quer mudar para Anual:

1. Clica em "Mudar para anual"
       │
       ▼
2. Modal explica:
   - "Sua assinatura mensal continua até DD/MM/YYYY"
   - "Na próxima renovação, será cobrado R$ 948,00 (anual)"
   - "Economia de R$ 234,00 por ano"
       │
       ▼
3. Confirma mudança
       │
       ▼
4. Backend marca pendingBillingCycle = "yearly"
       │
       ▼
5. No vencimento, job processa mudança:
   - Cancela subscription mensal no Pagarme
   - Cria Payment Link com plano anual
   - Usuário completa pagamento
   - Webhook subscription.created atualiza banco
```

> **⚠️ API v5:** Como não há endpoint para alterar o interval/plan diretamente, a mudança de ciclo requer cancelar e recriar a subscription.

---

## Arquivos a Criar/Modificar

### 8.2.1 Billing Anual (Completo)

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/db/schema/payments.ts` | ✅ Modificado | `pagarmePlanIdMonthly`, `pagarmePlanIdYearly`, `billingCycle` |
| `src/modules/payments/errors.ts` | ✅ Modificado | `YearlyBillingNotAvailableError` |
| `src/modules/payments/checkout/checkout.model.ts` | ✅ Modificado | `billingCycle` no schema |
| `src/modules/payments/checkout/checkout.service.ts` | ✅ Modificado | Usar plano correto baseado no ciclo |
| `src/modules/payments/plan/plan.service.ts` | ✅ Modificado | Sync cria ambos planos, list retorna savings |
| `src/modules/payments/webhook/webhook.service.ts` | ✅ Modificado | Salva `billingCycle` na subscription |
| `src/modules/payments/subscription/subscription.service.ts` | ✅ Modificado | Retorna `billingCycle` |

### 8.2.2 Mudança de Plano (Pendente)

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/db/schema/payments.ts` | Modificar | Adicionar `pagarmeCustomerId`, `pendingPlanId`, `planChangeAt` em `orgSubscriptions` |
| `src/modules/payments/errors.ts` | Modificar | Adicionar `PlanChangeNotAllowedError`, `UpgradePaymentRequiredError` |
| `src/modules/payments/subscription/subscription.model.ts` | Modificar | Schemas para `change-cycle` e `change-plan` |
| `src/modules/payments/subscription/subscription.service.ts` | Modificar | `changeBillingCycle()`, `changePlan()`, `calculateProration()` |
| `src/modules/payments/subscription/index.ts` | Modificar | Endpoints `POST /change-cycle`, `POST /change-plan` |
| `src/modules/payments/pagarme/client.ts` | Verificar | Confirmar suporte a cobrança direta com `card_id` |
| `src/modules/payments/webhook/webhook.service.ts` | Modificar | Handler para atualizar `pagarmeSubscriptionId` após upgrade |
| `src/modules/payments/jobs/plan-change.job.ts` | Criar | Job para processar downgrades agendados |

---

## Checklist de Implementação

### Billing Anual (8.2.1) ✅ COMPLETO

- [x] REMOVER `pagarmePlanId` e ADICIONAR `pagarmePlanIdMonthly`, `pagarmePlanIdYearly` no schema
- [x] Adicionar `billingCycle` em `orgSubscriptions` e `pendingCheckouts`
- [x] Adicionar erro `YearlyBillingNotAvailableError`
- [x] Atualizar `syncToPagarme()` para criar versão mensal e anual
- [x] Atualizar `ensureSynced()` para retornar ambos IDs
- [x] Atualizar `list()` para retornar campos de savings
- [x] Atualizar checkout para aceitar e salvar `billingCycle`
- [x] Atualizar webhook para salvar `billingCycle` na subscription
- [x] Atualizar `getByOrganizationId()` para retornar `billingCycle`

### Mudança de Plano (8.2.2) ⏳ Pendente

> **⚠️ Nota:** A API v5 do Pagarme não suporta mudança de plano diretamente. A implementação requer cancelar e recriar subscriptions.

#### Endpoints

- [ ] Endpoint `POST /subscription/change-cycle` - Agendar mudança de ciclo (mensal ↔ anual)
- [ ] Endpoint `POST /subscription/change-plan` - Upgrade/downgrade de plano

#### Lógica de Negócio

- [ ] Implementar `calculateProration()` para cálculo manual de proration
- [ ] Criar Order para cobrança de diferença em upgrades
- [ ] Cancelar subscription atual no Pagarme (`PagarmeClient.cancelSubscription()`)
- [ ] Criar Payment Link para nova subscription com novo plano
- [ ] Agendar downgrade para próximo ciclo (campos `pendingPlanId`, `planChangeAt`)

#### Schema do Banco

- [ ] Adicionar campo `pagarmeCustomerId` em `orgSubscriptions` (se não existir)
- [ ] Adicionar campo `pendingPlanId` em `orgSubscriptions`
- [ ] Adicionar campo `planChangeAt` em `orgSubscriptions`

#### Jobs/Webhooks

- [ ] Job para processar mudanças agendadas (downgrades no vencimento)
- [ ] Handler de webhook para `subscription.created` atualizar `pagarmeSubscriptionId` após upgrade
- [ ] Handler de webhook para `charge.paid` confirmar pagamento de proration

#### Métodos no PagarmeClient

- [ ] Verificar se `createOrder()` suporta cobrança direta com `card_id` (alternativa ao checkout)

### Testes (E2E e Integração) ✅ COMPLETO

- [x] Sync de plano cria versões mensal e anual no Pagarme
- [x] Listagem de planos retorna campos de savings
- [x] Checkout com `billingCycle: "monthly"` usa plano mensal
- [x] Checkout com `billingCycle: "yearly"` usa plano anual (validação implementada)
- [x] Checkout rejeita se plano anual não existe (`priceYearly = 0`) - via `YearlyBillingNotAvailableError`
- [x] Webhook `subscription.created` salva `billingCycle` na subscription
- [x] GET subscription retorna `billingCycle` correto

---

> **Dependências:** Portal de Billing (8.1) para UI
> **Impacto:** Aumenta receita via upsell e billing anual

---

## Notas de Implementação (8.2.1)

**Data:** Dezembro 2024

### Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/db/schema/payments.ts` | Substituído `pagarmePlanId` por `pagarmePlanIdMonthly` e `pagarmePlanIdYearly`; Adicionado `billingCycle` em `orgSubscriptions` e `pendingCheckouts` |
| `src/modules/payments/errors.ts` | Adicionado `YearlyBillingNotAvailableError` |
| `src/modules/payments/plan/plan.model.ts` | Atualizado `syncPlanDataSchema` e `planListItemSchema` com campos de savings |
| `src/modules/payments/plan/plan.service.ts` | `syncToPagarme()` cria planos mensal e anual; `list()` retorna campos de savings; `ensureSynced()` retorna ambos IDs |
| `src/modules/payments/checkout/checkout.model.ts` | Adicionado `billingCycle` ao `createCheckoutSchema` |
| `src/modules/payments/checkout/checkout.service.ts` | Seleciona plano correto baseado no ciclo; Lança `YearlyBillingNotAvailableError` se yearly indisponível |
| `src/modules/payments/webhook/webhook.service.ts` | Extrai `billingCycle` do pendingCheckout e salva na subscription |
| `src/modules/payments/subscription/subscription.model.ts` | Adicionado `billingCycle` ao schema de resposta |
| `src/modules/payments/subscription/subscription.service.ts` | `getByOrganizationId()` retorna `billingCycle` |

### Testes Atualizados

- `src/modules/payments/plan/__tests__/plan.service.test.ts`
- `src/modules/payments/plan/__tests__/sync-plan.test.ts`
- `src/modules/payments/checkout/__tests__/create-checkout.test.ts`
- `src/modules/payments/__tests__/upgrade-use-case.test.ts`
- `src/modules/payments/__tests__/upgrade-use-case.e2e.ts`

### Pendências

1. **Executar migration:** `bun db:push` (requer input interativo para confirmar renomeação de coluna)
2. **8.2.2:** Endpoints de `change-cycle` e `change-plan` não implementados nesta fase

---

## Notas de Pesquisa: API Pagarme v5

**Data:** Dezembro 2024

### Descobertas

A pesquisa na documentação oficial do Pagarme revelou limitações importantes da API v5 para mudança de plano:

#### API v1/v2 (Legada)

Na API v1, era possível alterar o plano diretamente:

```http
PUT https://api.pagar.me/1/subscriptions/{subscription_id}
Body: { "plan_id": "new_plan_id" }
```

Com cálculo de pro rata automático nativo.

#### API v5 (Atual - Utilizada neste projeto)

A API v5 (`/core/v5`) **não possui endpoint para alterar o `plan_id`** de uma subscription existente.

**Endpoints de update disponíveis:**

| Endpoint | Descrição |
|----------|-----------|
| `PATCH /subscriptions/{id}/card` | Atualizar cartão |
| `PATCH /subscriptions/{id}/payment-method` | Método de pagamento |
| `PUT /subscriptions/{id}/items/{item_id}` | Atualizar item (preço/quantidade) |
| `PATCH /subscriptions/{id}/billing-date` | Data de cobrança |
| `PATCH /subscriptions/{id}/metadata` | Metadados |
| `DELETE /subscriptions/{id}` | Cancelar subscription |

**Não disponível:** `PUT /subscriptions/{id}` com `plan_id` ou `interval`.

### Alternativas Identificadas

1. **Atualização de Item**: Alterar preço do item da subscription (não muda o plano real)
2. **Cancelar e Recriar**: Cancelar subscription atual e criar nova com novo plano (adotada)
3. **Cobrança Avulsa**: Usar Orders para cobrar diferença de proration

### Fontes Consultadas

- [Upgrade e Downgrade de Assinatura - Pagarme Help](https://pagarme.helpjuice.com/pt_BR/p1-funcionalidades/assinatura-%C3%A9-poss%C3%ADvel-fazer-upgrade-e-downgrade-de-assinatura)
- [Atualizando uma Assinatura (API v1)](https://docs.pagar.me/v1/reference/atualizando-uma-assinatura)
- [Fluxos de Cobrança](https://docs.pagar.me/v2/docs/fluxos-de-cobran%C3%A7a)
- [Editar Item de Assinatura](https://docs.pagar.me/reference/editar-item)
- [Pagarme .NET SDK - Subscriptions Controller](https://github.com/pagarme/pagarme-net-standard-sdk/blob/main/doc/controllers/subscriptions.md)

### Conclusão

A implementação da fase 8.2.2 requer uma abordagem híbrida:

1. **Downgrades**: Agendar no banco local, processar no vencimento
2. **Upgrades**: Calcular proration manualmente → Cobrar via Order → Cancelar subscription → Criar nova
3. **Mudança de ciclo**: Similar ao downgrade (agendar e processar no vencimento)

Esta abordagem é mais complexa que o suporte nativo do Stripe, mas é viável com o Pagarme v5.
