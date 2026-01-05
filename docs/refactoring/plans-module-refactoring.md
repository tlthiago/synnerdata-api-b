# Plano de Refatoração: Módulo de Plans

> Documento de planejamento para refatoração do módulo `src/modules/payments/plan/` → `src/modules/payments/plans/`

---

## 1. Visão Geral

### Objetivo

Criar um módulo maduro e completo para gerenciamento de planos e tiers, permitindo que administradores criem, atualizem e gerenciem planos com seus respectivos tiers de precificação.

### Decisões de Design

| Aspecto | Decisão |
|---------|---------|
| Faixas de funcionários | **Fixas** - Todos os planos usam as mesmas 10 faixas |
| Criação de plano | **Tiers inline** - Preços passados no mesmo request |
| ID dos planos | `plan-{uuid}` |
| ID dos tiers | `tier-{uuid}` |

### Mudanças Principais

1. Renomear `plan/` → `plans/` (padrão plural)
2. CRUD completo de planos com tiers inline
3. Endpoints para gerenciar tiers individualmente
4. Remover sync com Pagar.me do plano (apenas tiers)
5. Remover `priceMonthly` e `priceYearly` do schema de planos
6. Validação de faixas fixas obrigatórias
7. Constantes centralizadas para faixas de funcionários

---

## 2. Arquitetura Final

### Estrutura de Diretórios

```text
src/modules/payments/plans/
├── index.ts                    # Controllers (public + admin)
├── plans.model.ts              # Schemas Zod
├── plans.service.ts            # Lógica de negócio
├── plans.constants.ts          # Faixas de funcionários (EMPLOYEE_TIERS)
└── __tests__/
    ├── plans.service.test.ts
    ├── create-plan.test.ts
    ├── update-plan.test.ts
    ├── delete-plan.test.ts
    ├── get-plan.test.ts
    ├── list-plans.test.ts
    └── tiers.test.ts           # Testes de gerenciamento de tiers
```

### Endpoints da API

#### Públicos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/plans` | Lista planos públicos com tiers |
| GET | `/plans/:id` | Detalhes de um plano |

#### Admin (requer autenticação)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/plans` | Cria plano com tiers inline |
| PUT | `/plans/:id` | Atualiza plano (e opcionalmente tiers) |
| DELETE | `/plans/:id` | Remove plano e seus tiers |
| PUT | `/plans/:planId/tiers/:tierId` | Atualiza preço de um tier específico |

---

## 3. Schemas e Types

### 3.1 Constantes (`plans.constants.ts`)

```typescript
/**
 * Faixas fixas de funcionários para todos os planos.
 * Todos os planos devem ter exatamente essas 10 faixas.
 */
export const EMPLOYEE_TIERS = [
  { min: 0, max: 10 },
  { min: 11, max: 20 },
  { min: 21, max: 30 },
  { min: 31, max: 40 },
  { min: 41, max: 50 },
  { min: 51, max: 60 },
  { min: 61, max: 70 },
  { min: 71, max: 80 },
  { min: 81, max: 90 },
  { min: 91, max: 180 },
] as const;

export const EMPLOYEE_TIERS_COUNT = EMPLOYEE_TIERS.length; // 10

export const YEARLY_DISCOUNT = 0.2; // 20%

export const MAX_EMPLOYEES = 180;

export const DEFAULT_TRIAL_DAYS = 14;
```

### 3.2 Schema do Banco (`src/db/schema/payments.ts`)

**`subscriptionPlans` (sem preços):**

```typescript
export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  trialDays: integer("trial_days").default(0).notNull(),
  limits: jsonb("limits").$type<PlanLimits>(),
  isActive: boolean("is_active").default(true).notNull(),
  isPublic: boolean("is_public").default(true).notNull(),
  isTrial: boolean("is_trial").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
```

**`planPricingTiers` (preços aqui):**

```typescript
export const planPricingTiers = pgTable("plan_pricing_tiers", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "cascade" }),
  minEmployees: integer("min_employees").notNull(),
  maxEmployees: integer("max_employees").notNull(),
  priceMonthly: integer("price_monthly").notNull(),
  priceYearly: integer("price_yearly").notNull(),
  pagarmePlanIdMonthly: text("pagarme_plan_id_monthly"),
  pagarmePlanIdYearly: text("pagarme_plan_id_yearly"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
```

