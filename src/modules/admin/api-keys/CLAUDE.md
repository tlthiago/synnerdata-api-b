# API Keys Module

Chaves de API para integrações externas. Admin-only.

## Business Rules

- Todos os endpoints requerem `requireAdmin: true` (admin ou super_admin)
- Key completa retornada **apenas na criação** — GETs retornam apenas `prefix` (12 primeiros chars)
- Permissões default: read-only em employees, occurrences, organizations, reports
- Apenas ação `read` disponível — sem write/update/delete via API key
- Rate limit por key: 100 requests por 60 segundos (desabilitado em test)
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

## Errors

- `ApiKeyNotFoundError` (404)
- `ApiKeyDisabledError` (401)
- `ApiKeyExpiredError` (401)
- `ApiKeyRateLimitError` (429)
