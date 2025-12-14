# Fase 8.4: Promotion Codes (Cupons de Desconto)

> **Prioridade:** Média
> **Complexidade:** Média
> **Status:** ⏳ Pendente

## Objetivo

Permitir que usuários apliquem códigos promocionais durante o checkout para obter descontos.

> **Referência:** Better Auth + Stripe suporta `allow_promotion_codes: true` no checkout.

## Pré-requisitos

- Fases 1-7 completas
- Checkout funcionando

---

## Modelo de Dados

**Arquivo:** `src/db/schema/promotions.ts`

```typescript
export const promotionCodes = pgTable("promotion_codes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: varchar("description", { length: 255 }),

  // Tipo de desconto
  discountType: varchar("discount_type", { length: 20 }).notNull(), // "percentage" | "fixed"
  discountValue: integer("discount_value").notNull(), // Em centavos ou percentual (ex: 20 = 20%)

  // Restrições
  maxRedemptions: integer("max_redemptions"), // null = ilimitado
  currentRedemptions: integer("current_redemptions").default(0),
  minAmount: integer("min_amount"), // Valor mínimo do pedido (centavos)

  // Aplicabilidade
  applicablePlans: json("applicable_plans").$type<string[]>(), // null = todos os planos
  firstPurchaseOnly: boolean("first_purchase_only").default(false),

  // Validade
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").default(true),

  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by", { length: 36 }), // Admin que criou
});

export const promotionRedemptions = pgTable("promotion_redemptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  promotionCodeId: varchar("promotion_code_id", { length: 36 })
    .notNull()
    .references(() => promotionCodes.id),
  organizationId: varchar("organization_id", { length: 36 })
    .notNull()
    .references(() => organizations.id),
  subscriptionId: varchar("subscription_id", { length: 36 }),
  discountApplied: integer("discount_applied").notNull(), // Valor do desconto aplicado
  redeemedAt: timestamp("redeemed_at").defaultNow(),
});
```

---

## Service

**Arquivo:** `src/modules/payments/promotion/promotion.service.ts`

```typescript
export abstract class PromotionService {
  /**
   * Validate and get promotion code details.
   */
  static async validate(
    code: string,
    organizationId: string,
    planId: string,
    amount: number
  ): Promise<{
    valid: boolean;
    promotion?: PromotionCode;
    discountAmount?: number;
    error?: string;
  }> {
    const promotion = await db.query.promotionCodes.findFirst({
      where: eq(promotionCodes.code, code.toUpperCase()),
    });

    if (!promotion) {
      return { valid: false, error: "Código promocional não encontrado" };
    }

    if (!promotion.isActive) {
      return { valid: false, error: "Código promocional inativo" };
    }

    // Verificar validade temporal
    const now = new Date();
    if (promotion.validFrom && now < promotion.validFrom) {
      return { valid: false, error: "Código promocional ainda não é válido" };
    }
    if (promotion.validUntil && now > promotion.validUntil) {
      return { valid: false, error: "Código promocional expirado" };
    }

    // Verificar limite de uso
    if (
      promotion.maxRedemptions &&
      promotion.currentRedemptions >= promotion.maxRedemptions
    ) {
      return { valid: false, error: "Código promocional esgotado" };
    }

    // Verificar se é primeira compra
    if (promotion.firstPurchaseOnly) {
      const existingRedemption = await db.query.promotionRedemptions.findFirst({
        where: eq(promotionRedemptions.organizationId, organizationId),
      });
      if (existingRedemption) {
        return { valid: false, error: "Código válido apenas para primeira compra" };
      }
    }

    // Verificar planos aplicáveis
    if (
      promotion.applicablePlans &&
      !promotion.applicablePlans.includes(planId)
    ) {
      return { valid: false, error: "Código não aplicável a este plano" };
    }

    // Verificar valor mínimo
    if (promotion.minAmount && amount < promotion.minAmount) {
      return {
        valid: false,
        error: `Valor mínimo: R$ ${(promotion.minAmount / 100).toFixed(2)}`,
      };
    }

    // Calcular desconto
    let discountAmount: number;
    if (promotion.discountType === "percentage") {
      discountAmount = Math.floor((amount * promotion.discountValue) / 100);
    } else {
      discountAmount = Math.min(promotion.discountValue, amount);
    }

    return {
      valid: true,
      promotion,
      discountAmount,
    };
  }

  /**
   * Apply promotion code to a checkout.
   */
  static async redeem(
    promotionId: string,
    organizationId: string,
    subscriptionId: string,
    discountApplied: number
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Registrar uso
      await tx.insert(promotionRedemptions).values({
        id: crypto.randomUUID(),
        promotionCodeId: promotionId,
        organizationId,
        subscriptionId,
        discountApplied,
      });

      // Incrementar contador
      await tx
        .update(promotionCodes)
        .set({
          currentRedemptions: sql`${promotionCodes.currentRedemptions} + 1`,
        })
        .where(eq(promotionCodes.id, promotionId));
    });
  }

  /**
   * Create a new promotion code (admin).
   */
  static async create(input: CreatePromotionInput): Promise<PromotionCode> {
    const id = crypto.randomUUID();
    const code = input.code?.toUpperCase() ?? PromotionService.generateCode();

    await db.insert(promotionCodes).values({
      id,
      code,
      description: input.description,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxRedemptions: input.maxRedemptions,
      minAmount: input.minAmount,
      applicablePlans: input.applicablePlans,
      firstPurchaseOnly: input.firstPurchaseOnly ?? false,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      isActive: true,
      createdBy: input.createdBy,
    });

    const [promotion] = await db
      .select()
      .from(promotionCodes)
      .where(eq(promotionCodes.id, id))
      .limit(1);

    return promotion;
  }

  /**
   * Generate a random promotion code.
   */
  private static generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * List all promotion codes (admin).
   */
  static async list(filters?: {
    isActive?: boolean;
    includeExpired?: boolean;
  }): Promise<PromotionCode[]> {
    const conditions: SQL[] = [];

    if (filters?.isActive !== undefined) {
      conditions.push(eq(promotionCodes.isActive, filters.isActive));
    }

    if (!filters?.includeExpired) {
      const now = new Date();
      conditions.push(
        or(
          isNull(promotionCodes.validUntil),
          gt(promotionCodes.validUntil, now)
        )!
      );
    }

    return db.query.promotionCodes.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(promotionCodes.createdAt),
    });
  }

  /**
   * Deactivate a promotion code (admin).
   */
  static async deactivate(promotionId: string): Promise<void> {
    await db
      .update(promotionCodes)
      .set({ isActive: false })
      .where(eq(promotionCodes.id, promotionId));
  }
}
```