**`PlanLimits` (simplificado):**

```typescript
export interface PlanLimits {
  features: string[];
}
```

### 3.3 Models (`plans.model.ts`)

**Input: Criar Plano com Tiers:**

```typescript
export const tierPriceInputSchema = z.object({
  minEmployees: z.number().int().min(0).describe("Minimum employees in this tier"),
  maxEmployees: z.number().int().min(1).describe("Maximum employees in this tier"),
  priceMonthly: z.number().int().min(0).describe("Monthly price in cents"),
});

export const createPlanSchema = z.object({
  name: z.string().min(1).max(50).describe("Plan internal name (unique)"),
  displayName: z.string().min(1).max(100).describe("Plan display name"),
  description: z.string().max(500).optional().describe("Plan description"),
  trialDays: z.number().int().min(0).default(0).describe("Trial days (0 for paid plans)"),
  limits: planLimitsSchema.describe("Plan features"),
  isActive: z.boolean().default(true).describe("Whether plan is active"),
  isPublic: z.boolean().default(true).describe("Whether plan is publicly visible"),
  isTrial: z.boolean().default(false).describe("Whether this is the trial plan"),
  sortOrder: z.number().int().default(0).describe("Display sort order"),
  pricingTiers: z
    .array(tierPriceInputSchema)
    .length(10)
    .describe("Pricing for each employee tier (exactly 10 tiers required)"),
});
```

**Input: Atualizar Plano:**

```typescript
export const updatePlanSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  trialDays: z.number().int().min(0).optional(),
  limits: planLimitsSchema.optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  // Opcional: atualiza preços de todos os tiers
  pricingTiers: z.array(tierPriceInputSchema).length(10).optional(),
});
```

**Input: Atualizar Tier Individual:**

```typescript
export const updateTierSchema = z.object({
  priceMonthly: z.number().int().min(0).describe("Monthly price in cents"),
});
```

**Response: Plano com Tiers:**

```typescript
const pricingTierSchema = z.object({
  id: z.string(),
  minEmployees: z.number().int(),
  maxEmployees: z.number().int(),
  priceMonthly: z.number().int(),
  priceYearly: z.number().int(),
});

const planDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  trialDays: z.number().int(),
  limits: planLimitsSchema.nullable(),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  isTrial: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const planWithTiersSchema = planDataSchema.extend({
  startingPriceMonthly: z.number().int().describe("Lowest monthly price"),
  startingPriceYearly: z.number().int().describe("Lowest yearly price"),
  pricingTiers: z.array(pricingTierSchema),
});
```

---

## 4. Service (`plans.service.ts`)

### 4.1 Métodos Principais

```typescript
export abstract class PlansService {
  // ========== CRUD de Planos ==========

  /**
   * Lista planos públicos e ativos com seus tiers
   */
  static async list(): Promise<ListPlansData>

  /**
   * Busca plano por ID com tiers
   */
  static async getById(planId: string): Promise<PlanWithTiersData>

  /**
   * Busca plano por nome
   */
  static async getByName(name: string): Promise<PlanData | null>

  /**
   * Busca o plano de trial
   */
  static async getTrialPlan(): Promise<PlanData>

  /**
   * Cria plano com tiers (transação)
   */
  static async create(data: CreatePlanInput): Promise<PlanWithTiersData>

  /**
   * Atualiza plano (e opcionalmente tiers)
   */
  static async update(planId: string, data: UpdatePlanInput): Promise<PlanWithTiersData>

  /**
   * Remove plano e seus tiers (cascade)
   */
  static async delete(planId: string): Promise<DeletePlanData>

  // ========== Gerenciamento de Tiers ==========

  /**
   * Atualiza preço de um tier específico
   */
  static async updateTier(planId: string, tierId: string, data: UpdateTierInput): Promise<TierData>

  /**
   * Lista tiers de um plano
   */
  static async listTiers(planId: string): Promise<ListTiersData>

  // ========== Features ==========

  /**
   * Verifica se plano possui feature
   */
  static async hasFeature(planId: string, feature: string): Promise<boolean>

  /**
   * Verifica feature ou lança erro
   */
  static async requireFeature(planId: string, feature: string): Promise<void>

  /**
   * Lista features do plano
   */
  static async getFeatures(planId: string): Promise<string[]>

  // ========== Helpers Privados ==========

  private static validateTierRanges(tiers: TierPriceInput[]): void
  private static calculateYearlyPrice(monthlyPrice: number): number
  private static mapPlanToData(plan: SubscriptionPlan): PlanData
}
```

