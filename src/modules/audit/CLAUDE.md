# Audit Module

Log de ações para compliance. Registra quem fez o quê, quando e onde.

## Business Rules

- Logs são imutáveis — sem update ou delete
- Logging é assíncrono e silencioso — falhas não propagam erro (silent catch via logger)
- Acesso restrito a organization owners (admin/super_admin bypass allowed)
- Viewers, managers e supervisors recebem 403 FORBIDDEN

## Enums

- action: `create` | `read` | `update` | `delete` | `export` | `login` | `logout`
- resource: `user` | `session` | `organization` | `member` | `employee` | `document` | `medical_leave` | `subscription` | `export`

## Fields

- `userId` (obrigatório) — quem executou
- `organizationId` (nullable) — null para ações fora de org (login, criação de user)
- `resourceId` (nullable) — null para ações em bulk
- `changes` (nullable) — `{ before?, after? }` para tracking de mudanças em updates
- `ipAddress` — extraído de `x-forwarded-for` ou `x-real-ip`
- `userAgent` — informação do cliente

## Query & Filtering

- Paginação: `limit` (1-100, default 50), `offset` (≥0, default 0)
- Filtros: `resource` (opcional), `startDate`/`endDate` (ISO datetime, opcional)
- Ordenação: sempre `createdAt` DESC

## Endpoints

- `GET /audit-logs` — logs da organização (owner only)
- `GET /audit-logs/:resource/:resourceId` — histórico de um resource específico

## Permissions

- `audit:read` + `requireOrganization: true` + owner role

## Integration

Hooks em `src/lib/auth.ts` logam automaticamente: criação de user, login, CRUD de organization, membership changes, aceitação de convite.
