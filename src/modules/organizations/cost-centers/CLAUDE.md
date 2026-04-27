# Cost Centers (Centros de Custo)

Centros de custo para alocação financeira. Referenciado por employees (FK opcional).

## Business Rules

- `name` (1-100 chars) — único por organização (case-insensitive, soft-delete-aware)
- CRUD simples com soft delete

## Audit logging

- Plugin: `auditPlugin` registered in controller
- Resource key: `cost_center`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Read audit: not enabled (data is not LGPD Art. 11/18 sensitive)

## Permissions

- `costCenter:create` | `costCenter:read` | `costCenter:update` | `costCenter:delete`

## Errors

- `CostCenterNotFoundError` (404)
- `CostCenterAlreadyExistsError` (409)
- `CostCenterAlreadyDeletedError` (404)
