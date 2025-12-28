# Guia de Implementação de Módulos

> **OBRIGATÓRIO para Agentes de IA**: Use este guia como checklist para implementar novos módulos CRUD. Siga a ordem exata dos passos.

## Visão Geral

Este guia documenta o processo completo para implementar um novo módulo CRUD no sistema. Complementa os padrões em `module-code-standards.md` e `testing-standards.md` com instruções práticas de execução.

---

## Estrutura Final do Módulo

### Organização de Domínios

Os módulos são organizados em dois níveis:

1. **Módulos principais** (entidades core): Ficam na raiz de `src/modules/`
2. **Módulos de domínio** (entidades auxiliares): Ficam dentro de um domínio pai

```text
src/modules/
├── employees/                  # Módulo principal (entidade core)
│   ├── index.ts
│   ├── employee.model.ts
│   ├── employee.service.ts
│   ├── errors.ts
│   └── __tests__/
├── occurrences/                # Domínio com submódulos
│   ├── absences/
│   ├── accidents/
│   ├── promotions/
│   ├── ppe-deliveries/
│   └── ...
├── organizations/              # Domínio com submódulos
│   ├── branches/               # Submódulo do domínio organizations
│   ├── sectors/
│   ├── cost-centers/
│   ├── job-positions/
│   └── job-classifications/
└── payments/                   # Domínio com submódulos
    ├── checkout/
    ├── plans/
    └── ...
```

**Quando usar cada padrão:**

| Tipo | Localização | Exemplos |
|------|-------------|----------|
| Entidade core do negócio | `src/modules/{module}/` | employees, occurrences |
| Entidade auxiliar/configuração | `src/modules/{domain}/{module}/` | branches, sectors, plans |

### Estrutura Interna do Módulo

```text
{module-name}/
├── index.ts                    # Controller (exporta apenas o controller)
├── {module-name}.model.ts      # Schemas Zod + tipos
├── {module-name}.service.ts    # Lógica de negócio
├── errors.ts                   # Erros específicos do módulo
└── __tests__/
    ├── create-{resource}.test.ts
    ├── list-{resources}.test.ts
    ├── get-{resource}.test.ts
    ├── update-{resource}.test.ts
    └── delete-{resource}.test.ts

src/db/schema/{module-name}.ts  # Schema Drizzle
```

---

## Checklist de Implementação

### Fase 1: Banco de Dados

#### 1.1 Criar Schema Drizzle

**Arquivo:** `src/db/schema/{module-name}.ts`

```typescript
import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const resources = pgTable(
  "resources",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Campos do módulo
    name: text("name").notNull(),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    index("resources_organization_id_idx").on(table.organizationId),
  ]
);

export const resourceRelations = relations(resources, ({ one }) => ({
  organization: one(organizations, {
    fields: [resources.organizationId],
    references: [organizations.id],
  }),
}));

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
```

#### 1.2 Exportar no Schema Index

**Arquivo:** `src/db/schema/index.ts`

> **IMPORTANTE**: Adicionar import E uso simultaneamente para evitar que o linter remova o import.

Adicionar:
1. Import do schema e relations
2. Adicionar ao objeto `schema`
3. Adicionar relations ao objeto `fullSchema`
4. Exportar tipos

```typescript
// No topo, junto com outros imports
import { resourceRelations, resources } from "./resources";

// No objeto schema
export const schema = {
  // ... outros
  resources,
};

// No objeto fullSchema
export const fullSchema = {
  ...schema,
  // ... outros
  resourceRelations,
};

// No final, junto com outros exports de tipos
export type { NewResource, Resource } from "./resources";
```

#### 1.3 Executar Migration

```bash
bun db:generate
bun db:push
```

---

### Fase 2: Módulo

#### 2.1 Criar Diretório

```bash
mkdir -p src/modules/{domain}/{module-name}/__tests__
```

#### 2.2 Criar Erros

**Arquivo:** `src/modules/{domain}/{module-name}/errors.ts`

```typescript
import { AppError } from "@/lib/errors/base-error";

export class ResourceError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "RESOURCE_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class ResourceNotFoundError extends ResourceError {
  status = 404;

  constructor(resourceId: string) {
    super(`Resource not found: ${resourceId}`, "RESOURCE_NOT_FOUND", {
      resourceId,
    });
  }
}

export class ResourceAlreadyDeletedError extends ResourceError {
  status = 404;

  constructor(resourceId: string) {
    super(`Resource already deleted: ${resourceId}`, "RESOURCE_ALREADY_DELETED", {
      resourceId,
    });
  }
}
```

