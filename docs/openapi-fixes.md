# OpenAPI Schema - Configuração e Integração com Orval

## Contexto

O frontend utiliza [Orval](https://orval.dev) para gerar hooks React Query a partir do OpenAPI. O Zod 4 gera JSON Schema 2020-12 por padrão, que pode causar incompatibilidades com OpenAPI 3.0.x.

## Problemas Identificados e Soluções

### 1. `z.date()` e `z.coerce.date()` não são representáveis

**Problema:** No Zod 4, esses tipos estão na lista de "unrepresentable" e falham silenciosamente na conversão para JSON Schema.

**Campos afetados:** `createdAt`, `updatedAt`, `deletedAt`

**Solução (Backend):** Configurar `mapJsonSchema` no plugin OpenAPI:

```typescript
// src/index.ts
.use(
  openapi({
    mapJsonSchema: {
      zod: (schema: z.ZodType) =>
        z.toJSONSchema(schema, {
          unrepresentable: "any",
          override: (ctx) => {
            if (ctx.zodSchema._zod.def.type === "date") {
              ctx.jsonSchema.type = "string";
              ctx.jsonSchema.format = "date-time";
            }
          },
        }),
    },
    // ...
  })
)
```

**Resultado:** Campos de data são documentados como `{ type: "string", format: "date-time" }`.

---

### 2. `$schema` presente nos schemas (opcional)

**Problema:** Zod 4 gera JSON Schema 2020-12 com campo `$schema`, que OpenAPI 3.0.x não suporta.

**Solução (Backend):** Remover no `override` se necessário:

```typescript
override: (ctx) => {
  const { $schema: _, ...cleanSchema } = ctx.jsonSchema;
  ctx.jsonSchema = cleanSchema;
  // ... resto do override
}
```

**Nota:** Esta remoção só é necessária se o Orval ou outras ferramentas gerarem warnings.

---

### 3. Nullable usa `anyOf` em vez de `nullable`

**Campos afetados:** `complement`, `phone`, `foundedAt`, etc.

**Problema:**
```json
{
  "complement": {
    "anyOf": [{"type": "string"}, {"type": "null"}]
  }
}
```

**Causa:** JSON Schema 2020-12 usa `anyOf` com `type: "null"`. OpenAPI 3.0.x usa `nullable: true`.

**Status:** O Orval moderno (v7+) lida com ambos os formatos corretamente.

---

## Configuração do Backend

### Arquivo: `src/index.ts`

```typescript
import { z } from "zod";

// ...

.use(
  openapi({
    mapJsonSchema: {
      zod: (schema: z.ZodType) =>
        z.toJSONSchema(schema, {
          unrepresentable: "any",
          override: (ctx) => {
            // Converte z.date() e z.coerce.date() para formato OpenAPI
            if (ctx.zodSchema._zod.def.type === "date") {
              ctx.jsonSchema.type = "string";
              ctx.jsonSchema.format = "date-time";
            }
          },
        }),
    },
    documentation: {
      info: {
        title: "Synnerdata API",
        version: "1.0.0",
      },
      components: await OpenAPI.components,
      paths: await OpenAPI.getPaths(),
    },
  })
)
```

### Trade-offs da Abordagem

| Prós | Contras |
|------|---------|
| Centralizado (um lugar só) | Depende de API interna (`_zod.def.type`) |
| Não muda schemas existentes | Pode quebrar em updates do Zod |
| Mantém tipagem `Date` no TypeScript | Lógica "escondida" no index.ts |
| Validação de runtime funciona | — |

---

## Configuração do Frontend (Orval)

### Configuração Básica

```typescript
// orval.config.ts
import { defineConfig } from "orval";

export default defineConfig({
  synnerdata: {
    input: {
      target: "http://localhost:3333/openapi/json",
    },
    output: {
      target: "./src/api/generated.ts",
      client: "react-query",
      mode: "split",
    },
  },
});
```

### Tipos Gerados

Por padrão, campos `date-time` viram `string`:

```typescript
interface BranchData {
  id: string;
  name: string;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}
```

### Opção: Usar `Date` no TypeScript

Se preferir tipagem `Date`, configure `useDates` com um reviver:

```typescript
// orval.config.ts
export default defineConfig({
  synnerdata: {
    output: {
      override: {
        useDates: true,
        fetch: {
          jsonReviver: {
            path: "./src/api/date-reviver.ts",
            name: "dateReviver",
          },
        },
      },
    },
  },
});
```

```typescript
// src/api/date-reviver.ts
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export const dateReviver = (key: string, value: unknown) => {
  if (typeof value === "string" && ISO_DATE_REGEX.test(value)) {
    return new Date(value);
  }
  return value;
};
```

---

## Transformer (Opcional)

Se ainda houver problemas de compatibilidade, use um transformer no Orval:

```typescript
// orval.config.ts
input: {
  target: "http://localhost:3333/openapi/json",
  override: {
    transformer: "./src/api/openapi-transformer.js",
  },
},
```

```javascript
// src/api/openapi-transformer.js
function deepRemove(obj, keysToRemove) {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepRemove(item, keysToRemove));

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!keysToRemove.includes(key)) {
      result[key] = deepRemove(value, keysToRemove);
    }
  }
  return result;
}

function convertAnyOfToNullable(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(convertAnyOfToNullable);

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "anyOf" && Array.isArray(value)) {
      const nullType = value.find((t) => t.type === "null");
      const nonNullType = value.find((t) => t.type !== "null");

      if (nullType && nonNullType && value.length === 2) {
        Object.assign(result, convertAnyOfToNullable(nonNullType), { nullable: true });
        continue;
      }
    }
    result[key] = convertAnyOfToNullable(value);
  }
  return result;
}

module.exports = (spec) => {
  let result = spec;
  result = deepRemove(result, ["$schema"]);
  result = convertAnyOfToNullable(result);
  return result;
};
```

---

## Referências

- [Zod 4 - JSON Schema](https://zod.dev/json-schema)
- [Orval - Configuration](https://orval.dev/reference/configuration/output)
- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.3)

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2025-12-25 | Atualizado com solução no backend via `mapJsonSchema.override` |
| — | Documentado trade-offs e alternativas |
| — | Adicionado configuração do Orval com `useDates` |
