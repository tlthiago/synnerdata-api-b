# Job Positions (Cargos)

Cargos da organização. Referenciado por employees (FK obrigatória) e por promotions (previous/new).

## Business Rules

- `name` (1-100 chars), `description` (max 500, opcional)
- M2M com PPE items via `ppeJobPositions`
- CRUD com soft delete

## Permissions

- `jobPosition:create` | `jobPosition:read` | `jobPosition:update` | `jobPosition:delete`

## Errors

- `JobPositionNotFoundError` (404)
- `JobPositionAlreadyDeletedError` (404)