#### 2.3 Adicionar Permissões

**Arquivo:** `src/lib/permissions.ts`

Adicionar em 3 lugares:

```typescript
// 1. Em orgStatements
export const orgStatements = {
  // ... outros
  resource: ["create", "read", "update", "delete"],
} as const;

// 2. Em cada role do orgRoles
export const orgRoles = {
  owner: orgAc.newRole({
    // ... outros
    resource: ["create", "read", "update", "delete"],
  }),
  manager: orgAc.newRole({
    // ... outros
    resource: ["create", "read", "update", "delete"],
  }),
  supervisor: orgAc.newRole({
    // ... outros
    resource: ["read"],  // Apenas leitura
  }),
  viewer: orgAc.newRole({
    // ... outros
    resource: ["read"],  // Apenas leitura
  }),
};
```

#### 2.4 Criar Model

**Arquivo:** `src/modules/{domain}/{module-name}/{module-name}.model.ts`

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// Schema de entrada
export const createResourceSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .describe("Nome do recurso"),
});

export const updateResourceSchema = createResourceSchema.partial();

// Schema de parâmetros de rota
export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do recurso"),
});

// Schema de dados (resposta)
const resourceDataSchema = z.object({
  id: z.string().describe("ID do recurso"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome do recurso"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

// Schema para soft delete (inclui deletedAt e deletedBy)
const deletedResourceDataSchema = resourceDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const resourceListDataSchema = z.array(resourceDataSchema);

// Response schemas (com envelope)
export const createResourceResponseSchema =
  successResponseSchema(resourceDataSchema);
export const getResourceResponseSchema =
  successResponseSchema(resourceDataSchema);
export const updateResourceResponseSchema =
  successResponseSchema(resourceDataSchema);
export const deleteResourceResponseSchema =
  successResponseSchema(deletedResourceDataSchema);
export const listResourcesResponseSchema =
  successResponseSchema(resourceListDataSchema);

// Tipos
export type CreateResource = z.infer<typeof createResourceSchema>;
export type CreateResourceInput = CreateResource & {
  organizationId: string;
  userId: string;
};

export type UpdateResource = z.infer<typeof updateResourceSchema>;
export type UpdateResourceInput = UpdateResource & {
  userId: string;
};

export type ResourceData = z.infer<typeof resourceDataSchema>;
export type DeletedResourceData = z.infer<typeof deletedResourceDataSchema>;
```

#### 2.5 Criar Service

**Arquivo:** `src/modules/{domain}/{module-name}/{module-name}.service.ts`

```typescript
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { ResourceAlreadyDeletedError, ResourceNotFoundError } from "./errors";
import type {
  CreateResourceInput,
  DeletedResourceData,
  ResourceData,
  UpdateResourceInput,
} from "./{module-name}.model";

export abstract class ResourceService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<ResourceData | null> {
    const [resource] = await db
      .select()
      .from(schema.resources)
      .where(
        and(
          eq(schema.resources.id, id),
          eq(schema.resources.organizationId, organizationId),
          isNull(schema.resources.deletedAt)
        )
      )
      .limit(1);

    return (resource as ResourceData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(ResourceData & { deletedAt: Date | null }) | null> {
    const [resource] = await db
      .select()
      .from(schema.resources)
      .where(
        and(
          eq(schema.resources.id, id),
          eq(schema.resources.organizationId, organizationId)
        )
      )
      .limit(1);

    return resource ?? null;
  }

  static async create(input: CreateResourceInput): Promise<ResourceData> {
    const { organizationId, userId, ...data } = input;

    const resourceId = `resource-${crypto.randomUUID()}`;

    const [resource] = await db
      .insert(schema.resources)
      .values({
        id: resourceId,
        organizationId,
        name: data.name,
        createdBy: userId,
      })
      .returning();

    return resource as ResourceData;
  }

  static async findAll(organizationId: string): Promise<ResourceData[]> {
    const resources = await db
      .select()
      .from(schema.resources)
      .where(
        and(
          eq(schema.resources.organizationId, organizationId),
          isNull(schema.resources.deletedAt)
        )
      )
      .orderBy(schema.resources.name);

    return resources as ResourceData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<ResourceData> {
    const resource = await ResourceService.findById(id, organizationId);
    if (!resource) {
      throw new ResourceNotFoundError(id);
    }
    return resource;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateResourceInput
  ): Promise<ResourceData> {
    const { userId, ...data } = input;

    const existing = await ResourceService.findById(id, organizationId);
    if (!existing) {
      throw new ResourceNotFoundError(id);
    }

    const [updated] = await db
      .update(schema.resources)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.resources.id, id),
          eq(schema.resources.organizationId, organizationId)
        )
      )
      .returning();

    return updated as ResourceData;
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedResourceData> {
    const existing = await ResourceService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new ResourceNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new ResourceAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.resources)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.resources.id, id),
          eq(schema.resources.organizationId, organizationId)
        )
      )
      .returning();

    return deleted as DeletedResourceData;
  }
}
```

#### 2.6 Criar Controller

**Arquivo:** `src/modules/{domain}/{module-name}/index.ts`

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
import {
  createResourceResponseSchema,
  createResourceSchema,
  deleteResourceResponseSchema,
  getResourceResponseSchema,
  idParamSchema,
  listResourcesResponseSchema,
  updateResourceResponseSchema,
  updateResourceSchema,
} from "./{module-name}.model";
import { ResourceService } from "./{module-name}.service";

export const resourceController = new Elysia({
  name: "resources",
  prefix: "/v1/resources",                      // Flat route with /v1/ prefix
  detail: { tags: ["{Domain} - Resources"] },   // Grouped in OpenAPI docs
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await ResourceService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { resource: ["create"] },
        requireOrganization: true,
      },
      body: createResourceSchema,
      response: {
        200: createResourceResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Create resource",
        description: "Creates a new resource for the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session }) =>
      wrapSuccess(
        await ResourceService.findAll(session.activeOrganizationId as string)
      ),
    {
      auth: {
        permissions: { resource: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: listResourcesResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List resources",
        description: "Lists all resources for the active organization",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await ResourceService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { resource: ["read"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: getResourceResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get resource",
        description: "Gets a specific resource by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await ResourceService.update(
          params.id,
          session.activeOrganizationId as string,
          {
            ...body,
            userId: user.id,
          }
        )
      ),
    {
      auth: {
        permissions: { resource: ["update"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      body: updateResourceSchema,
      response: {
        200: updateResourceResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update resource",
        description: "Updates a specific resource by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await ResourceService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { resource: ["delete"] },
        requireOrganization: true,
      },
      params: idParamSchema,
      response: {
        200: deleteResourceResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Delete resource",
        description: "Soft deletes a specific resource by ID",
      },
    }
  );
```