### 4.2 Implementação: Criar Plano

```typescript
static async create(data: CreatePlanInput): Promise<PlanWithTiersData> {
  // 1. Validar que nome é único
  const existingPlan = await PlansService.getByName(data.name);
  if (existingPlan) {
    throw new PlanNameAlreadyExistsError(data.name);
  }

  // 2. Validar faixas de funcionários
  PlansService.validateTierRanges(data.pricingTiers);

  // 3. Criar em transação
  return await db.transaction(async (tx) => {
    // 3.1 Criar plano
    const planId = `plan-${crypto.randomUUID()}`;

    const [plan] = await tx
      .insert(schema.subscriptionPlans)
      .values({
        id: planId,
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        trialDays: data.trialDays,
        limits: data.limits,
        isActive: data.isActive,
        isPublic: data.isPublic,
        isTrial: data.isTrial,
        sortOrder: data.sortOrder,
      })
      .returning();

    // 3.2 Criar tiers
    const tiers = await Promise.all(
      data.pricingTiers.map(async (tierInput) => {
        const tierId = `tier-${crypto.randomUUID()}`;
        const priceYearly = PlansService.calculateYearlyPrice(tierInput.priceMonthly);

        const [tier] = await tx
          .insert(schema.planPricingTiers)
          .values({
            id: tierId,
            planId: plan.id,
            minEmployees: tierInput.minEmployees,
            maxEmployees: tierInput.maxEmployees,
            priceMonthly: tierInput.priceMonthly,
            priceYearly,
          })
          .returning();

        return tier;
      })
    );

    // 3.3 Retornar plano com tiers
    return PlansService.buildPlanWithTiers(plan, tiers);
  });
}
```

### 4.3 Implementação: Validar Faixas

```typescript
private static validateTierRanges(tiers: TierPriceInput[]): void {
  // Deve ter exatamente 10 tiers
  if (tiers.length !== EMPLOYEE_TIERS_COUNT) {
    throw new InvalidTierCountError(tiers.length, EMPLOYEE_TIERS_COUNT);
  }

  // Cada tier deve corresponder às faixas fixas
  for (let i = 0; i < EMPLOYEE_TIERS.length; i++) {
    const expected = EMPLOYEE_TIERS[i];
    const provided = tiers[i];

    if (
      provided.minEmployees !== expected.min ||
      provided.maxEmployees !== expected.max
    ) {
      throw new InvalidTierRangeError(
        i,
        { min: provided.minEmployees, max: provided.maxEmployees },
        { min: expected.min, max: expected.max }
      );
    }
  }
}
```

### 4.4 Implementação: Atualizar Tier

```typescript
static async updateTier(
  planId: string,
  tierId: string,
  data: UpdateTierInput
): Promise<TierData> {
  // 1. Verificar se plano existe
  const plan = await PlansService.getById(planId);
  if (!plan) {
    throw new PlanNotFoundError(planId);
  }

  // 2. Verificar se tier pertence ao plano
  const [existingTier] = await db
    .select()
    .from(schema.planPricingTiers)
    .where(
      and(
        eq(schema.planPricingTiers.id, tierId),
        eq(schema.planPricingTiers.planId, planId)
      )
    )
    .limit(1);

  if (!existingTier) {
    throw new TierNotFoundError(tierId, planId);
  }

  // 3. Calcular preço anual
  const priceYearly = PlansService.calculateYearlyPrice(data.priceMonthly);

  // 4. Atualizar tier
  const [updatedTier] = await db
    .update(schema.planPricingTiers)
    .set({
      priceMonthly: data.priceMonthly,
      priceYearly,
      // Limpar pagarmePlanId quando preço muda
      pagarmePlanIdMonthly: null,
      pagarmePlanIdYearly: null,
    })
    .where(eq(schema.planPricingTiers.id, tierId))
    .returning();

  return PlansService.mapTierToData(updatedTier);
}
```

