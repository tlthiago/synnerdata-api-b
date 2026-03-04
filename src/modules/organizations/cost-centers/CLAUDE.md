# Cost Centers (Centros de Custo)

Centros de custo para alocação financeira. Referenciado por employees (FK opcional).

## Business Rules

- `name` (1-100 chars) — sem constraint de unicidade
- CRUD simples com soft delete

## Permissions

- `costCenter:create` | `costCenter:read` | `costCenter:update` | `costCenter:delete`

## Errors

- `CostCenterNotFoundError` (404)
- `CostCenterAlreadyDeletedError` (404)