#### 2.7 Registrar Controller

**Arquivos:** `src/index.ts` e `src/test/helpers/app.ts`

> **IMPORTANTE**: Controllers são registrados **diretamente** no app principal, não aninhados em módulos pai.

```typescript
// src/index.ts
import { resourceController } from "./modules/{domain}/resources";

const app = new Elysia()
  // ... plugins e outros controllers
  .use(resourceController)  // Registrar diretamente
  // ...
```

```typescript
// src/test/helpers/app.ts
import { resourceController } from "@/modules/{domain}/resources";

export function createTestApp() {
  return new Elysia()
    // ... plugins e outros controllers
    .use(resourceController)  // Mesmo padrão do app principal
    // ...
}
```

> **ATENÇÃO**: Adicionar import E `.use()` simultaneamente para evitar que o linter remova o import.

---

### Fase 3: Testes

#### 3.1 Estrutura dos Testes

Criar 5 arquivos de teste:

| Arquivo | Endpoint | Testes Mínimos |
|---------|----------|----------------|
| `create-{resource}.test.ts` | POST | 6-8 testes |
| `list-{resources}.test.ts` | GET (lista) | 5-7 testes |
| `get-{resource}.test.ts` | GET /:id | 5-6 testes |
| `update-{resource}.test.ts` | PUT /:id | 5-6 testes |
| `delete-{resource}.test.ts` | DELETE /:id | 6-7 testes |

#### 3.2 Cobertura Obrigatória

Cada endpoint deve testar:

- [ ] Rejeitar requisição sem autenticação (401)
- [ ] Rejeitar usuário sem organização ativa (403) `NO_ACTIVE_ORGANIZATION`
- [ ] Rejeitar usuário sem permissão - viewer, supervisor (403) `FORBIDDEN`
- [ ] Happy path (200)

Testes específicos por operação:

