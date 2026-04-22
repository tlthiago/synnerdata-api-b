# Cost Centers (Centros de Custo)

Centros de custo para alocação financeira. Referenciado por employees (FK opcional).

## Business Rules

- `name` (1-100 chars) — único por organização (case-insensitive, soft-delete-aware)
- CRUD simples com soft delete

## Permissions

- `costCenter:create` | `costCenter:read` | `costCenter:update` | `costCenter:delete`

## Errors

- `CostCenterNotFoundError` (404)
- `CostCenterAlreadyExistsError` (409)
- `CostCenterAlreadyDeletedError` (404)

## User Attribution (canonical pattern)

Este módulo é a **implementação de referência** do padrão de atribuição de usuário para recursos de domínio. Phase 3 PRs em outros módulos devem replicar exatamente este shape.

- Response schema expõe `createdBy`, `updatedBy`, `deletedBy` como `auditUserSchema` (`{ id, name } | null`) — importado de `@/lib/responses/response.types`
- Reads usam Drizzle Relational API: `db.query.costCenters.findFirst/findMany({ with: AUDIT_USER_WITH })`, onde `AUDIT_USER_WITH` projeta apenas `{ id, name }` nas relações `createdByUser`/`updatedByUser`/`deletedByUser`
- O resultado do DB (colunas de texto + relações) é convertido para o shape da API via `mapAuditRelations` (mesmo módulo), que troca `createdByUser`/`updatedByUser`/`deletedByUser` pelos keys `createdBy`/`updatedBy`/`deletedBy` antes da validação Zod
- Writes (create/update/delete) seguem **write-then-reread dentro de `db.transaction`**: mutação + re-read compartilham a transação para garantir atomicidade — se o re-read falhar, a mutação é revertida e a resposta nunca é retornada parcialmente populada
- Código de referência: `cost-center.service.ts` (constante `AUDIT_USER_WITH` + métodos `create`/`findAll`/`findByIdOrThrow`/`update`/`delete`) e `cost-center.model.ts` (`costCenterDataSchema`)

Decisões completas: [ADR-002](../../../../.compozy/tasks/audit-user-references/adrs/adr-002.md) (API contract), [ADR-003](../../../../.compozy/tasks/audit-user-references/adrs/adr-003.md) (query pattern).
