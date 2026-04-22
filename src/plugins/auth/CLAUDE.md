# Auth Plugin

Integra Better Auth na API e expõe o macro `auth` para controllers declararem requisitos de autenticação/autorização por rota.

## Meta

- **`name`**: `"better-auth"`
- **Prefix**: N/A (monta handler do Better Auth em `/api/auth/*` via `.mount()`)
- **OpenAPI tag**: rotas do Better Auth recebem tag `"Better Auth"` via `OpenAPI.getPaths()`

## O que o plugin faz

1. **`.mount(auth.handler)`** — expõe todas as rotas do Better Auth (signup, signin, OAuth callbacks, password reset, 2FA, etc.) sob `/api/auth/*`.
2. **`.macro({ auth: ... })`** — oferece o macro `auth` para rotas protegidas declararem seus requisitos (ver abaixo).
3. **Bulk-injection de `user` e `session`** — quando o macro `auth` é aplicado a uma rota, o `resolve` do macro injeta `{ user, session }` no context.

## Macro `auth`

Tipo `AuthOptions` exportado. Aceita duas formas:

### Boolean shortcut

```ts
.get("/profile", handler, { auth: true })
```

Só verifica que tem sessão válida. Sem checagem de permissão/role/subscription.

### Opções completas

```ts
.post("/employees", handler, {
  auth: {
    permissions: { employee: ["create"] },
    requireOrganization: true,
    requireActiveSubscription: true,
    requireFeature: "ppe",
    allowAdminBypass: true,       // default true
    requireAdmin: false,
    requireSuperAdmin: false,
  }
})
```

Campos:

- `permissions?: OrgPermissions` — checagem via `auth.api.hasPermission` (se a request vier com API key, essa checagem é **skipped** — API keys usam modelo de permissões próprio read-only).
- `requireOrganization?: boolean` — valida `session.activeOrganizationId`. API keys têm `activeOrganizationId` injetado via metadata do key (ver `src/modules/admin/api-keys/CLAUDE.md`).
- `requireAdmin`/`requireSuperAdmin?: boolean` — checa `user.role`.
- `requireActiveSubscription?: boolean` — `SubscriptionService.checkAccess(organizationId)`.
- `requireFeature?: string` / `requireFeatures?: string[]` — `LimitsService.checkFeature`.
- `allowAdminBypass?: boolean` — se true (default), admin/super-admin e API keys pulam check de subscription/feature.

## Hooks

**Nenhum hook global**. Toda a lógica vive dentro do macro `auth`, que executa no `resolve` de cada rota que o declara.

## Segurança (CP-24)

O macro detecta sessão ausente e **loga** antes de lançar `UnauthorizedError`:

```ts
logger.warn({
  type: "security:unauthorized_access",
  method, path, ip, userAgent, hasApiKey: boolean
})
```

Raw token/key **nunca** é logado — só o flag `hasApiKey` se o header `x-api-key` está presente. IP extraído via `x-forwarded-for` → `x-real-ip` → `null`.

## Errors

Declarados em `src/lib/errors/`:

- `UnauthorizedError` (401) — sessão ausente/expirada
- `ForbiddenError` (403) — `permissions` falha, `NoActiveOrganizationError`, `AdminRequiredError`, `SuperAdminRequiredError`
- `SubscriptionRequiredError`, `FeatureNotAvailableError` — de `src/lib/errors/subscription-errors.ts`

## OpenAPI helper

`OpenAPI.getPaths()` e `OpenAPI.components` retornam as definições OpenAPI do Better Auth com melhorias (PT-BR error messages, minLength, format). Consumidos por `src/index.ts` na composição do `openapi()` plugin.

## Consumers

Praticamente todos os controllers do projeto (ver `grep betterAuthPlugin src/modules/**/index.ts`). O plugin é mountado no bootstrap (`src/index.ts`) **antes** dos controllers de domínio para que o macro esteja disponível.

## Scope de propagação

Sem `.as()` na instância. Cada controller faz seu próprio `.use(betterAuthPlugin)`, e o Elysia deduplica via `name: "better-auth"` — o plugin só é efetivamente instalado uma vez na árvore de instâncias, mesmo com múltiplos `.use()`.

## Out of scope (CP-4)

Hoje `auth-plugin.ts` tem 391 linhas com helpers inline (`extractClientIp`, `parseOptions`, `validateRoleRequirements`, `validatePermissions`, `validateSubscriptionAndFeatures`, `extractClientMetadata`, etc.). **CP-4** vai quebrar em:

- `plugins/auth/auth-plugin.ts` (só o plugin + macro)
- `plugins/auth/options.ts` (parse de opções)
- `plugins/auth/validators.ts` (role/permission/subscription/feature checks)
- `plugins/auth/openapi-enhance.ts` (OpenAPI helper)

Também vai quebrar `src/lib/auth.ts` (856 linhas) em sub-arquivos (`config.ts`, `hooks.ts`, etc.).