**CREATE:**
- [ ] Rejeitar campos obrigatórios ausentes (422)
- [ ] Rejeitar validação de formato (422)
- [ ] Permitir manager criar

**GET /:id / UPDATE / DELETE:**
- [ ] Rejeitar recurso inexistente (404)
- [ ] Rejeitar recurso de outra organização (404)

**DELETE:**
- [ ] Rejeitar recurso já deletado (404) `RESOURCE_ALREADY_DELETED`

**LIST:**
- [ ] Retornar lista vazia
- [ ] Não retornar recursos deletados
- [ ] Não retornar recursos de outra organização
- [ ] Permitir viewer listar

#### 3.3 Template de Teste

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { ResourceService } from "../{module-name}.service";

const BASE_URL = env.API_URL;

describe("{METHOD} /v1/{resources}", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/{resources}`, {
        method: "{METHOD}",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/{resources}`, {
        method: "{METHOD}",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  // ... demais testes
});
```

#### 3.4 Test Helpers

Para reduzir boilerplate nos testes, utilize os helpers em `src/test/helpers/`.

**Helpers Disponíveis:**

| Helper | Arquivo | Uso |
|--------|---------|-----|
| `createTestBranch` | `branch.ts` | Criar filiais para testes |
| `createTestSector` | `sector.ts` | Criar setores para testes |
| `createTestCostCenter` | `cost-center.ts` | Criar centros de custo |
| `createTestJobPosition` | `job-position.ts` | Criar funções/cargos |
| `createTestJobClassification` | `job-classification.ts` | Criar CBOs |
| `createTestEmployee` | `employee.ts` | Criar funcionários (com dependências) |

**Quando criar um novo helper:**

1. O módulo tem muitos campos obrigatórios (ex: employee tem ~20)
2. Múltiplos testes precisam criar o recurso como setup
3. O recurso tem dependências (FKs) que também precisam ser criadas

**Estrutura de um helper:**

```typescript
// src/test/helpers/{resource}.ts
import { faker } from "@/test/helpers/faker"; // pt-BR configurado
import { ResourceService } from "@/modules/{domain}/{resource}/{resource}.service";

interface CreateTestResourceOptions {
  organizationId: string;
  userId: string;
  name?: string; // Sobrescritas opcionais
}

export async function createTestResource(
  options: CreateTestResourceOptions
) {
  const { organizationId, userId, name } = options;

  return ResourceService.create({
    organizationId,
    userId,
    name: name ?? faker.company.name(),
  });
}
```

**Usando Faker (pt-BR):**

```typescript
import { faker } from "@/test/helpers/faker";

// Dados brasileiros
faker.person.fullName();        // "João da Silva"
faker.location.city();          // "São Paulo"
faker.location.state();         // "SP"
faker.location.zipCode();       // "01234-567"
faker.phone.number("###########"); // "11999999999"
```

**Princípio importante - quando usar helpers vs API:**

```typescript
// ✅ Usar helper: quando o recurso é apenas setup (não é o foco do teste)
const { employee } = await createTestEmployee({ organizationId, userId });

// Testar o DELETE do employee
const response = await app.handle(
  new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
    method: "DELETE",
    headers,
  })
);

// ❌ NÃO usar helper: quando testar a criação via API É o objetivo
// Em create-employee.test.ts, testar o endpoint POST diretamente
const response = await app.handle(
  new Request(`${BASE_URL}/v1/employees`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(employeeData),
  })
);
```

**Verificar helpers existentes antes de criar:**

```bash
# Listar helpers disponíveis
ls src/test/helpers/

# Verificar se já existe helper para o recurso
cat src/test/helpers/{resource}.ts
```

---

### Fase 4: Verificação

#### 4.1 Executar Verificações

```bash
# Verificar tipos e lint
bun run check

# Executar testes do módulo
SKIP_INTEGRATION_TESTS=true bun test src/modules/{domain}/{module-name}

