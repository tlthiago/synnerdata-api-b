# Job Positions (Cargos)

Cargos da organização. Referenciado por employees (FK obrigatória) e por promotions (previous/new).

## Business Rules

- `name` (1-100 chars) — único por organização (case-insensitive, soft-delete-aware), `description` (max 500, opcional)
- M2M com PPE items via `ppeJobPositions`
- CRUD com soft delete

## Audit logging

- Resource key: `job_position`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Read audit: not enabled (data is not LGPD Art. 11/18 sensitive)

## Permissions

- `jobPosition:create` | `jobPosition:read` | `jobPosition:update` | `jobPosition:delete`

## Errors

- `JobPositionNotFoundError` (404)
- `JobPositionAlreadyExistsError` (409)
- `JobPositionAlreadyDeletedError` (404)
