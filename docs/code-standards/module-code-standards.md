# Module Code Standards

> **OBRIGATÓRIO para Agentes de IA**: Leia ANTES de criar/modificar módulos. Siga EXATAMENTE os padrões abaixo.

## Estrutura de Módulo

```text
src/modules/{domain}/{module-name}/
├── index.ts                  # Controller
├── {module-name}.model.ts    # Schemas + tipos
├── {module-name}.service.ts  # Lógica de negócio
└── __tests__/
```

Domínios têm `errors.ts` na raiz: `src/modules/{domain}/errors.ts`

---

## Controller (`index.ts`)

```typescript
import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { createResourceResponseSchema, createResourceSchema } from "./{module}.model";
import { ResourceService } from "./{module}.service";

export const resourceController = new Elysia({
  name: "{module-name}",           // kebab-case
  prefix: "/{module-name}",
  detail: { tags: ["{Domain} - {Module}"] },
})
  .use(betterAuthPlugin)           // OBRIGATÓRIO em cada controller
  .post(
    "/",
    async ({ user, session, body }) =>
      wrapSuccess(
        await ResourceService.create({
          ...body,
          userId: user.id,
          organizationId: session.activeOrganizationId as string,
        })
      ),
    {
      auth: {
        permissions: { resource: ["create"] },  // create | read | update | delete
        requireOrganization: true,
      },
      body: createResourceSchema,
      response: {
        200: createResourceResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: { summary: "Create resource", description: "Creates a new resource." },
    }
  );
```

**Regras do Controller:**
- Usar `wrapSuccess()` para encapsular a resposta: `wrapSuccess(await Service.method())`
- Handler deve ser `async` quando usa `await`
- O envelope `{ success: true, data: {...} }` é responsabilidade do controller, não do service

---

## Model (`{module}.model.ts`)

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// Schema de entrada - usar .describe() para documentação OpenAPI
export const createResourceSchema = z.object({
  field1: z.string().min(1).describe("Resource name"),
  field2: z.httpUrl().describe("Callback URL"),
});

// Schema de dados da resposta (sem envelope)
const resourceDataSchema = z.object({
  id: z.string().describe("Resource ID"),
  field1: z.string().describe("Resource name"),
});

// Schema de resposta com envelope { success, data } - para documentação OpenAPI
export const createResourceResponseSchema = successResponseSchema(resourceDataSchema);

// Tipos - SEMPRE inferir dos schemas
export type CreateResource = z.infer<typeof createResourceSchema>;
export type CreateResourceInput = CreateResource & {
  userId: string;
  organizationId: string;
};
export type ResourceData = z.infer<typeof resourceDataSchema>;
export type CreateResourceResponse = z.infer<typeof createResourceResponseSchema>;

// Tipo de dados para o service (sem envelope)
export type CreateResourceData = ResourceData;
```

**Nomenclatura:**

- Schema entrada: `{action}{Resource}Schema`
- Schema dados: `{resource}DataSchema`
- Schema resposta: `{action}{Resource}ResponseSchema` (usa `successResponseSchema`)
- Tipo input service: `{Action}{Resource}Input`
- **Tipo dados service**: `{Action}{Resource}Data` (usado no retorno do service)

**Regras de Schema:**

- **SEMPRE usar Zod** (`z`) para schemas, **NUNCA** usar `t` (TypeBox/Elysia)
- Para tipos de **input** (campos com `.default()` são opcionais): usar `z.input<typeof schema>`
- Para tipos de **output** (após parsing, com defaults aplicados): usar `z.infer<typeof schema>`

```typescript
// Schema com default
export const querySchema = z.object({
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0),
});

// Tipo para INPUT do service (limit e offset são opcionais)
export type QueryOptions = z.input<typeof querySchema>;