# Executar todos os testes
SKIP_INTEGRATION_TESTS=true bun test
```

#### 4.2 Checklist Final

- [ ] `bun run check` passa sem erros
- [ ] Todos os testes do módulo passam
- [ ] Todos os testes do projeto passam
- [ ] Endpoints aparecem na documentação OpenAPI

---

## Padrões Importantes

### IDs de Recursos

```typescript
const resourceId = `{resource}-${crypto.randomUUID()}`;
// Exemplo: sector-550e8400-e29b-41d4-a716-446655440000
```

### Soft Delete

- Usar `deletedAt` timestamp (não status)
- Queries de listagem filtram `isNull(schema.resources.deletedAt)`
- Método `findByIdIncludingDeleted` para verificar se já foi deletado
- Retornar `DeletedResourceData` no delete (inclui deletedAt e deletedBy)

### Permissões por Role

| Role | create | read | update | delete |
|------|--------|------|--------|--------|
| owner | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | ✅ | ✅ | ✅ |
| supervisor | ❌ | ✅ | ❌ | ❌ |
| viewer | ❌ | ✅ | ❌ | ❌ |

### Imports no Schema Index

> **ATENÇÃO**: O linter remove imports não utilizados automaticamente.

Sempre adicionar import E uso no mesmo edit:

```typescript
// ❌ ERRADO - linter vai remover
import { resources } from "./resources";  // Adicionado primeiro

// ... depois tentar usar

// ✅ CORRETO - adicionar tudo junto
import { resources } from "./resources";

export const schema = {
  resources,  // Uso imediato
};
```

---

## Relacionamentos Expandidos

Quando uma entidade possui relacionamentos com outras entidades (foreign keys), as respostas da API devem retornar **objetos expandidos** `{ id, name }` em vez de apenas IDs.

### Quando Aplicar

| Situação | Resposta |
|----------|----------|
| Entidade raiz (sem FKs além de `organizationId`) | Retornar campos como estão |
| Entidade com FKs para outras entidades | Retornar objetos `{ id, name }` |

**Exemplos:**

```typescript
// ❌ ANTES - apenas IDs
{
  "id": "employee-123",
  "sectorId": "sector-1",
  "jobPositionId": "job-pos-1"
}

// ✅ DEPOIS - objetos expandidos
{
  "id": "employee-123",
  "sector": { "id": "sector-1", "name": "TI" },
  "jobPosition": { "id": "job-pos-1", "name": "Desenvolvedor" }
}
```

### Implementação no Model

**Arquivo:** `src/modules/{domain}/{module-name}/{module-name}.model.ts`

Usar `entityReferenceSchema` de `@/lib/schemas/relationships`:

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

// Schema de entrada (ainda recebe IDs)
export const createResourceSchema = z.object({
  name: z.string().min(1).describe("Nome"),
  sectorId: z.string().min(1).describe("ID do setor"),        // Entrada: ID
  branchId: z.string().optional().describe("ID da filial"),   // Opcional
});

// Schema de dados (resposta com objetos expandidos)
const resourceDataSchema = z.object({
  id: z.string().describe("ID do recurso"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome"),

  // Relacionamentos expandidos (objetos { id, name })
  sector: entityReferenceSchema.describe("Setor"),                    // Obrigatório
  branch: entityReferenceSchema.nullable().describe("Filial"),        // Opcional

  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});
```

> **IMPORTANTE**: O schema de entrada (`createResourceSchema`) continua recebendo IDs. Apenas o schema de resposta (`resourceDataSchema`) usa objetos expandidos.

### Implementação no Service

**Arquivo:** `src/modules/{domain}/{module-name}/{module-name}.service.ts`

Usar o padrão `enrichEntity` para buscar as referências:

```typescript
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

type ResourceRaw = typeof schema.resources.$inferSelect;
type EntityReference = { id: string; name: string };

export abstract class ResourceService {
  // Métodos para buscar referências de cada relacionamento
  private static async getSectorReference(
    sectorId: string,
    organizationId: string
  ): Promise<EntityReference | null> {
    const [sector] = await db
      .select({
        id: schema.sectors.id,
        name: schema.sectors.name,
      })
      .from(schema.sectors)
      .where(
        and(
          eq(schema.sectors.id, sectorId),
          eq(schema.sectors.organizationId, organizationId),
          isNull(schema.sectors.deletedAt)
        )
      )
      .limit(1);

    return sector ?? null;
  }

  private static async getBranchReference(
    branchId: string,
    organizationId: string
  ): Promise<EntityReference | null> {
    const [branch] = await db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
      })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.id, branchId),
          eq(schema.branches.organizationId, organizationId),
          isNull(schema.branches.deletedAt)
        )
      )
      .limit(1);

    return branch ?? null;
  }

  // Método para enriquecer a entidade com relacionamentos
  private static async enrichResource(
    resource: ResourceRaw,
    organizationId: string
  ): Promise<ResourceData> {
    // Buscar relacionamentos em paralelo
    const [sector, branch] = await Promise.all([
      // Obrigatório: sempre buscar
      ResourceService.getSectorReference(resource.sectorId, organizationId),
      // Opcional: só buscar se existir
      resource.branchId
        ? ResourceService.getBranchReference(resource.branchId, organizationId)
        : Promise.resolve(null),
    ]);

    return {
      id: resource.id,
      organizationId: resource.organizationId,
      name: resource.name,
      sector: sector ?? { id: resource.sectorId, name: "" },  // Fallback para obrigatório
      branch,  // Nullable - pode ser null
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    };
  }

  // Usar enrichResource em todos os métodos que retornam dados
  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<ResourceData> {
    const resource = await ResourceService.findById(id, organizationId);
    if (!resource) {
      throw new ResourceNotFoundError(id);
    }
    return ResourceService.enrichResource(resource, organizationId);
  }

  static async findAll(organizationId: string): Promise<ResourceData[]> {
    const resources = await db
      .select()
      .from(schema.resources)
      .where(
        and(
          eq(schema.resources.organizationId, organizationId),
          isNull(schema.resources.deletedAt)
        )
      )
      .orderBy(schema.resources.name);

    // Enriquecer todos os registros
    return Promise.all(
      resources.map((r) => ResourceService.enrichResource(r, organizationId))
    );
  }

  static async create(input: CreateResourceInput): Promise<ResourceData> {
    // ... criar registro ...
    const [resource] = await db.insert(schema.resources).values({...}).returning();

    // Enriquecer antes de retornar
    return ResourceService.enrichResource(resource, organizationId);
  }
}
```

### Relacionamentos Obrigatórios vs Opcionais

| Tipo | Schema | Service | Fallback |
|------|--------|---------|----------|
| **Obrigatório** | `entityReferenceSchema` | Sempre buscar | `{ id, name: "" }` |
| **Opcional** | `entityReferenceSchema.nullable()` | Buscar só se ID existir | `null` |

```typescript
// No enrichResource:
const [sector, branch] = await Promise.all([
  // Obrigatório - sempre busca
  ResourceService.getSectorReference(resource.sectorId, organizationId),
  // Opcional - só busca se ID existir
  resource.branchId
    ? ResourceService.getBranchReference(resource.branchId, organizationId)
    : Promise.resolve(null),
]);

return {
  // Obrigatório com fallback
  sector: sector ?? { id: resource.sectorId, name: "" },
  // Opcional - mantém null
  branch,
};
```

### Testes com Relacionamentos Expandidos

Atualizar assertions para verificar objetos em vez de IDs:

```typescript
// ❌ ANTES
expect(body.data.sectorId).toBe(dependencies.sectorId);

// ✅ DEPOIS
expect(body.data.sector).toBeObject();
expect(body.data.sector.id).toBe(dependencies.sectorId);
expect(body.data.sector.name).toBeString();

// Para relacionamentos opcionais
expect(body.data.branch).toBeNull();
// ou
expect(body.data.branch?.id).toBe(dependencies.branchId);
```

### Módulos de Referência

| Módulo | Relacionamentos | Arquivo |
|--------|----------------|---------|
| `employees` | sector, jobPosition, jobClassification, branch?, costCenter? | `src/modules/employees/` |
| `ppe-deliveries` | employee | `src/modules/occurrences/ppe-deliveries/` |
| `promotions` | employee, previousJobPosition, newJobPosition | `src/modules/occurrences/promotions/` |
| `absences` | employee | `src/modules/occurrences/absences/` |

---

## Ordem de Implementação (Resumo)

1. **Schema DB** → `src/db/schema/{module}.ts`
2. **Exports do Schema** → `src/db/schema/index.ts`
3. **Migration** → `bun db:generate && bun db:push`
4. **Diretório** → `mkdir -p src/modules/{domain}/{module}/__tests__`
5. **Erros** → `src/modules/{domain}/{module}/errors.ts`
6. **Permissões** → `src/lib/permissions.ts`
7. **Model** → `src/modules/{domain}/{module}/{module}.model.ts`
8. **Service** → `src/modules/{domain}/{module}/{module}.service.ts`
9. **Controller** → `src/modules/{domain}/{module}/index.ts`
10. **Registro** → `src/index.ts` e `src/test/helpers/app.ts`
11. **Testes** → `src/modules/{domain}/{module}/__tests__/*.test.ts`
12. **Verificação** → `bun run check && bun test`