---

## 5. Controller (`index.ts`)

```typescript
export const plansPublicController = new Elysia({
  name: "plans-public",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans"] },
})
  .get("/", async () => wrapSuccess(await PlansService.list()), {
    response: { 200: listPlansResponseSchema },
    detail: { summary: "List available plans with pricing tiers" },
  })
  .get("/:id", async ({ params }) => wrapSuccess(await PlansService.getById(params.id)), {
    params: planIdParamsSchema,
    response: { 200: getPlanResponseSchema, 404: notFoundErrorSchema },
    detail: { summary: "Get plan details with pricing tiers" },
  });

export const plansAdminController = new Elysia({
  name: "plans-admin",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans (Admin)"] },
})
  .use(betterAuthPlugin)
  .post("/", async ({ body }) => wrapSuccess(await PlansService.create(body)), {
    auth: { requireAdmin: true },
    body: createPlanSchema,
    response: { 200: createPlanResponseSchema, 422: validationErrorSchema },
    detail: { summary: "Create plan with pricing tiers" },
  })
  .put("/:id", async ({ params, body }) => wrapSuccess(await PlansService.update(params.id, body)), {
    auth: { requireAdmin: true },
    params: planIdParamsSchema,
    body: updatePlanSchema,
    response: { 200: updatePlanResponseSchema, 404: notFoundErrorSchema },
    detail: { summary: "Update plan (and optionally tiers)" },
  })
  .delete("/:id", async ({ params }) => wrapSuccess(await PlansService.delete(params.id)), {
    auth: { requireAdmin: true },
    params: planIdParamsSchema,
    response: { 200: deletePlanResponseSchema, 404: notFoundErrorSchema },
    detail: { summary: "Delete plan and its tiers" },
  })
  .put("/:planId/tiers/:tierId", async ({ params, body }) =>
    wrapSuccess(await PlansService.updateTier(params.planId, params.tierId, body)), {
    auth: { requireAdmin: true },
    params: updateTierParamsSchema,
    body: updateTierSchema,
    response: { 200: updateTierResponseSchema, 404: notFoundErrorSchema },
    detail: { summary: "Update tier price" },
  });
```

---

## 6. Erros (`errors.ts`)

```typescript
export class TrialPlanNotFoundError extends PaymentError {
  constructor() {
    super({
      code: "TRIAL_PLAN_NOT_FOUND",
      message: "Trial plan not found. Please run database seed.",
      status: 500,
    });
  }
}

export class FeatureNotAvailableError extends PaymentError {
  constructor(feature: string, planId: string) {
    super({
      code: "FEATURE_NOT_AVAILABLE",
      message: `Feature "${feature}" is not available in this plan.`,
      status: 403,
    });
    this.details = { feature, planId };
  }
}

export class InvalidTierCountError extends PaymentError {
  constructor(provided: number, expected: number) {
    super({
      code: "INVALID_TIER_COUNT",
      message: `Expected ${expected} pricing tiers, but received ${provided}.`,
      status: 422,
    });
    this.details = { provided, expected };
  }
}

export class InvalidTierRangeError extends PaymentError {
  constructor(
    index: number,
    provided: { min: number; max: number },
    expected: { min: number; max: number }
  ) {
    super({
      code: "INVALID_TIER_RANGE",
      message: `Tier at index ${index} has invalid range. Expected ${expected.min}-${expected.max}, got ${provided.min}-${provided.max}.`,
      status: 422,
    });
    this.details = { index, provided, expected };
  }
}

export class TierNotFoundError extends PaymentError {
  constructor(tierId: string, planId: string) {
    super({
      code: "TIER_NOT_FOUND",
      message: `Tier "${tierId}" not found in plan "${planId}".`,
      status: 404,
    });
    this.details = { tierId, planId };
  }
}
```

---

## 7. Migração do Banco