---

## Integração no Checkout

**Arquivo:** `src/modules/payments/checkout/checkout.service.ts`

```typescript
type CreateCheckoutInput = {
  organizationId: string;
  planId: string;
  successUrl: string;
  userId: string;
  promotionCode?: string; // Novo campo
};

static async create(input: CreateCheckoutInput) {
  const { promotionCode, ...rest } = input;

  // ... validações existentes ...

  let discountAmount = 0;
  let promotionId: string | undefined;

  // Validar código promocional se fornecido
  if (promotionCode) {
    const validation = await PromotionService.validate(
      promotionCode,
      input.organizationId,
      input.planId,
      plan.priceMonthly
    );

    if (!validation.valid) {
      throw new InvalidPromotionCodeError(validation.error!);
    }

    discountAmount = validation.discountAmount!;
    promotionId = validation.promotion!.id;
  }

  // Criar payment link com desconto
  // Nota: Pagarme pode não suportar desconto no Payment Link
  // Alternativa: Criar plano temporário com preço descontado
  // ou aplicar desconto na primeira invoice

  // ... resto da implementação ...
}
```

---

## Endpoint de Validação

**Arquivo:** `src/modules/payments/promotion/index.ts`

```typescript
export const promotionController = new Elysia({
  name: "promotion",
  prefix: "/promotions",
  detail: { tags: ["Payments - Promotions"] },
})
  .use(betterAuthPlugin)
  .post(
    "/validate",
    async ({ body, session }) => {
      const { code, planId } = body;
      const organizationId = session.activeOrganizationId as string;

      const plan = await PlanService.getById(planId);
      const result = await PromotionService.validate(
        code,
        organizationId,
        planId,
        plan.priceMonthly
      );

      if (!result.valid) {
        return {
          success: false as const,
          error: result.error,
        };
      }

      return {
        success: true as const,
        data: {
          code: result.promotion!.code,
          discountType: result.promotion!.discountType,
          discountValue: result.promotion!.discountValue,
          discountAmount: result.discountAmount,
          finalAmount: plan.priceMonthly - result.discountAmount!,
        },
      };
    },
    {
      auth: {
        requireOrganization: true,
      },
      body: t.Object({
        code: t.String(),
        planId: t.String(),
      }),
      detail: { summary: "Validate promotion code" },
    }
  );
```

---

## Admin API

```typescript
// POST /v1/admin/promotions - Criar cupom
// GET /v1/admin/promotions - Listar cupons
// GET /v1/admin/promotions/:id - Detalhes do cupom
// PUT /v1/admin/promotions/:id - Atualizar cupom
// DELETE /v1/admin/promotions/:id - Desativar cupom
// GET /v1/admin/promotions/:id/redemptions - Histórico de uso
```

**Arquivo:** `src/modules/payments/promotion/admin.ts`

