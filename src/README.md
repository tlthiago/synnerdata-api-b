# `src/` — Mapa arquitetural

Visão geral do layout do código. Complementa [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) (convenções do projeto) e os `CLAUDE.md` por módulo/plugin.

---

## Visão de topo

```
src/
├── index.ts                  # Bootstrap: Elysia root + plugin chain + routes/v1 + listen
│
├── plugins/                  # Elysia instances (.use()-able)
│   ├── audit/                #   auditPlugin         — macro .audit() para log de ações
│   ├── auth-guard/           #   betterAuthPlugin    — Better Auth mount + macro .auth() para permissions
│   ├── cron/                 #   cronPlugin          — jobs agendados
│   ├── error-handler/        #   errorPlugin         — .onError formata envelope
│   ├── health/               #   healthPlugin        — /health + /health/live
│   └── request-logger/       #   loggerPlugin        — requestId + access log + AsyncLocalStorage
│
├── lib/                      # Utilities puras (NÃO são plugins Elysia)
│   ├── auth.ts               #   Better Auth config (consumido por auth-guard)
│   ├── auth/                 #   audit-helpers, validators, hooks, admin-helpers
│   ├── cors.ts               #   parseOrigins util
│   ├── crypto/               #   PII encrypt/decrypt (branded EncryptedString)
│   ├── email.tsx             #   Nodemailer senders (CP-2 vai reestruturar)
│   ├── emails/               #   (futuro, pós CP-2)
│   ├── error-reporter.ts     #   ErrorReporter.capture wrapper (Sentry, testable)
│   ├── errors/               #   AppError hierarchy — lançada por services (base-error, http-errors)
│   ├── logger.ts             #   Pino instance bruto (consumido por request-logger E por services)
│   ├── openapi/              #   error-messages util (consumido pelo openapi() config)
│   ├── password-complexity.ts
│   ├── permissions.ts        #   inheritRole + orgRoles (Better Auth)
│   ├── request-context.ts    #   AsyncLocalStorage + getRequestId
│   ├── responses/            #   envelope wrappers + response schemas
│   ├── schemas/              #   Zod helpers compartilhados
│   ├── sentry.ts             #   Sentry init (side-effect only; consumers usam error-reporter)
│   ├── shutdown/             #   setupGracefulShutdown
│   ├── utils/                #   retry, timeout
│   ├── validation/           #   CPF/CNPJ check digits
│   └── zod-config.ts         #   z.config(z.locales.pt()) side-effect
│
├── routes/
│   └── v1/                   # Composer com prefix:"/v1" — monta os 7 top-level controllers
│
├── modules/                  # Domínio (controllers + services + models + errors + tests)
│   ├── admin/                #   /v1/admin/* (api-keys, organizations)
│   ├── audit/                #   /v1/audit-logs (owner-only)
│   ├── auth/                 #   tests + docs (Better Auth config real vive em lib/auth.ts)
│   ├── cbo-occupations/      #   /v1/cbo-occupations (CBO MTE)
│   ├── employees/            #   /v1/employees
│   ├── occurrences/          #   /v1/{absences,vacations,medical-certificates,...}
│   ├── organizations/        #   /v1/{branches,sectors,cost-centers,...} + profile
│   ├── payments/             #   /v1/payments/* (checkout, subscription, billing, webhook...)
│   └── public/               #   /v1/public/* (contact, newsletter, provision-status)
│
├── db/                       # Drizzle schema + migrations + pool
├── env.ts                    # Zod-validated env (isProduction, isDev, isTest)
└── test/                     # createTestApp + factories + helpers
```

---

## Rubrica `plugins/` vs `lib/` (CP-1, reafirmada em CP-3)

A distinção **não é** "infrastructure vs business logic" — é **Elysia instance** vs **tudo o resto**.

### `src/plugins/<nome>/<nome>-plugin.ts`

Exporta **uma instância Elysia** que vira `.use()`-able:

```ts
export const loggerPlugin = new Elysia({ name: "request-logger" })
  .derive({ as: "global" }, () => ({ requestId: crypto.randomUUID() }))
  .onAfterResponse({ as: "global" }, ({ requestId, set, path }) => {
    logger.info({ requestId, path, status: set.status, type: "http:access" });
  });
```

Cada plugin tem seu `CLAUDE.md` dedicado documentando: `name`, hooks + scope, context additions (derive/decorate), macros, consumers.

### `src/lib/<nome>.ts` ou `src/lib/<dir>/`

Tudo que **não é** Elysia instance:
- Classes de erro lançadas por services (`AppError`, `NotFoundError`)
- Factories de schema (`errorSchema<C>`)
- Wrappers utilitários (`ErrorReporter.capture`, `PII.encrypt`, `retry`)
- Configs side-effect (`lib/sentry.ts` init, `lib/zod-config.ts` locale)
- Bootstrap helpers (`setupGracefulShutdown`)

Se precisar ser **mountado via `.use()`**, vai para `plugins/`. Caso contrário, `lib/`.

---

## Pares com nomes parecidos — resolvidos em 2026-04-23

Após CP-1, havia 3 pares em que **plugins/ e lib/ tinham o mesmo nome** (`errors`, `logger`, `auth`). A distinção técnica era clara mas a nomenclatura causava overhead cognitivo. Renomeados:

| Antigo (ambíguo) | Novo (descritivo) | Concern |
|---|---|---|
| `plugins/errors/` | `plugins/error-handler/` | Handler Elysia `.onError` |
| `lib/errors/` | `lib/errors/` (inalterado) | Classes `AppError` lançadas por services |
| `plugins/logger/` | `plugins/request-logger/` | Hooks `.derive`/`.onAfterResponse` request-scoped |
| `lib/logger.ts` | `lib/logger.ts` (inalterado) | Instância Pino raw (consumida pelo plugin E por services fora de request) |
| `plugins/auth/` | `plugins/auth-guard/` | Macro `.auth()` + mount Better Auth + OpenAPI enhance |
| `lib/auth.ts` + `lib/auth/` | inalterados | Better Auth config + audit-helpers + validators + hooks |

Os **nomes dos exports exportados** (`errorPlugin`, `loggerPlugin`, `betterAuthPlugin`) permanecem os mesmos — a mudança é só na organização de diretórios.

---

## Referências

- **Convenções do projeto**: [`.claude/CLAUDE.md`](../.claude/CLAUDE.md)
- **Melhorias em andamento**: [`docs/improvements/README.md`](../docs/improvements/README.md)
- **CLAUDE.md por plugin**: `src/plugins/<nome>/CLAUDE.md`
- **CLAUDE.md por módulo**: `src/modules/<nome>/CLAUDE.md`