```sql
-- Remover colunas de preço do plano (preço fica apenas nos tiers)
ALTER TABLE subscription_plans
DROP COLUMN IF EXISTS price_monthly,
DROP COLUMN IF EXISTS price_yearly,
DROP COLUMN IF EXISTS pagarme_plan_id_monthly,
DROP COLUMN IF EXISTS pagarme_plan_id_yearly;
```

---

## 8. Seed Atualizado (`src/db/seeds/plans.ts`)

```typescript
import { db } from "@/db";
import { PLAN_FEATURES, schema } from "@/db/schema";
import { EMPLOYEE_TIERS, YEARLY_DISCOUNT } from "@/modules/payments/plans/plans.constants";

const calculateYearlyPrice = (monthlyPrice: number): number => {
  const yearlyFullPrice = monthlyPrice * 12;
  const discount = Math.round(yearlyFullPrice * YEARLY_DISCOUNT);
  return yearlyFullPrice - discount;
};

const PLANS_CONFIG = [
  {
    id: "plan-trial",
    name: "trial",
    displayName: "Trial",
    description: "Período de avaliação gratuito",
    trialDays: 14,
    limits: { features: PLAN_FEATURES.trial as unknown as string[] },
    isActive: true,
    isPublic: false,
    isTrial: true,
    sortOrder: -1,
    tierPrices: null, // Trial não tem tiers
  },
  {
    id: "plan-gold",
    name: "gold",
    displayName: "Ouro Insights",
    description: "Essencial para contratações eficazes",
    trialDays: 0,
    limits: { features: PLAN_FEATURES.gold as unknown as string[] },
    isActive: true,
    isPublic: true,
    isTrial: false,
    sortOrder: 0,
    tierPrices: [39_900, 44_990, 49_990, 55_990, 61_990, 69_990, 77_990, 86_990, 96_990, 107_990],
  },
  // ... diamond, platinum
];

export async function seedPlans(): Promise<void> {
  for (const config of PLANS_CONFIG) {
    // Upsert plano
    await db
      .insert(schema.subscriptionPlans)
      .values({
        id: config.id,
        name: config.name,
        displayName: config.displayName,
        description: config.description,
        trialDays: config.trialDays,
        limits: config.limits,
        isActive: config.isActive,
        isPublic: config.isPublic,
        isTrial: config.isTrial,
        sortOrder: config.sortOrder,
      })
      .onConflictDoUpdate({
        target: schema.subscriptionPlans.id,
        set: { /* ... */ },
      });

    // Upsert tiers (apenas para planos pagos)
    if (config.tierPrices) {
      for (let i = 0; i < EMPLOYEE_TIERS.length; i++) {
        const tier = EMPLOYEE_TIERS[i];
        const priceMonthly = config.tierPrices[i];
        const tierId = `tier-${config.name}-${tier.min}-${tier.max}`; // IDs fixos no seed

        await db
          .insert(schema.planPricingTiers)
          .values({
            id: tierId,
            planId: config.id,
            minEmployees: tier.min,
            maxEmployees: tier.max,
            priceMonthly,
            priceYearly: calculateYearlyPrice(priceMonthly),
          })
          .onConflictDoUpdate({
            target: schema.planPricingTiers.id,
            set: { priceMonthly, priceYearly: calculateYearlyPrice(priceMonthly) },
          });
      }
    }
  }
}
```

---

## 9. Exemplo de Uso da API

### Criar Plano

```bash
POST /v1/payments/plans
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "enterprise",
  "displayName": "Enterprise Premium",
  "description": "Para grandes empresas",
  "trialDays": 0,
  "limits": {
    "features": ["terminated_employees", "absences", "medical_certificates", "accidents", "warnings", "employee_status", "birthdays", "ppe", "employee_record", "payroll"]
  },
  "isActive": true,
  "isPublic": true,
  "isTrial": false,
  "sortOrder": 3,
  "pricingTiers": [
    { "minEmployees": 0, "maxEmployees": 10, "priceMonthly": 79900 },
    { "minEmployees": 11, "maxEmployees": 20, "priceMonthly": 89900 },
    { "minEmployees": 21, "maxEmployees": 30, "priceMonthly": 99900 },
    { "minEmployees": 31, "maxEmployees": 40, "priceMonthly": 109900 },
    { "minEmployees": 41, "maxEmployees": 50, "priceMonthly": 119900 },
    { "minEmployees": 51, "maxEmployees": 60, "priceMonthly": 129900 },
    { "minEmployees": 61, "maxEmployees": 70, "priceMonthly": 139900 },
    { "minEmployees": 71, "maxEmployees": 80, "priceMonthly": 149900 },
    { "minEmployees": 81, "maxEmployees": 90, "priceMonthly": 159900 },
    { "minEmployees": 91, "maxEmployees": 180, "priceMonthly": 179900 }
  ]
}
```