// Tipo para OUTPUT após parsing (limit e offset são obrigatórios)
export type ParsedQuery = z.infer<typeof querySchema>;
```

---

## Service (`{module}.service.ts`)

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { ResourceNotFoundError } from "../errors";
import type { CreateResourceData, CreateResourceInput } from "./{module}.model";

const EXPIRATION_HOURS = 24;  // Constantes: SCREAMING_SNAKE_CASE

export abstract class ResourceService {
  static async create(input: CreateResourceInput): Promise<CreateResourceData> {
    const { organizationId, userId, field1 } = input;  // Desestruturar no início

    // 1. Validações de negócio
    if (!condition) throw new SomeError();

    // 2. Pré-condições via outros services
    await OtherService.ensureCondition(organizationId);

    // 3. Operações externas
    const result = await ExternalClient.create(data);

    // 4. Persistir
    await db.insert(schema.resources).values({
      id: `resource-${crypto.randomUUID()}`,  // ID: prefix-uuid
      organizationId,
    });

    // 5. Retornar dados puros (sem envelope)
    return { id: result.id };
  }

  // Validações reutilizáveis: ensure*
  static async ensureExists(id: string): Promise<Resource> {
    const [resource] = await db.select().from(schema.resources).where(eq(schema.resources.id, id)).limit(1);
    if (!resource) throw new ResourceNotFoundError(id);
    return resource;
  }
}
```

**Regras Service:**
- Classe: `abstract class {Module}Service`
- Métodos: `static async` com tipo retorno explícito
- **Retorno**: Dados puros (ex: `{ id, name }`) - SEM envelope `{ success, data }`
- Erros: importar de `../errors`, nunca strings

> **IMPORTANTE**: O envelope de resposta `{ success: true, data: {...} }` é adicionado pelo controller via `wrapSuccess()`, não pelo service.

---

## Service - Boas Práticas

### Queries Reutilizáveis

Extrair queries duplicadas em métodos privados para evitar repetição:

```typescript
export abstract class ResourceService {
  // Helper privado para queries reutilizadas
  private static async findByOrganizationId(
    organizationId: string
  ): Promise<Resource | null> {
    const [resource] = await db
      .select()
      .from(schema.resources)
      .where(eq(schema.resources.organizationId, organizationId))
      .limit(1);

    return resource ?? null;
  }

  static async get(organizationId: string): Promise<Resource> {
    const resource = await ResourceService.findByOrganizationId(organizationId);
    if (!resource) throw new ResourceNotFoundError(organizationId);
    return resource;
  }

  static async update(organizationId: string, data: UpdateData): Promise<Resource> {
    const resource = await ResourceService.findByOrganizationId(organizationId);
    if (!resource) throw new ResourceNotFoundError(organizationId);
    // ...
  }
}
```

### Operações Inversas

Operações opostas devem ser simétricas. Se `cancel` não altera `status`, `restore` também não deve:

```typescript
// ✅ Correto: operações simétricas
static async cancel(id: string) {
  await db.update(schema.subscriptions)
    .set({ cancelAtPeriodEnd: true, canceledAt: new Date() })
    .where(eq(schema.subscriptions.id, id));
}

static async restore(id: string) {
  await db.update(schema.subscriptions)
    .set({ cancelAtPeriodEnd: false, canceledAt: null })
    .where(eq(schema.subscriptions.id, id));
}

// ❌ Errado: operações assimétricas causam inconsistência
static async cancel(id: string) {
  await db.update(...).set({ status: "canceled", cancelAtPeriodEnd: true });
}
static async restore(id: string) {
  await db.update(...).set({ status: "active", cancelAtPeriodEnd: false });
  // E se era "trial" antes do cancel? Estado perdido.
}
```

**Regra:** Se uma operação preserva um campo, sua operação inversa também deve preservar.

---

## Banco de Dados (Drizzle)

**NUNCA usar `db.query`. SEMPRE usar Select API:**

```typescript
// SELECT
const [user] = await db
  .select({ emailVerified: schema.users.emailVerified })
  .from(schema.users)
  .where(eq(schema.users.id, userId))
  .limit(1);

// SELECT com JOIN
const results = await db
  .select({ subscription: schema.subscriptions, plan: schema.plans })
  .from(schema.subscriptions)
  .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
  .where(eq(schema.subscriptions.organizationId, orgId));

// INSERT
await db.insert(schema.resources).values({
  id: `prefix-${crypto.randomUUID()}`,
  organizationId,
  status: "pending",
});

// UPDATE
await db.update(schema.resources).set({ status: "active" }).where(eq(schema.resources.id, id));

// DELETE
await db.delete(schema.resources).where(eq(schema.resources.id, id));
```

---

## Erros

### Estrutura

```text
@/lib/errors/base-error.ts    → AppError (classe base)
@/lib/errors/http-errors.ts   → NotFoundError, ForbiddenError, etc.
src/modules/{domain}/errors.ts → Erros específicos do domínio
```

### Erros HTTP genéricos (`@/lib/errors/http-errors`)