```typescript
export const promotionAdminController = new Elysia({
  name: "promotion-admin",
  prefix: "/admin/promotions",
  detail: { tags: ["Admin - Promotions"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ body, user }) => {
      const promotion = await PromotionService.create({
        ...body,
        createdBy: user.id,
      });

      return {
        success: true as const,
        data: promotion,
      };
    },
    {
      auth: {
        role: "admin",
      },
      body: createPromotionSchema,
      detail: { summary: "Create promotion code" },
    }
  )
  .get(
    "/",
    async ({ query }) => {
      const promotions = await PromotionService.list({
        isActive: query.isActive,
        includeExpired: query.includeExpired,
      });

      return {
        success: true as const,
        data: { promotions },
      };
    },
    {
      auth: {
        role: "admin",
      },
      query: t.Object({
        isActive: t.Optional(t.Boolean()),
        includeExpired: t.Optional(t.Boolean()),
      }),
      detail: { summary: "List promotion codes" },
    }
  )
  .delete(
    "/:id",
    async ({ params }) => {
      await PromotionService.deactivate(params.id);

      return {
        success: true as const,
        data: { deactivated: true },
      };
    },
    {
      auth: {
        role: "admin",
      },
      params: t.Object({
        id: t.String(),
      }),
      detail: { summary: "Deactivate promotion code" },
    }
  );
```

---

## Considerações com Pagarme

O Pagarme tem suporte limitado a cupons comparado ao Stripe:

| Funcionalidade | Stripe | Pagarme |
|----------------|--------|---------|
| Cupons nativos | ✅ Coupons API | ⚠️ Limitado |
| Desconto no checkout | ✅ `allow_promotion_codes` | ❌ Não nativo |
| Desconto recorrente | ✅ Automático | ❌ Manual |

**Alternativas para Pagarme:**

1. **Criar plano temporário** com preço descontado
2. **Aplicar desconto na primeira invoice** via API
3. **Gerenciar desconto localmente** e cobrar valor já descontado
4. **Usar incrementos/decrementos** na subscription

---

## Fluxo Recomendado

```text
1. Frontend envia código no checkout
       │
       ▼
2. API valida código (PromotionService.validate)
       │
       ├─ Inválido → Retorna erro
       │
       └─ Válido → Calcula desconto
              │
              ▼
3. Cria Payment Link com valor descontado
   OU cria subscription e aplica desconto na invoice
       │
       ▼
4. Webhook subscription.created
       │
       ▼
5. PromotionService.redeem() registra uso
       │
       ▼
6. Email de confirmação inclui desconto aplicado
```

---

## Model Schemas

**Arquivo:** `src/modules/payments/promotion/promotion.model.ts`

```typescript
export const createPromotionSchema = z.object({
  code: z.string().min(4).max(20).optional().describe("Código (gerado se omitido)"),
  description: z.string().max(255).optional().describe("Descrição interna"),
  discountType: z.enum(["percentage", "fixed"]).describe("Tipo de desconto"),
  discountValue: z.number().positive().describe("Valor (centavos ou %)"),
  maxRedemptions: z.number().positive().optional().describe("Limite de usos"),
  minAmount: z.number().positive().optional().describe("Valor mínimo (centavos)"),
  applicablePlans: z.array(z.string()).optional().describe("Planos aplicáveis"),
  firstPurchaseOnly: z.boolean().optional().describe("Apenas primeira compra"),
  validFrom: z.coerce.date().optional().describe("Início da validade"),
  validUntil: z.coerce.date().optional().describe("Fim da validade"),
});

export const validatePromotionSchema = z.object({
  code: z.string().min(1),
  planId: z.string().min(1),
});

export const promotionResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number(),
  maxRedemptions: z.number().nullable(),
  currentRedemptions: z.number(),
  minAmount: z.number().nullable(),
  applicablePlans: z.array(z.string()).nullable(),
  firstPurchaseOnly: z.boolean(),
  validFrom: z.date().nullable(),
  validUntil: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
});
```

---

## Erros

**Arquivo:** `src/modules/payments/errors.ts`

```typescript
export class InvalidPromotionCodeError extends PaymentError {
  status = 400;

  constructor(reason: string) {
    super(reason, "INVALID_PROMOTION_CODE", { reason });
  }
}

export class PromotionNotFoundError extends PaymentError {
  status = 404;

  constructor(code: string) {
    super(`Código promocional não encontrado: ${code}`, "PROMOTION_NOT_FOUND", { code });
  }
}
```

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/db/schema/promotions.ts` | Schema das tabelas `promotion_codes` e `promotion_redemptions` |
| `src/modules/payments/promotion/promotion.service.ts` | Service com `validate()` e `redeem()` |
| `src/modules/payments/promotion/promotion.model.ts` | Schemas Zod para validação |
| `src/modules/payments/promotion/index.ts` | Controller com endpoints |
| `src/modules/payments/promotion/admin.ts` | Controller admin para CRUD |
| `src/modules/payments/errors.ts` | Adicionar `InvalidPromotionCodeError` |

---

## Checklist de Implementação

- [ ] Criar tabelas `promotion_codes` e `promotion_redemptions`
- [ ] Criar migration
- [ ] Implementar `PromotionService`
- [ ] Endpoint `POST /promotions/validate`
- [ ] Integrar com checkout
- [ ] Admin API (CRUD)
- [ ] Registrar uso no webhook `subscription.created`
- [ ] Testes unitários
- [ ] Testes E2E

---

> **Dependências:** Checkout funcionando
> **Impacto:** Aquisição de clientes, campanhas de marketing