### Atualizar Preço de Tier Específico

```bash
PUT /v1/payments/plans/plan-abc123/tiers/tier-xyz789
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "priceMonthly": 42900
}
```

---

## 10. Ordem de Execução

### Fase 1: Preparação

1. [ ] Criar `plans.constants.ts` com EMPLOYEE_TIERS
2. [ ] Criar novos erros em `errors.ts`
3. [ ] Criar migration para remover colunas do banco

### Fase 2: Refatoração do Módulo

4. [ ] Renomear pasta `plan/` → `plans/`
5. [ ] Renomear arquivos (plan.* → plans.*)
6. [ ] Atualizar `plans.model.ts`:
    - Schemas de criação com tiers inline
    - Schemas de atualização
    - Schemas de response
7. [ ] Atualizar `plans.service.ts`:
    - Implementar `create()` com transação
    - Implementar `update()` com tiers opcionais
    - Implementar `updateTier()`
    - Implementar validação de faixas
    - Adicionar métodos de features
8. [ ] Atualizar `index.ts`:
    - Novo endpoint `PUT /:planId/tiers/:tierId`
    - Remover endpoint `/sync`

### Fase 3: Atualizar Consumidores

9. [ ] `plan-change.service.ts`
10. [ ] `subscription.service.ts`
11. [ ] `checkout.service.ts`
12. [ ] `limits.service.ts`
13. [ ] `src/db/seeds/plans.ts`
14. [ ] Fixtures de teste

### Fase 4: Testes

15. [ ] Remover `sync-plan.test.ts`
16. [ ] Criar `tiers.test.ts`
17. [ ] Atualizar testes existentes
18. [ ] Rodar suite completa

### Fase 5: Limpeza

19. [ ] Verificar referências ao código removido
20. [ ] Rodar linter (`npx ultracite fix`)
21. [ ] Rodar build (`bun run build`)
22. [ ] Executar migration

---

## 11. Resumo das Mudanças

### Schema

| Tabela | Campo | Ação |
|--------|-------|------|
| `subscription_plans` | `price_monthly` | Remover |
| `subscription_plans` | `price_yearly` | Remover |
| `subscription_plans` | `pagarme_plan_id_monthly` | Remover |
| `subscription_plans` | `pagarme_plan_id_yearly` | Remover |
| `plan_pricing_tiers` | - | Manter (preços aqui) |

### Service

| Método | Ação |
|--------|------|
| `create()` | Refatorar (tiers inline, transação) |
| `update()` | Refatorar (tiers opcionais) |
| `updateTier()` | Novo |
| `listTiers()` | Novo |
| `getTrialPlan()` | Novo |
| `hasFeature()` | Novo |
| `requireFeature()` | Novo |
| `getFeatures()` | Novo |
| `validateTierRanges()` | Novo (privado) |
| `syncToPagarme()` | Remover |
| `ensureSynced()` | Remover |

### Endpoints

| Endpoint | Ação |
|----------|------|
| `POST /plans` | Refatorar (tiers inline) |
| `PUT /plans/:id` | Refatorar (tiers opcionais) |
| `PUT /plans/:planId/tiers/:tierId` | Novo |
| `POST /plans/:id/sync` | Remover |

---

## 12. Checklist Final

- [ ] Todos os testes passando
- [ ] Linter sem erros
- [ ] Build sem erros
- [ ] Criar plano com tiers funcionando
- [ ] Atualizar plano funcionando
- [ ] Atualizar tier individual funcionando
- [ ] Deletar plano (cascade tiers) funcionando
- [ ] Fluxo de checkout funcionando
- [ ] Fluxo de upgrade funcionando
- [ ] Seed executando corretamente

---

*Última atualização: 29/12/2024*
