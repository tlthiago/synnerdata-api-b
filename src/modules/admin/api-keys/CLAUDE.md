# API Keys Module

Chaves de API para integrações externas. Admin-only.

## Business Rules

- Todos os endpoints requerem `requireAdmin: true` (admin ou super_admin)
- Key completa retornada **apenas na criação** — GETs retornam apenas `prefix` (12 primeiros chars)
- Permissões default: read-only em employees, occurrences, organizations, reports
- Apenas ação `read` disponível — sem write/update/delete via API key
- Rate limit por key: 200 requests por 60 segundos (desabilitado em test) — dobrado para compensar dupla verificação
- Deleção é irreversível (hard delete, não soft delete)

## Scoping

- `organizationId` opcional — se fornecido, key scoped à org; se omitido, key global
- `isGlobal`: derivado da ausência de `organizationId`

## Fields (create input)

- `name` (1-100 chars, obrigatório)
- `expiresInDays` (1-365, opcional) — convertido para segundos internamente
- `permissions` (opcional, default: read-only em 4 resources)
- `organizationId` (opcional)

## Endpoints

- `POST /v1/admin/api-keys` — cria key (retorna key completa)
- `GET /v1/admin/api-keys` — lista keys (query: `organizationId` opcional)
- `GET /v1/admin/api-keys/:id` — detalhes (prefix, não key)
- `POST /v1/admin/api-keys/:id/revoke` — desabilita key (reversível)
- `DELETE /v1/admin/api-keys/:id` — deleta permanentemente

## Organization Context Resolution

- O auth plugin (`src/plugins/auth/auth-plugin.ts`) detecta o header `x-api-key` e chama `verifyApiKey` para extrair `organizationId` da metadata
- O `organizationId` é injetado em `session.activeOrganizationId` para que endpoints org-scoped funcionem
- API keys **pulam** a checagem de permissão de role na org (`hasPermission`) — usam seu próprio modelo de permissões read-only
- Keys globais (sem `organizationId`) são rejeitadas por endpoints com `requireOrganization: true`
- `enableSessionForAPIKeys` do Better Auth cria uma mock session sem `activeOrganizationId` — o auth plugin resolve isso
- A dupla verificação (hook do Better Auth + `verifyApiKey`) conta 2x no rate limit, por isso o max é 200

## Errors

- `ApiKeyNotFoundError` (404)
- `ApiKeyDisabledError` (401)
- `ApiKeyExpiredError` (401)
- `ApiKeyRateLimitError` (429)

## Audit trail

Operações de create/revoke/delete são registradas em `audit_logs` via `AuditService.log`, com `resource: "api_key"`. O payload **nunca** inclui a key completa — apenas o prefix (12 primeiros chars), consistente com o invariant de segurança do módulo.

| Operação | `action` | `changes` |
|---|---|---|
| `create` | `create` | `after: { prefix, name, organizationId, isGlobal }` |
| `revoke` | `update` | `before: { enabled: true }`, `after: { enabled: false }` |
| `delete` | `delete` | — |

`ipAddress` e `userAgent` são extraídos dos headers `x-forwarded-for`/`x-real-ip` e `user-agent` quando disponíveis. O `userId` vem do admin que executou a operação (não do owner da key). `organizationId` é preenchido no create quando a key é scoped, e fica `null` em keys globais e nas operações de revoke/delete (a info está no create — cross-reference via `resourceId`).
