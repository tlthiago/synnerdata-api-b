# Phase 2: Plan Module Complete Refactoring

## Objetivo
Refatorar o módulo de planos (`src/modules/payments/plan/`) para fornecer operações CRUD completas com sincronização Pagarme e testes E2E.

## Requisitos
- **CRUD completo e sync**: Gerenciamento completo de planos (create, read, update, delete) + sincronização com Pagarme
- **Rotas públicas**: Rotas GET (list, get by ID) permanecem públicas (sem auth)
- **Rotas protegidas**: Mutations (create, update, delete, sync) requerem autenticação
- **Testes E2E**: Seguir o padrão em `customer/__tests__/get-customers.test.ts`

## Arquivos a Modificar

| Arquivo | Alterações |
|---------|------------|
| `src/modules/payments/plan/index.ts` | Separar em rotas públicas/protegidas, adicionar endpoints CRUD |
| `src/modules/payments/plan/plan.model.ts` | Adicionar schemas de input para create/update |
| `src/modules/payments/plan/plan.service.ts` | Adicionar métodos create, update, delete |
| `src/modules/payments/index.ts` | Atualizar estrutura de import para rotas públicas/protegidas de planos |
| `src/modules/payments/plan/__tests__/*.test.ts` | Criar testes E2E |

## Passos de Implementação

### Passo 1: Atualizar plan.model.ts - Adicionar Schemas de Input

Adicionar schemas Zod para criação e atualização de planos:

```typescript
// Input schemas
export const createPlanRequestSchema = z.object({
  name: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  priceMonthly: z.number().int().min(0),
  priceYearly: z.number().int().min(0),
  trialDays: z.number().int().min(0).default(14),
  limits: planLimitsSchema,
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const updatePlanRequestSchema = createPlanRequestSchema.partial();

export const syncPlanResponseSchema = z.object({
  id: z.string(),
  pagarmePlanId: z.string(),
});
```

### Passo 2: Atualizar plan.service.ts - Adicionar Métodos CRUD

Adicionar métodos:

```typescript
static async create(data: CreatePlanRequest): Promise<PlanResponse>
static async update(planId: string, data: UpdatePlanRequest): Promise<PlanResponse>
static async delete(planId: string): Promise<void>
```

Os métodos `syncToPagarme` e `ensureSynced` já existem.

### Passo 3: Refatorar plan/index.ts - Separar Rotas Públicas/Protegidas

Criar dois controllers:

```typescript
// Rotas públicas (sem auth)
export const planPublicController = new Elysia({
  name: "plan-public",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans"] },
})
  .get("/", ...)        // Listar planos
  .get("/:id", ...)     // Obter plano por ID

// Rotas protegidas (requer auth)
export const planProtectedController = new Elysia({
  name: "plan-protected",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans (Admin)"] },
})
  .post("/", ...)           // Criar plano
  .put("/:id", ...)         // Atualizar plano
  .delete("/:id", ...)      // Deletar plano
  .post("/:id/sync", ...)   // Sincronizar com Pagarme
```

### Passo 4: Atualizar payments/index.ts

```typescript
// Rotas públicas
.use(planPublicController)
.use(webhookController)
// Rotas protegidas
.guard({ auth: true }, (app) =>
  app
    .use(planProtectedController)  // Adicionar rotas protegidas de planos
    .use(checkoutController)
    // ...
)
```

### Passo 5: Criar Testes E2E

Criar arquivos de teste seguindo o padrão de customer:

**`src/modules/payments/plan/__tests__/list-plans.test.ts`**
- Testar endpoint público de listagem sem auth
- Testar que retorna apenas planos ativos/públicos
- Testar propriedades dos planos

**`src/modules/payments/plan/__tests__/get-plan.test.ts`**
- Testar endpoint público de get sem auth
- Testar que retorna plano por ID
- Testar 404 para plano inexistente

**`src/modules/payments/plan/__tests__/create-plan.test.ts`**
- Testar que requer autenticação (401)
- Testar criação de plano com dados válidos
- Testar erros de validação
- Testar erro de nome duplicado

**`src/modules/payments/plan/__tests__/update-plan.test.ts`**
- Testar que requer autenticação (401)
- Testar atualização de plano
- Testar 404 para plano inexistente

**`src/modules/payments/plan/__tests__/delete-plan.test.ts`**
- Testar que requer autenticação (401)
- Testar exclusão de plano
- Testar 404 para plano inexistente

**`src/modules/payments/plan/__tests__/sync-plan.test.ts`**
- Testar que requer autenticação (401)
- Testar sincronização do plano com Pagarme
- Testar que retorna pagarmePlanId existente se já sincronizado
- Testar 404 para plano inexistente

## Padrão de Estrutura de Teste

```typescript
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUser } from "@/test/helpers/auth";

const BASE_URL = env.API_URL;

describe("POST /payments/plans", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await createTestUser({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test", ... }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("should create plan with valid data", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ... }),
      })
    );
    expect(response.status).toBe(200);
    // ...
  });
});
```

## Resumo dos Endpoints da API

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | /v1/payments/plans | Não | Listar planos ativos/públicos |
| GET | /v1/payments/plans/:id | Não | Obter plano por ID |
| POST | /v1/payments/plans | Sim | Criar novo plano |
| PUT | /v1/payments/plans/:id | Sim | Atualizar plano |
| DELETE | /v1/payments/plans/:id | Sim | Deletar plano |
| POST | /v1/payments/plans/:id/sync | Sim | Sincronizar plano com Pagarme |

## Limpeza

Após implementação, remover ou atualizar:
- `src/modules/payments/plan/__tests__/plan.service.test.ts` (testes unitários) - Manter ou converter para E2E
- `docs/upgrade-phases/phase-2-plan-sync.md` - Marcar como completado

## Checklist de Validação

- [x] `npx tsc --noEmit` passa
- [x] `npx ultracite check` passa
- [x] `bun test src/modules/payments/plan/` todos os testes passam
- [x] Rotas públicas funcionam sem auth
- [x] Rotas protegidas requerem auth (retornam 401 sem)
- [x] Sincronização com Pagarme cria planos reais na API Pagarme

> **Status: ✅ COMPLETA** - CRUD completo implementado em `plan.service.ts` com testes E2E:
> - `list-plans.test.ts`
> - `get-plan.test.ts`
> - `create-plan.test.ts`
> - `update-plan.test.ts`
> - `delete-plan.test.ts`
> - `sync-plan.test.ts`
