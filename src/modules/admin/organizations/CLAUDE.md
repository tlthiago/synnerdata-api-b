# Admin Organizations Module

Listagem, detalhes e configuração de organizações. Admin-only.

## Business Rules

- Todos os endpoints requerem `requireAdmin: true` (admin ou super_admin)
- Não são scoped por organização — operam sobre todas as orgs da plataforma
- Listagem filtra soft-deleted orgs via `isNull(organizationProfiles.deletedAt)`
- Busca (`search`) aplica `ILIKE` em `organizations.name` e `organizationProfiles.tradeName`
- Detalhes incluem profile completo, membros com dados do usuário e subscription ativa
- Power BI URL pode ser `null` (remoção) — listagem expõe apenas `hasPowerBiUrl` (booleano)

## Endpoints

- `GET /v1/admin/organizations` — lista orgs com paginação e busca
- `GET /v1/admin/organizations/:id` — detalhes completos (profile, members, subscription)
- `PUT /v1/admin/organizations/:id/power-bi-url` — define ou remove URL do Power BI

## Query Parameters (list)

- `page` (int >= 1, default: 1)
- `limit` (int 1-100, default: 20)
- `search` (string, opcional) — busca por nome ou nome fantasia

## Dados retornados

### List item

`id`, `name`, `slug`, `createdAt`, `tradeName`, `taxId`, `hasPowerBiUrl`, `memberCount`, `status`

### Details

- Dados base da org (`id`, `name`, `slug`, `createdAt`)
- `profile` (nullable) — tradeName, legalName, taxId, email, phone, endereço completo, industry, businessArea, pbUrl, status
- `members` — array com `id`, `userId`, `role`, `user.name`, `user.email`
- `memberCount` — derivado de `members.length`
- `subscription` (nullable) — `planName`, `status`, `startDate`

## Errors

- `OrganizationNotFoundError` (404) — org não existe (usado em details e update Power BI)