| Classe | Status | Code |
|--------|--------|------|
| `NotFoundError` | 404 | NOT_FOUND |
| `UnauthorizedError` | 401 | UNAUTHORIZED |
| `ForbiddenError` | 403 | FORBIDDEN |
| `ValidationError` | 400 | VALIDATION_ERROR |
| `ConflictError` | 409 | CONFLICT |
| `InternalError` | 500 | INTERNAL_ERROR |

### Erros de domínio (`src/modules/{domain}/errors.ts`)

```typescript
import { AppError } from "@/lib/errors/base-error";

// Erro base do domínio
export class PaymentError extends AppError {
  status = 400;
  code: string;
  constructor(message: string, code = "PAYMENT_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

// Erros específicos estendem o erro base do domínio
export class PlanNotFoundError extends PaymentError {
  status = 404;
  constructor(planId: string) {
    super(`Plan not found: ${planId}`, "PLAN_NOT_FOUND", { planId });
  }
}

export class SubscriptionAlreadyActiveError extends PaymentError {
  constructor() {
    super("Organization already has active subscription", "SUBSCRIPTION_ALREADY_ACTIVE");
  }
}
```

**Nomenclatura erros:**
- Base domínio: `{Domain}Error`
- Not found: `{Resource}NotFoundError`
- Já existe: `{Resource}Already{State}Error`
- Não permitido: `{Resource}Not{Action}ableError`

### Resposta de erro (automática via errorPlugin)

**Erros de domínio:**
```json
{ "success": false, "error": { "code": "PLAN_NOT_FOUND", "message": "...", "details": {} } }
```

**Erros de validação (Zod/Elysia):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      { "path": "/name", "message": "Expected string, received number" },
      { "path": "/email", "message": "Invalid email" }
    ]
  }
}
```

Estrutura de `details` em erros de validação:
- `path`: Caminho do campo que falhou (ex: `/name`, `/address/city`)
- `message`: Mensagem de erro do Zod

---

## Imports

```typescript
// 1. Externos
import { eq } from "drizzle-orm";
import { z } from "zod";

// 2. Aliases internos - SEMPRE usar @/, nunca caminhos relativos como ../../
import { db } from "@/db";
import { schema } from "@/db/schema";

// 3. Relativos do domínio (apenas dentro do mesmo domínio)
import { SomeError } from "../errors";
import { OtherService } from "../other/other.service";

// 4. Locais - USAR import type para tipos
import type { CreateResourceInput } from "./{module}.model";
```

**Regras de Import:**
- **SEMPRE** usar alias `@/` para imports de `lib/`, `db/`, `env`, etc.
- **NUNCA** usar caminhos relativos longos como `../../lib/` ou `../../../db/`
- Imports relativos (`../`) são permitidos apenas dentro do mesmo domínio

---

## Checklist Rápido

**Novo módulo:**
- [ ] `index.ts` com `betterAuthPlugin` e `auth: { permissions, requireOrganization }`
- [ ] `index.ts` usa `wrapSuccess()` para encapsular respostas
- [ ] `.model.ts` com schemas Zod e tipos inferidos (`z.infer`)
- [ ] `.model.ts` tem tipos `*Data` para retorno do service
- [ ] `.service.ts` como `abstract class` com métodos `static async`
- [ ] `.service.ts` retorna dados puros (sem envelope `{ success, data }`)
- [ ] Input type inclui `userId` + `organizationId`
- [ ] IDs: `prefix-${crypto.randomUUID()}`
- [ ] Queries: Select API (não `db.query`)
- [ ] Erros: classes em `../errors`, nunca strings
- [ ] Imports: usar `@/` para `lib/`, `db/`, `env` - nunca `../../`

**Manutenção:**
- [ ] Não quebrar API existente
- [ ] Erros novos estendem erro base do domínio
- [ ] Extrair queries duplicadas em métodos privados (`findBy*`)
- [ ] Operações inversas devem ser simétricas (cancel/restore, enable/disable)
- [ ] `npx ultracite fix` antes de finalizar

**Comentários:**

- [ ] **Não adicionar comentários JSDoc** em métodos/classes - nomes devem ser autoexplicativos
- [ ] **Não adicionar comentários óbvios** como `// Log the error` ou `// Get user by id`
- [ ] Comentários permitidos apenas para: lógica complexa não óbvia, `biome-ignore`, TODOs temporários
