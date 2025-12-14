# API Maturity Plan

> Plano de melhorias para tornar a API madura, segura e escalável.
>
> **Última atualização:** 2025-12-14
> **Status Fase 1:** 50% completo (3/6 itens) ✅ Request Size Limit | ✅ Health Check | ✅ Logger Estruturado

## Visão Geral

Este documento detalha as funcionalidades e ferramentas necessárias para elevar a maturidade da API, organizadas por prioridade e área.

**Progresso Atual:**
- **Fase 1 (Fundação & Observabilidade):** 50% completo - Ver [Seção 7](#7-status-de-implementação---fase-1)
- **Fase 2-4:** Não iniciadas

**Próximas ações recomendadas:**
1. ⚡ Completar Error Sanitization (~15min)
2. ⚡ Adicionar Security Headers (~15min)
3. 🔒 Implementar Rate Limiting (~1-2h)

---

## 1. Segurança

### 1.1 Rate Limiting (Prioridade: Alta)

**Problema:** Atualmente não há proteção contra abuso de endpoints.

**Solução:** Estratégia de duas camadas utilizando ferramentas existentes no ecossistema.

#### Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Requisição                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
  /auth/api/*                                   /v1/*
        │                                           │
        ▼                                           ▼
┌───────────────────┐                     ┌───────────────────┐
│  Better Auth      │                     │  elysia-rate-limit│
│  Rate Limit       │                     │  Plugin           │
│  (built-in)       │                     │                   │
└───────────────────┘                     └───────────────────┘
```

#### Por que duas camadas?

O rate limiting do Better Auth **só protege rotas de autenticação** (`/auth/api/*`). Rotas autenticadas como `/v1/employees` usam apenas `auth.api.getSession()` para validar o token, que é uma consulta ao banco/cache **sem passar pelo rate limiter**.

| Endpoint                           | Camada            | Motivo                         |
| ---------------------------------- | ----------------- | ------------------------------ |
| `POST /auth/api/sign-in/email`     | Better Auth       | Passa pelo `auth.handler`      |
| `POST /auth/api/two-factor/verify` | Better Auth       | Passa pelo `auth.handler`      |
| `GET /v1/employees`                | elysia-rate-limit | Usa `getSession()` diretamente |
| `POST /v1/payments/checkout`       | elysia-rate-limit | Usa `getSession()` diretamente |

#### Camada 1: Better Auth (Autenticação)

**Localização:** `src/lib/auth.ts`

```typescript
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // ... existing config
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "database", // Compartilha estado entre instâncias
    modelName: "rateLimit",
    customRules: {
      "/sign-in/*": { window: 900, max: 5 }, // 5 tentativas / 15min
      "/sign-up/*": { window: 60, max: 3 }, // 3 cadastros / min
      "/two-factor/*": { window: 60, max: 3 }, // 3 tentativas / min
      "/forgot-password/*": { window: 300, max: 3 }, // 3 / 5min
      "/get-session": false, // Sem limite (chamado frequentemente)
    },
  },
});
```

**Migração necessária:**

```bash
npx @better-auth/cli migrate
```

#### Camada 2: elysia-rate-limit (API)

**Instalação:**

```bash
bun add elysia-rate-limit
```

**Localização:** `src/index.ts`

```typescript
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";

const app = new Elysia()
  // Rate limit global para API
  .use(
    rateLimit({
      duration: 60_000, // 1 minuto
      max: 100, // 100 requests/min por IP
      headers: true, // Adiciona headers RateLimit-*
      skip: (request) => {
        const url = new URL(request.url);
        // Skip para health checks e rotas do Better Auth
        return (
          url.pathname === "/health" || url.pathname.startsWith("/auth/api")
        );
      },
    })
  );
```

#### Rate Limiting por Tier (Scoped)

Para endpoints sensíveis, usar scoped rate limiting:

```typescript
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";

// Módulo de exports com limite estrito
const exportRoutes = new Elysia({ prefix: "/v1/exports" })
  .use(
    rateLimit({
      scoping: "scoped",
      duration: 3600_000, // 1 hora
      max: 5, // 5 exports/hora
    })
  )
  .get("/employees", exportEmployeesHandler)
  .get("/payroll", exportPayrollHandler);

// Módulo de dados sensíveis
const sensitiveRoutes = new Elysia({ prefix: "/v1/employees" })
  .use(
    rateLimit({
      scoping: "scoped",
      duration: 60_000, // 1 minuto
      max: 20, // 20 requests/min
    })
  )
  .get("/:id/documents", getDocumentsHandler)
  .get("/:id/medical", getMedicalHandler);
```

#### Skip para Usuários Premium (Opcional)

```typescript
import { rateLimit } from "elysia-rate-limit";

rateLimit({
  duration: 60_000,
  max: 100,
  skip: async (request) => {
    // Verificar se é usuário premium via header ou token
    const apiKey = request.headers.get("X-API-Key");
    if (apiKey) {
      const isPremium = await checkPremiumStatus(apiKey);
      return isPremium;
    }
    return false;
  },
});
```

#### Configuração de Produção com Redis

Para ambientes com múltiplas instâncias, implementar custom context com Redis:

```typescript
import { rateLimit } from "elysia-rate-limit";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

// Custom context para Redis (implementação futura)
// Por ora, o DefaultContext com LRU cache atende bem para single instance
rateLimit({
  duration: 60_000,
  max: 100,
  context: new DefaultContext(50_000), // 50k clientes únicos em memória
});
```

#### Tiers Recomendados

| Tier        | Duration     | Max | Uso                                  |
| ----------- | ------------ | --- | ------------------------------------ |
| `default`   | 60s          | 100 | Rotas gerais da API                  |
| `auth`      | 900s (15min) | 5   | Login, 2FA (Better Auth)             |
| `sensitive` | 60s          | 20  | Dados médicos, documentos            |
| `export`    | 3600s (1h)   | 5   | Downloads, relatórios                |
| `webhook`   | -            | -   | Sem limite (validação por signature) |

#### Headers de Resposta

Ambas as camadas adicionam headers padrão:

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1702500000
Retry-After: 45  (apenas quando limitado)
```

#### Resposta quando Limitado (429)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests"
  }
}
```

**Esforço estimado:** 1h (usando plugins existentes)

**Dependências:**

```bash
bun add elysia-rate-limit
```

---

### 1.2 Audit Log (Prioridade: Alta)

**Problema:** Dados de funcionários exigem rastreabilidade para compliance trabalhista e LGPD.

**Solução:** Estratégia híbrida utilizando Better Auth hooks + Elysia plugin.

#### Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                      Audit Log Strategy                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │  Better Auth    │    │  Elysia Plugin  │                    │
│  │  databaseHooks  │    │  auditPlugin    │                    │
│  └────────┬────────┘    └────────┬────────┘                    │
│           │                      │                              │
│           ▼                      ▼                              │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ Auth Events     │    │ API Events      │                    │
│  │ • user.create   │    │ • employee.crud │                    │
│  │ • user.update   │    │ • medical.read  │                    │
│  │ • session.*     │    │ • export.*      │                    │
│  │ • org.*         │    │ • payment.*     │                    │
│  └────────┬────────┘    └────────┬────────┘                    │
│           │                      │                              │
│           └──────────┬───────────┘                              │
│                      ▼                                          │
│           ┌─────────────────────┐                              │
│           │   audit_logs table  │                              │
│           │   (Drizzle Schema)  │                              │
│           └─────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

#### Por que estratégia híbrida?

| Camada            | Eventos                               | Vantagem                              |
| ----------------- | ------------------------------------- | ------------------------------------- |
| Better Auth Hooks | Login, logout, user CRUD, org changes | Contexto nativo (session, userId)     |
| Elysia Plugin     | Employee, medical, exports, payments  | Flexibilidade total, acesso a request |

#### Camada 1: Schema Drizzle (Storage)

**Localização:** `src/db/schema/audit.ts`

```typescript
import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    userId: text("user_id").notNull(),
    action: text("action").notNull(), // create, read, update, delete, export, login, logout
    resource: text("resource").notNull(), // user, session, employee, medical_leave, etc.
    resourceId: text("resource_id"),
    changes: jsonb("changes"), // { before, after }
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_org_date").on(table.organizationId, table.createdAt),
    index("idx_audit_resource").on(table.resource, table.resourceId),
    index("idx_audit_user").on(table.userId, table.createdAt),
  ]
);
```

#### Camada 2: Audit Service (Shared)

**Localização:** `src/modules/audit/audit.service.ts`

```typescript
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit";

interface AuditLogEntry {
  action: string;
  resource: string;
  resourceId?: string;
  userId: string;
  organizationId?: string | null;
  changes?: { before?: unknown; after?: unknown };
  ipAddress?: string | null;
  userAgent?: string | null;
}

export abstract class AuditService {
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        id: `audit-${Bun.randomUUIDv7()}`,
        organizationId: entry.organizationId ?? null,
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        changes: entry.changes ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      });
    } catch (error) {
      // Log failure should not break the main operation
      console.error("Audit log failed:", error);
    }
  }
}
```

#### Camada 3: Better Auth Hooks (Auth Events)

**Localização:** `src/lib/auth.ts` (adicionar aos hooks existentes)

```typescript
import { betterAuth } from "better-auth";
import { AuditService } from "@/modules/audit/audit.service";

export const auth = betterAuth({
  // ... existing config
  databaseHooks: {
    user: {
      create: {
        // ... existing before hook
        after: async (user, ctx) => {
          await AuditService.log({
            action: "create",
            resource: "user",
            resourceId: user.id,
            userId: ctx.context.session?.userId ?? user.id,
            organizationId: null,
            changes: {
              after: { id: user.id, email: user.email, name: user.name },
            },
          });
        },
      },
      update: {
        after: async (user, ctx) => {
          await AuditService.log({
            action: "update",
            resource: "user",
            resourceId: user.id,
            userId: ctx.context.session?.userId ?? user.id,
            organizationId: ctx.context.session?.activeOrganizationId,
          });
        },
      },
    },
    session: {
      create: {
        // ... existing before hook
        after: async (session) => {
          await AuditService.log({
            action: "login",
            resource: "session",
            resourceId: session.id,
            userId: session.userId,
            organizationId: session.activeOrganizationId,
          });
        },
      },
      delete: {
        after: async (session) => {
          await AuditService.log({
            action: "logout",
            resource: "session",
            resourceId: session.id,
            userId: session.userId,
            organizationId: session.activeOrganizationId,
          });
        },
      },
    },
  },
  plugins: [
    // ... existing plugins
    organization({
      // ... existing config
      organizationHooks: {
        afterCreateOrganization: async ({ organization: org, member }) => {
          // ... existing trial creation logic
          await AuditService.log({
            action: "create",
            resource: "organization",
            resourceId: org.id,
            userId: member.userId,
            organizationId: org.id,
            changes: { after: { id: org.id, name: org.name } },
          });
        },
      },
    }),
  ],
});
```

#### Camada 4: Elysia Plugin (API Events)

**Localização:** `src/plugins/audit.plugin.ts`

```typescript
import { Elysia } from "elysia";
import { AuditService } from "@/modules/audit/audit.service";

interface AuditEntry {
  action: "create" | "read" | "update" | "delete" | "export";
  resource: string;
  resourceId?: string;
  changes?: { before?: unknown; after?: unknown };
}

export const auditPlugin = new Elysia({ name: "audit" })
  .derive({ as: "scoped" }, ({ request, user, session }) => ({
    audit: async (entry: AuditEntry) => {
      if (!user) return;

      await AuditService.log({
        ...entry,
        userId: user.id,
        organizationId: session?.activeOrganizationId ?? null,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0],
        userAgent: request.headers.get("user-agent"),
      });
    },
  }))
  .as("scoped");
```

#### Uso no Controller

```typescript
import { auditPlugin } from "@/plugins/audit.plugin";

export const employeeController = new Elysia()
  .use(auditPlugin)
  .post("/", async ({ body, audit }) => {
    const employee = await EmployeeService.create(body);

    await audit({
      action: "create",
      resource: "employee",
      resourceId: employee.id,
      changes: { after: employee },
    });

    return { success: true, data: employee };
  })
  .get("/:id", async ({ params, audit }) => {
    const employee = await EmployeeService.getById(params.id);

    // Audit read de dados sensíveis
    await audit({
      action: "read",
      resource: "employee",
      resourceId: params.id,
    });

    return { success: true, data: employee };
  });
```

#### Eventos Auditados

| Camada        | Resource        | Actions                      |
| ------------- | --------------- | ---------------------------- |
| Better Auth   | `user`          | create, update, delete       |
| Better Auth   | `session`       | login, logout                |
| Better Auth   | `organization`  | create, update, delete       |
| Better Auth   | `member`        | create, update, delete       |
| Elysia Plugin | `employee`      | create, read, update, delete |
| Elysia Plugin | `medical_leave` | create, read, update, delete |
| Elysia Plugin | `document`      | create, read, delete         |
| Elysia Plugin | `export`        | export                       |
| Elysia Plugin | `subscription`  | create, update, cancel       |

#### Consulta de Audit Logs

```typescript
// src/modules/audit/audit.service.ts (adicionar)
import { desc, eq, and, gte, lte } from "drizzle-orm";

export abstract class AuditService {
  // ... log method

  static async getByOrganization(
    organizationId: string,
    options?: {
      resource?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ) {
    const conditions = [eq(auditLogs.organizationId, organizationId)];

    if (options?.resource) {
      conditions.push(eq(auditLogs.resource, options.resource));
    }
    if (options?.startDate) {
      conditions.push(gte(auditLogs.createdAt, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(auditLogs.createdAt, options.endDate));
    }

    return db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);
  }

  static async getByResource(resource: string, resourceId: string) {
    return db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resource, resource),
          eq(auditLogs.resourceId, resourceId)
        )
      )
      .orderBy(desc(auditLogs.createdAt));
  }
}
```

#### Retenção de Dados

Para compliance LGPD, implementar política de retenção:

```typescript
// src/modules/audit/jobs/cleanup-audit-logs.ts
import { lt } from "drizzle-orm";

export async function cleanupOldAuditLogs(retentionDays: number = 365 * 5) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoffDate));

  return result.rowCount;
}
```

**Esforço estimado:** 4h

---

### 1.3 Criptografia de PII (Prioridade: Alta)

**Problema:** CPF, dados médicos e informações sensíveis devem ser criptografados em repouso (LGPD).

**Solução:** Utilitário de criptografia AES-256-GCM.

**Localização:** `src/shared/crypto/pii.ts`

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(env.PII_ENCRYPTION_KEY, "hex"); // 32 bytes

export const PII = {
  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString(
      "hex"
    )}`;
  },

  decrypt(ciphertext: string): string {
    const [ivHex, tagHex, encryptedHex] = ciphertext.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final("utf8");
  },

  mask: {
    cpf: (cpf: string) => `***.***.${cpf.slice(-6)}`,
    email: (email: string) => {
      const [local, domain] = email.split("@");
      return `${local[0]}***@${domain}`;
    },
    phone: (phone: string) => `****${phone.slice(-4)}`,
  },
};
```

**Variável de ambiente necessária:**

```bash
# Gerar: openssl rand -hex 32
PII_ENCRYPTION_KEY=your_32_byte_hex_key_here
```

**Campos que devem ser criptografados:**

| Tabela            | Campo          |
| ----------------- | -------------- |
| employees         | cpf, pis, rg   |
| medical_leaves    | diagnosis, cid |
| background_checks | result_details |
| lawsuits          | details        |

**Esforço estimado:** 3h

---

### 1.4 Validadores Brasileiros (Prioridade: Alta)

**Problema:** Validação de documentos brasileiros (CPF, CNPJ, PIS, CBO).

**Localização:** `src/shared/validators/brazilian.ts`

```typescript
import { z } from "zod";

function isValidCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, "");
  if (cleaned.length !== 11 || /^(\d)\1+$/.test(cleaned)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cleaned[i]) * (10 - i);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cleaned[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cleaned[i]) * (11 - i);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(cleaned[10]);
}

function isValidCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, "");
  if (cleaned.length !== 14 || /^(\d)\1+$/.test(cleaned)) return false;

  const calc = (digits: string, weights: number[]) => {
    const sum = digits
      .split("")
      .reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calc(cleaned.slice(0, 12), w1);
  const d2 = calc(cleaned.slice(0, 12) + d1, w2);

  return cleaned.endsWith(`${d1}${d2}`);
}

function isValidPIS(pis: string): boolean {
  const cleaned = pis.replace(/\D/g, "");
  if (cleaned.length !== 11) return false;

  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = cleaned
    .slice(0, 10)
    .split("")
    .reduce((acc, d, i) => acc + Number(d) * weights[i], 0);

  const remainder = sum % 11;
  const digit = remainder < 2 ? 0 : 11 - remainder;
  return digit === Number(cleaned[10]);
}

// Schemas Zod exportados
export const cpfSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(isValidCPF, { message: "CPF inválido" });

export const cnpjSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(isValidCNPJ, { message: "CNPJ inválido" });

export const pisSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(isValidPIS, { message: "PIS inválido" });

export const cboSchema = z.string().regex(/^\d{6}$/, "CBO deve ter 6 dígitos");

export const phoneBRSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: "Telefone inválido",
  });

export const currencyBRL = z
  .number()
  .int({ message: "Valor deve ser em centavos" })
  .nonnegative({ message: "Valor não pode ser negativo" });

// Re-exportar funções de validação para uso direto
export { isValidCPF, isValidCNPJ, isValidPIS };
```

**Esforço estimado:** 2h

---

### 1.5 Headers de Segurança (Prioridade: Média)

**Problema:** Headers de segurança HTTP não configurados.

**Solução:** Utilizar o método `.headers()` nativo do Elysia para headers estáticos (mais performático que hooks).

**Nota:** Não existe plugin tipo Helmet para Elysia. Implementação manual é necessária.

**Localização:** `src/index.ts`

```typescript
const isProduction = process.env.NODE_ENV === "production";

const app = new Elysia()
  // Headers de segurança estáticos (mais performático que onAfterHandle)
  .headers({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    // HSTS apenas em produção com HTTPS
    ...(isProduction && {
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    }),
  });
```

#### Headers Configurados

| Header                      | Valor                             | Proteção                       |
| --------------------------- | --------------------------------- | ------------------------------ |
| `X-Content-Type-Options`    | `nosniff`                         | Previne MIME sniffing          |
| `X-Frame-Options`           | `DENY`                            | Previne clickjacking           |
| `X-XSS-Protection`          | `1; mode=block`                   | Filtro XSS do navegador        |
| `Referrer-Policy`           | `strict-origin-when-cross-origin` | Controla vazamento de referrer |
| `Permissions-Policy`        | `geolocation=()...`               | Desativa APIs sensíveis        |
| `Strict-Transport-Security` | `max-age=31536000`                | Força HTTPS (produção)         |

#### Por que `.headers()` ao invés de plugin?

```typescript
// ❌ Menos performático - executa em cada request
.onAfterHandle({ as: "global" }, ({ set }) => {
  set.headers["X-Frame-Options"] = "DENY";
});

// ✅ Mais performático - define headers upfront
.headers({
  "X-Frame-Options": "DENY",
});
```

O método `.headers()` do Elysia define headers estaticamente, evitando mutação de objetos em cada request.

**Esforço estimado:** 15min (apenas adicionar configuração)

---

## 2. Observabilidade

### 2.1 Logger Estruturado (Prioridade: Alta) ✅ IMPLEMENTADO

**Status:** ✅ Implementado em `src/lib/logger/index.ts`

**Problema:** Logs não estruturados dificultam debugging e monitoramento.

**Solução:** Utilizar `@bogeychan/elysia-logger`, plugin oficial da comunidade baseado em **pino** (logger JSON mais rápido do ecossistema Node.js).

#### Por que @bogeychan/elysia-logger?

| Aspecto          | Plugin Existente                       | Implementação Custom       |
| ---------------- | -------------------------------------- | -------------------------- |
| **Base**         | pino (~5x mais rápido)                 | console.log/JSON.stringify |
| **Manutenção**   | Comunidade ativa                       | Própria                    |
| **Features**     | Auto-logging, multistream, serializers | Básico                     |
| **Integração**   | ctx.log nativo                         | derive manual              |
| **Pretty print** | pino-pretty (dev)                      | Manual                     |

#### Instalação

```bash
bun add @bogeychan/elysia-logger pino-pretty
```

#### Implementação

**Localização:** `src/plugins/logger.plugin.ts`

```typescript
import { Elysia } from "elysia";
import { createPinoLogger } from "@bogeychan/elysia-logger";

const isProduction = process.env.NODE_ENV === "production";

// Logger standalone para uso em services, hooks, etc.
export const logger = createPinoLogger({
  level: isProduction ? "info" : "debug",
  formatters: {
    level: (label) => ({ level: label }), // "level": "info" ao invés de número
  },
  // Pretty print apenas em dev
  transport: isProduction
    ? undefined
    : { target: "pino-pretty", options: { colorize: true } },
});

export const loggerPlugin = new Elysia({ name: "logger" })
  // Gerar request ID único
  .derive({ as: "global" }, () => ({
    requestId: `req-${Bun.randomUUIDv7()}`,
    requestStart: performance.now(),
  }))
  // Integrar pino ao contexto (ctx.log)
  .use(
    logger.into({
      autoLogging: {
        ignore: (ctx) => {
          const path = new URL(ctx.request.url).pathname;
          // Não logar health checks
          return path === "/health" || path === "/health/live";
        },
      },
    })
  )
  // Adicionar request ID no header de resposta
  .onAfterHandle({ as: "global" }, ({ set, requestId }) => {
    set.headers["X-Request-ID"] = requestId;
  })
  // Log customizado com métricas
  .onAfterResponse(
    { as: "global" },
    ({ log, requestId, requestStart, request, set, session }) => {
      const url = new URL(request.url);
      log.info({
        type: "http:request",
        requestId,
        method: request.method,
        path: url.pathname,
        query: url.search || undefined,
        status: set.status as number,
        durationMs: Math.round(performance.now() - requestStart),
        organizationId: session?.activeOrganizationId,
        userAgent: request.headers.get("user-agent"),
      });
    }
  )
  // Log de erros
  .onError({ as: "global" }, ({ log, error, requestId, request }) => {
    log.error({
      type: "http:error",
      requestId,
      path: new URL(request.url).pathname,
      error: {
        name: error.name,
        message: error.message,
        stack: isProduction ? undefined : error.stack,
      },
    });
  });
```

#### Uso no Application

```typescript
// src/index.ts
import { Elysia } from "elysia";
import { loggerPlugin } from "@/plugins/logger.plugin";

const app = new Elysia()
  .use(loggerPlugin)
  // ... outras configurações
  .listen(3000);
```

#### Uso em Services (Logger Standalone)

```typescript
// src/modules/payments/checkout/checkout.service.ts
import { logger } from "@/plugins/logger.plugin";

export abstract class CheckoutService {
  static async create(data: CreateCheckoutInput) {
    logger.info({
      type: "checkout:create",
      organizationId: data.organizationId,
    });

    try {
      const result = await PagarmeClient.createPaymentLink(data);
      logger.info({ type: "checkout:success", checkoutId: result.id });
      return result;
    } catch (error) {
      logger.error({ type: "checkout:error", error });
      throw error;
    }
  }
}
```

#### Uso em Controllers (ctx.log)

```typescript
// src/modules/employees/index.ts
export const employeeController = new Elysia().get(
  "/:id",
  async ({ params, log }) => {
    log.debug({ type: "employee:fetch", employeeId: params.id });

    const employee = await EmployeeService.getById(params.id);
    return { success: true, data: employee };
  }
);
```

#### Log para Múltiplos Destinos (Produção)

Para produção com log em arquivo:

```typescript
import { createPinoLogger, pino } from "@bogeychan/elysia-logger";

const isProduction = process.env.NODE_ENV === "production";

export const logger = createPinoLogger({
  level: isProduction ? "info" : "debug",
  // Em produção: log para stdout + arquivo
  stream: isProduction
    ? pino.multistream([
        { stream: process.stdout },
        { stream: pino.destination("./logs/app.log") },
      ])
    : undefined,
  // Em dev: pretty print
  transport: isProduction
    ? undefined
    : { target: "pino-pretty", options: { colorize: true } },
});
```

#### Output de Log (Produção)

```json
{
  "level": "info",
  "time": 1702500000000,
  "type": "http:request",
  "requestId": "req-01234567-89ab-cdef-0123-456789abcdef",
  "method": "GET",
  "path": "/v1/employees",
  "status": 200,
  "durationMs": 45,
  "organizationId": "org_abc123"
}
```

#### Output de Log (Desenvolvimento)

```
[12:00:00.000] INFO:
    type: "http:request"
    requestId: "req-01234567-89ab-cdef-0123-456789abcdef"
    method: "GET"
    path: "/v1/employees"
    status: 200
    durationMs: 45
    organizationId: "org_abc123"
```

#### Integração com Request ID

O request ID é:

1. Gerado automaticamente (`req-{uuid}`)
2. Incluído em todos os logs
3. Retornado no header `X-Request-ID`
4. Útil para correlação de logs e debugging

```bash
# Cliente pode usar para rastrear requests
curl -i http://localhost:3000/v1/employees
# Response header: X-Request-ID: req-01234567-89ab-cdef-0123-456789abcdef
```

**Esforço estimado:** 1h (usando plugin existente)

**Dependências:**

```bash
bun add @bogeychan/elysia-logger pino-pretty
```

---

### 2.2 Health Check (Prioridade: Alta) ✅ IMPLEMENTADO

**Status:** ✅ Implementado em `src/lib/health/index.ts`

**Problema:** Sem endpoint para verificar saúde da aplicação.

**Solução:** Implementação manual simples (não existe plugin para Elysia).

**Localização:** `src/lib/health/index.ts` e `src/lib/health/health.model.ts`

```typescript
import { sql } from "drizzle-orm";

app.get("/health", async () => {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  // Check database
  const dbStart = performance.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = {
      status: "healthy",
      latencyMs: Math.round(performance.now() - dbStart),
    };
  } catch (error) {
    checks.database = { status: "unhealthy" };
  }

  // Check Pagar.me (opcional)
  // const pagarmeStart = performance.now();
  // try {
  //   await PagarmeClient.healthCheck();
  //   checks.pagarme = { status: "healthy", latencyMs: ... };
  // } catch {
  //   checks.pagarme = { status: "unhealthy" };
  // }

  const isHealthy = Object.values(checks).every((c) => c.status === "healthy");

  return {
    status: isHealthy ? "healthy" : "unhealthy",
    version: process.env.npm_package_version ?? "unknown",
    uptime: Math.round(process.uptime()),
    checks,
  };
});

// Endpoint simplificado para load balancers
app.get("/health/live", () => ({ status: "ok" }));
```

**Esforço estimado:** 30min

---

### 2.3 Request ID (Prioridade: Média) ✅ IMPLEMENTADO

**Status:** ✅ Implementado em `src/lib/logger/index.ts`

**Solução:** Já incluído no `loggerPlugin` (seção 2.1).

O logger plugin implementa:

1. ✅ Gera request ID único (`req-{uuid}`)
2. ✅ Inclui em todos os logs (`requestId` field)
3. ✅ Retorna no header `X-Request-ID`

```typescript
// Implementado em src/lib/logger/index.ts
.derive({ as: "global" }, () => ({
  requestId: `req-${Bun.randomUUIDv7()}`,
}))
.onAfterHandle({ as: "global" }, ({ set, requestId }) => {
  set.headers["X-Request-ID"] = requestId;
})
```

**Esforço estimado:** ✅ Concluído

---

## 3. Resiliência

### 3.1 Retry Helper (Prioridade: Média)

**Problema:** Chamadas a serviços externos (Pagar.me) podem falhar temporariamente.

**Localização:** `src/shared/utils/retry.ts`

```typescript
interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: "linear" | "exponential";
  shouldRetry?: (error: Error) => boolean;
}

const defaultShouldRetry = (error: Error): boolean => {
  // Retry em erros de rede ou 5xx
  if (error.name === "TypeError" && error.message.includes("fetch"))
    return true;
  if ("status" in error && typeof error.status === "number") {
    return error.status >= 500 && error.status < 600;
  }
  return false;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoff = "exponential",
    shouldRetry = defaultShouldRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        break;
      }

      const delay =
        backoff === "exponential"
          ? delayMs * 2 ** (attempt - 1)
          : delayMs * attempt;

      await Bun.sleep(delay);
    }
  }

  throw lastError;
}
```

**Uso:**

```typescript
import { withRetry } from "@/shared/utils/retry";

const customer = await withRetry(() => PagarmeClient.createCustomer(data), {
  maxAttempts: 3,
  delayMs: 1000,
});
```

**Esforço estimado:** 1h

---

### 3.2 Timeout Helper (Prioridade: Média)

**Problema:** Chamadas externas podem travar indefinidamente.

**Localização:** `src/shared/utils/timeout.ts`

```typescript
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  try {
    const result = await fn();
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      throw new TimeoutError(ms);
    }
    throw error;
  }
}
```

**Esforço estimado:** 1h

---

### 3.3 Soft Delete (Prioridade: Média)

**Problema:** Dados de DP não devem ser deletados permanentemente.

**Localização:** `src/db/schema/common.ts`

```typescript
import { timestamp, text } from "drizzle-orm/pg-core";

export const softDeleteColumns = {
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
};

export const timestampColumns = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
};
```

**Uso no schema:**

```typescript
import { softDeleteColumns, timestampColumns } from "./common";

export const employees = pgTable("employees", {
  id: text("id").primaryKey(),
  // ... outros campos
  ...timestampColumns,
  ...softDeleteColumns,
});
```

**Helper para queries:**

```typescript
import { isNull } from "drizzle-orm";

// Usar em todas as queries de listagem
const activeEmployees = await db
  .select()
  .from(schema.employees)
  .where(isNull(schema.employees.deletedAt));
```

**Esforço estimado:** 2h

---

### 3.4 Graceful Shutdown (Prioridade: Baixa)

**Problema:** Shutdown abrupto pode corromper operações em andamento.

**Localização:** `src/index.ts`

```typescript
const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);

  // Parar de aceitar novas conexões
  app.stop();

  // Aguardar operações em andamento (máx 30s)
  await Bun.sleep(5000);

  // Fechar conexões de banco
  // await db.$client.end();

  console.log("Shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

**Esforço estimado:** 1h

---

## 4. LGPD/Compliance

### 4.1 Export de Dados (Prioridade: Média)

**Problema:** LGPD exige que usuários possam exportar seus dados.

**Endpoint:** `GET /v1/compliance/export`

```typescript
// src/modules/compliance/export/export.service.ts
export abstract class ExportService {
  static async exportUserData(
    userId: string,
    organizationId: string
  ): Promise<{ data: Record<string, unknown>; generatedAt: string }> {
    const [user, employees, auditLogs] = await Promise.all([
      db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1),
      db
        .select()
        .from(schema.employees)
        .where(
          and(
            eq(schema.employees.organizationId, organizationId),
            eq(schema.employees.createdBy, userId)
          )
        ),
      db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.organizationId, organizationId),
            eq(schema.auditLogs.userId, userId)
          )
        )
        .limit(1000),
    ]);

    return {
      data: {
        user: user[0],
        employeesCreated: employees,
        activityLog: auditLogs,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
```

**Esforço estimado:** 4h

---

### 4.2 Anonimização (Prioridade: Média)

**Problema:** LGPD exige direito ao esquecimento.

```typescript
// src/modules/compliance/anonymize/anonymize.service.ts
export abstract class AnonymizeService {
  static async anonymizeEmployee(
    employeeId: string,
    organizationId: string,
    requestedBy: string
  ): Promise<void> {
    const anonymizedData = {
      name: "DADOS_ANONIMIZADOS",
      cpf: "00000000000",
      email: `anonimizado_${employeeId}@removed.local`,
      phone: null,
      address: null,
      deletedAt: new Date(),
      deletedBy: requestedBy,
      anonymizedAt: new Date(),
    };

    await db
      .update(schema.employees)
      .set(anonymizedData)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    // Registrar no audit log
    await db.insert(schema.auditLogs).values({
      id: `audit-${Bun.randomUUIDv7()}`,
      organizationId,
      userId: requestedBy,
      action: "delete",
      resource: "employee",
      resourceId: employeeId,
      changes: { after: { status: "anonymized" } },
    });
  }
}
```

**Esforço estimado:** 4h

---

## 5. Segurança Adicional

### 5.1 Request Size Limit (Prioridade: Alta) ✅ IMPLEMENTADO

**Status:** ✅ Implementado em `src/index.ts:17-19`

**Problema:** Payloads muito grandes podem causar DoS ou consumo excessivo de memória.

**Solução:** Configuração nativa do Elysia via `serve.maxRequestBodySize`.

**Configuração atual:** Limite de 10MB (adequado para API REST com upload de documentos)

**Localização:** `src/index.ts:17-19`

```typescript
const app = new Elysia({
  aot: isProduction,
  serve: {
    maxRequestBodySize: 1024 * 1024 * 10, // 10MB máximo
  },
});
```

#### Valores Recomendados

| Tipo de API        | Limite   | Justificativa                     |
| ------------------ | -------- | --------------------------------- |
| API REST padrão    | 10MB     | Suficiente para JSON, formulários |
| Upload de arquivos | 50-100MB | Documentos, imagens               |
| API de dados       | 1MB      | JSON compacto                     |

#### Comportamento quando excede

Elysia retorna automaticamente:

- Status: `413 Payload Too Large`
- Body: Mensagem de erro padrão

**Esforço estimado:** 5min (apenas adicionar configuração)

---

### 5.2 Error Sanitization (Prioridade: Alta)

**Problema:** Stack traces e detalhes de validação podem vazar informações sensíveis em produção.

**Status atual:** ⚠️ Parcialmente implementado

O arquivo `src/lib/errors/error-plugin.ts` já existe com:

- ✅ Tratamento de `AppError` customizado
- ✅ Tratamento de erros de validação
- ✅ Tratamento de NOT_FOUND
- ✅ Fallback para erros não tratados
- ❌ Diferenciação produção/desenvolvimento para stack traces
- ❌ Diferenciação produção/desenvolvimento para detalhes de validação

**Localização:** Atualizar `src/lib/errors/error-plugin.ts`

#### Código Atual (para referência)

```typescript
// Atual - sempre oculta stack, sempre mostra validation details
export const errorPlugin = new Elysia({ name: "error-handler" })
  .error({ AppError })
  .onError(({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.status;
      return error.toResponse();
    }

    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: formatValidationErrors(error.all), // ⚠️ Sempre expõe
        },
      };
    }

    // ... rest
  });
```

#### Código Recomendado

```typescript
import { Elysia } from "elysia";
import { AppError } from "./base-error";

const isProduction = process.env.NODE_ENV === "production";

type ValidationIssue = {
  path: string;
  message: string;
};

type ElysiaValidationError = {
  path?: string;
  message?: string;
  summary?: string;
};

function formatValidationErrors(errors: unknown[]): ValidationIssue[] {
  return errors.map((err) => {
    const error = err as ElysiaValidationError;
    return {
      path: error.path ?? "",
      message: error.message ?? error.summary ?? "Invalid value",
    };
  });
}

export const errorPlugin = new Elysia({ name: "error-handler" })
  .error({ AppError })
  .onError(({ code, error, set }) => {
    // Custom AppError instances
    if (error instanceof AppError) {
      set.status = error.status;
      return error.toResponse();
    }

    // Elysia validation errors
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          // Detalhes apenas em desenvolvimento
          details: isProduction ? undefined : formatValidationErrors(error.all),
        },
      };
    }

    // Route not found
    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false as const,
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      };
    }

    // Unhandled errors - NUNCA expor stack em produção
    console.error("Unhandled error:", error);
    set.status = 500;
    return {
      success: false as const,
      error: {
        code: "INTERNAL_ERROR",
        message: isProduction ? "An unexpected error occurred" : error.message,
        // Stack trace apenas em desenvolvimento
        stack: isProduction ? undefined : error.stack,
      },
    };
  })
  .as("scoped");
```

#### Diferenças por Ambiente

| Campo                       | Produção   | Desenvolvimento |
| --------------------------- | ---------- | --------------- |
| `error.message`             | Genérico   | Mensagem real   |
| `error.stack`               | ❌ Omitido | ✅ Incluído     |
| `error.details` (validação) | ❌ Omitido | ✅ Incluído     |

#### Resposta em Produção (500)

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

#### Resposta em Desenvolvimento (500)

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Cannot read property 'id' of undefined",
    "stack": "TypeError: Cannot read property 'id' of undefined\n    at ..."
  }
}
```

**Esforço estimado:** 15min (apenas adicionar verificações de ambiente)

---

### 5.3 CORS Restritivo (Prioridade: Alta)

**Problema:** CORS muito permissivo pode expor a API a ataques.

**Localização:** Atualizar `src/index.ts`

```typescript
import { env } from "./env";

// Parsear origens permitidas do env
const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());

app.use(
  cors({
    origin: (origin) => {
      // Permitir requests sem origin (mobile apps, curl, etc)
      if (!origin) return true;
      return allowedOrigins.includes(origin);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
    ],
    maxAge: 86400, // Cache preflight por 24h
  })
);
```

**Variável de ambiente:**

```bash
# Múltiplas origens separadas por vírgula
CORS_ORIGIN=https://app.synnerdata.com,https://admin.synnerdata.com
```

**Esforço estimado:** 30min

---

### 5.4 Idempotency Keys (Prioridade: Média)

**Problema:** Operações de pagamento podem ser duplicadas em caso de retry.

**Nota:** O `PagarmeClient` já suporta idempotency keys. Garantir uso consistente.

**Localização:** `src/modules/payments/checkout/checkout.service.ts`

```typescript
// Já implementado - garantir que todas as operações críticas usem
const paymentLink = await PagarmeClient.createPaymentLink(
  paymentLinkData,
  `checkout-${organizationId}-${planId}-${billingCycle}-${Date.now()}` // idempotency key
);
```

**Checklist de endpoints que precisam de idempotency:**

- [x] `POST /checkout` - criar checkout
- [ ] `POST /subscription/cancel` - cancelar assinatura
- [ ] `POST /subscription/restore` - restaurar assinatura
- [ ] `POST /billing/update-card` - atualizar cartão

**Esforço estimado:** 1h

---

### 5.5 API Versioning Strategy (Prioridade: Média)

**Problema:** Sem estratégia clara de versionamento e deprecation.

**Estratégia recomendada:**

1. **Versionamento via URL:** `/v1/`, `/v2/` (já implementado)
2. **Header de deprecation:** Avisar clientes sobre endpoints obsoletos
3. **Sunset header:** Data de remoção do endpoint

**Localização:** `src/plugins/api-version.plugin.ts`

```typescript
import { Elysia } from "elysia";

interface DeprecationConfig {
  message: string;
  sunsetDate?: string; // ISO date
  alternative?: string;
}

export const apiVersionPlugin = new Elysia({ name: "api-version" }).macro({
  deprecated: (config: DeprecationConfig) => ({
    beforeHandle({ set }) {
      set.headers["Deprecation"] = "true";
      set.headers["X-Deprecation-Message"] = config.message;

      if (config.sunsetDate) {
        set.headers["Sunset"] = config.sunsetDate;
      }

      if (config.alternative) {
        set.headers[
          "Link"
        ] = `<${config.alternative}>; rel="successor-version"`;
      }
    },
  }),
});
```

**Uso:**

```typescript
app.get("/v1/old-endpoint", handler, {
  deprecated: {
    message: "Use /v2/new-endpoint instead",
    sunsetDate: "2025-06-01",
    alternative: "/v2/new-endpoint",
  },
});
```

**Esforço estimado:** 1h

---

### 5.6 Input Sanitization (Prioridade: Alta)

**Problema:** Inputs de usuário podem conter caracteres maliciosos.

**Localização:** `src/shared/utils/sanitize.ts`

```typescript
/**
 * Remove caracteres de controle e normaliza whitespace
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control chars
    .replace(/\s+/g, " ") // Normaliza whitespace
    .trim();
}

/**
 * Sanitiza objeto recursivamente
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };

  for (const key of Object.keys(result)) {
    const value = result[key];

    if (typeof value === "string") {
      (result as Record<string, unknown>)[key] = sanitizeString(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = sanitizeObject(
        value as Record<string, unknown>
      );
    }
  }

  return result;
}

/**
 * Previne SQL injection em strings que serão usadas em queries raw
 * NOTA: Drizzle ORM já protege automaticamente em queries parametrizadas
 */
export function escapeSqlString(input: string): string {
  return input.replace(/['";\\]/g, "");
}
```

**Plugin para sanitização automática:**

```typescript
import { Elysia } from "elysia";
import { sanitizeObject } from "@/shared/utils/sanitize";

export const sanitizePlugin = new Elysia({ name: "sanitize" }).onParse(
  { as: "global" },
  async ({ request, contentType }) => {
    if (contentType === "application/json") {
      const body = await request.json();
      return sanitizeObject(body);
    }
  }
);
```

**Esforço estimado:** 2h

---

## 6. Checklist de Implementação

### Prioridade Alta

| Item                                            | Área            | Esforço | Status              | Localização           |
| ----------------------------------------------- | --------------- | ------- | ------------------- | --------------------- |
| Rate limiting (Better Auth + elysia-rate-limit) | Segurança       | 1h      | ❌ Pendente         | -                     |
| Audit log (Better Auth hooks + Elysia plugin)   | Segurança       | 4h      | Pendente            | -                     |
| Logger estruturado (@bogeychan/elysia-logger)   | Observabilidade | 1h      | ✅ Implementado     | src/lib/logger        |
| Health check endpoint                           | Observabilidade | 30min   | ✅ Implementado     | src/lib/health        |
| Validadores BR (CPF, CNPJ, PIS, CBO)            | Segurança       | 2h      | Pendente            | -                     |
| Criptografia PII                                | Segurança       | 3h      | Pendente            | -                     |
| Request size limit (built-in Elysia)            | Segurança       | 5min    | ✅ Implementado     | src/index.ts:17-19    |
| Error sanitization                              | Segurança       | 15min   | ⚠️ Parcial (env)    | src/lib/errors        |
| CORS restritivo                                 | Segurança       | 30min   | Pendente            | -                     |
| Input sanitization                              | Segurança       | 2h      | Pendente            | -                     |

### Prioridade Média

| Item                                       | Área            | Esforço | Status                |
| ------------------------------------------ | --------------- | ------- | --------------------- |
| Headers de segurança (built-in .headers()) | Segurança       | 15min   | Pendente              |
| Request ID em respostas                    | Observabilidade | 0       | ✅ Incluído no Logger |
| Retry helper                               | Resiliência     | 1h      | Pendente              |
| Timeout helper                             | Resiliência     | 1h      | Pendente              |
| Soft delete columns                        | Resiliência     | 2h      | Pendente              |
| Export de dados (LGPD)                     | Compliance      | 4h      | Pendente              |
| Anonimização (LGPD)                        | Compliance      | 4h      | Pendente              |
| Idempotency keys (pagamentos)              | Segurança       | 1h      | Pendente              |
| API versioning strategy                    | Arquitetura     | 1h      | Pendente              |

### Prioridade Baixa

| Item                  | Área            | Esforço | Status    |
| --------------------- | --------------- | ------- | --------- |
| Graceful shutdown     | Resiliência     | 1h      | Pendente  |
| Métricas (Prometheus) | Observabilidade | 4h      | Pendente  |
| Backup strategy       | DevOps          | 2h      | Pendente  |
| Dockerfile otimizado  | DevOps          | 2h      | Concluído |

---

## 7. Status de Implementação - Fase 1

> **Última verificação:** 2025-12-14
> **Progresso:** 3/6 itens completos (50%)

### ✅ 1. Request Size Limit (Implementado)

**Localização:** `src/index.ts:17-19`

```typescript
serve: {
  maxRequestBodySize: 1024 * 1024 * 10, // 10MB
}
```

**Configuração:** Limite de 10MB adequado para API REST com upload de documentos.

---

### ❌ 2. Security Headers (Não Implementado)

**Pendente:** Nenhuma configuração de headers de segurança encontrada.

**Ação necessária:** Adicionar em `src/index.ts`:

```typescript
.headers({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
})
```

**Esforço:** 15 min

---

### ⚠️ 3. Error Sanitization (Parcialmente Implementado)

**Localização:** `src/lib/errors/error-plugin.ts`

**✅ Implementado:**
- Tratamento de `AppError` customizado
- Tratamento de erros de validação
- Tratamento de NOT_FOUND
- Fallback para erros não tratados

**❌ Falta:**
- Diferenciação produção/dev para stack traces
- Diferenciação produção/dev para detalhes de validação

**Ação necessária:** Adicionar verificação `isProduction`:

```typescript
const isProduction = process.env.NODE_ENV === "production";

// Em VALIDATION errors
details: isProduction ? undefined : formatValidationErrors(error.all),

// Em erros não tratados
message: isProduction ? "An unexpected error occurred" : error.message,
stack: isProduction ? undefined : error.stack,
```

**Esforço:** 15 min

---

### ✅ 4. Health Check (Implementado)

**Localização:** `src/lib/health/index.ts` e `src/lib/health/health.model.ts`

**Endpoints:**
- `GET /health` - Health check completo com verificações
- `GET /health/live` - Liveness probe simplificado

**Funcionalidades:**
- ✅ Verificação de saúde do banco de dados
- ✅ Medição de latência
- ✅ Status geral, versão e uptime
- ✅ Schema Zod bem definido

---

### ✅ 5. Logger Estruturado (Implementado)

**Localização:** `src/lib/logger/index.ts`

**Implementação:**
- ✅ Usa `@bogeychan/elysia-logger` (baseado em pino)
- ✅ Logger standalone para services e hooks
- ✅ Plugin integrado com contexto global
- ✅ Gera Request ID único (`req-{uuid}`)
- ✅ Header `X-Request-ID` nas respostas
- ✅ AutoLogging com ignorância de `/health` e `/health/live`
- ✅ Pretty print colorizado em dev, JSON em produção

**Configuração ambiente-aware:**
- Production: `level: "info"`, sem pretty print
- Development: `level: "debug"`, com pino-pretty

---

### ❌ 6. Rate Limiting (Não Implementado)

**Pendente:** Nenhuma configuração de rate limiting encontrada.

**Ação necessária (2 camadas):**

**1. Better Auth (autenticação):**
- Adicionar configuração `rateLimit` em `src/lib/auth.ts`
- Proteger endpoints `/auth/api/*`

**2. Elysia Rate Limit (API geral):**
- Instalar: `bun add elysia-rate-limit`
- Configurar em `src/index.ts` para proteger `/v1/*`

**Esforço:** 1-2 horas

---

## 8. Estrutura de Arquivos Proposta

```
src/
├── plugins/                          # NOVO
│   ├── api-version.plugin.ts
│   ├── audit.plugin.ts
│   ├── logger.plugin.ts
│   ├── rate-limit.plugin.ts
│   ├── sanitize.plugin.ts
│   └── security-headers.plugin.ts
│
├── shared/                           # NOVO
│   ├── crypto/
│   │   └── pii.ts
│   ├── utils/
│   │   ├── retry.ts
│   │   ├── sanitize.ts
│   │   └── timeout.ts
│   └── validators/
│       └── brazilian.ts
│
├── db/
│   └── schema/
│       ├── audit.ts                  # NOVO
│       ├── common.ts                 # NOVO (soft delete, timestamps)
│       └── ...
│
└── modules/
    └── compliance/                   # NOVO (LGPD)
        ├── errors.ts
        ├── export/
        └── anonymize/
```

---

## 8. Ordem de Implementação Sugerida

```
Fase 1 - Fundação & Observabilidade (50% completo - 3/6 itens)
├── 1. Request Size Limit (5min) - built-in Elysia ✅ IMPLEMENTADO
├── 2. Security Headers (15min) - built-in .headers() ❌ PENDENTE
├── 3. Error Sanitization (15min) ⚠️ PARCIAL (falta env check)
├── 4. Health Check (30min) ✅ IMPLEMENTADO (src/lib/health)
├── 5. Logger Estruturado (1h) - @bogeychan/elysia-logger ✅ IMPLEMENTADO (src/lib/logger)
└── 6. Rate Limiting (1h) - Better Auth + elysia-rate-limit ❌ PENDENTE

Fase 2 - Segurança & Rastreabilidade (~8h)
├── 7. Audit Log (4h) - Better Auth hooks + Elysia plugin ✓ Já documentado
├── 8. CORS Restritivo (30min)
├── 9. Input Sanitization (2h)
└── 10. Criptografia PII (3h)

Fase 3 - Validação & Resiliência (~8h)
├── 11. Validadores BR (2h) - CPF, CNPJ, PIS, CBO
├── 12. Retry/Timeout helpers (2h)
├── 13. Soft Delete (2h)
├── 14. Idempotency Keys (1h)
└── 15. Graceful shutdown (1h)

Fase 4 - LGPD & Arquitetura (~9h)
├── 16. Export de dados (4h)
├── 17. Anonimização (4h)
└── 18. API Versioning Strategy (1h)
```

**Legenda:**

- ✅ IMPLEMENTADO = Item completo e funcional
- ⚠️ PARCIAL = Implementado mas incompleto
- ❌ PENDENTE = Não implementado
- ✓ Já documentado = Estratégia de implementação já definida nas seções anteriores

---

## 9. Dependências Necessárias

**Pendentes de instalação:**

```bash
# Rate limiting para rotas da API
bun add elysia-rate-limit
```

**Já instaladas:**

```bash
# Logger estruturado (pino) ✅
# @bogeychan/elysia-logger e pino-pretty já instalados
```

---

## 10. Variáveis de Ambiente Necessárias

Adicionar ao `.env`:

```bash
# Criptografia PII (OBRIGATÓRIO para produção)
# Gerar: openssl rand -hex 32
PII_ENCRYPTION_KEY=

# Rate Limiting com Redis (opcional, recomendado para produção)
REDIS_URL=redis://localhost:6379

# CORS - Origens permitidas (separadas por vírgula)
CORS_ORIGIN=https://app.synnerdata.com,https://admin.synnerdata.com
```

Adicionar ao `src/env.ts`:

```typescript
export const env = {
  // ... existentes
  PII_ENCRYPTION_KEY: process.env.PII_ENCRYPTION_KEY,
  REDIS_URL: process.env.REDIS_URL,
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
};
```

---

## Referências

- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- [LGPD - Lei Geral de Proteção de Dados](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Elysia Best Practices](https://elysiajs.com/essential/best-practice)
- [Bun Documentation](https://bun.sh/docs)
- [Better Auth Rate Limiting](https://www.better-auth.com/docs/concepts/rate-limit)
- [elysia-rate-limit Plugin](https://github.com/rayriffy/elysia-rate-limit)
- [@bogeychan/elysia-logger Plugin](https://github.com/bogeychan/elysia-logger)
- [pino - Fast JSON Logger](https://getpino.io/)

---

## Próximos Passos Recomendados

### 🎯 Completar Fase 1 (~2h)

**Prioridade Urgente (30min):**

1. **Security Headers** (~15min)
   - Adicionar `.headers()` em `src/index.ts`
   - Ver [Seção 1.5](#15-headers-de-segurança-prioridade-média) para código

2. **Error Sanitization** (~15min)
   - Atualizar `src/lib/errors/error-plugin.ts`
   - Adicionar verificação `isProduction`
   - Ver [Seção 5.2](#52-error-sanitization-prioridade-alta) para código

**Prioridade Alta (1-2h):**

3. **Rate Limiting**
   - Instalar: `bun add elysia-rate-limit`
   - Configurar Better Auth rate limiting em `src/lib/auth.ts`
   - Configurar elysia-rate-limit em `src/index.ts`
   - Ver [Seção 1.1](#11-rate-limiting-prioridade-alta) para implementação completa

### 📊 Progresso Geral

- **Fase 1:** 50% → 100% após completar os 3 itens acima
- **Fase 2-4:** Aguardando conclusão da Fase 1

### 📝 Checklist de Verificação

Após completar os itens acima, verificar:

- [ ] Headers de segurança retornando em todas as respostas
- [ ] Erros de produção não expõem stack traces
- [ ] Rate limiting bloqueando após exceder limites
- [ ] Logs estruturados sendo gerados corretamente
- [ ] Health checks respondendo `/health` e `/health/live`
- [ ] Request ID presente em logs e headers
