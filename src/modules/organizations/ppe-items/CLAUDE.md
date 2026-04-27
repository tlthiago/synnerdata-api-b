# PPE Items (Itens de EPI)

Catálogo de Equipamentos de Proteção Individual com associação a cargos.

## Business Rules

- `name` (1-100), `description` (1-500), `equipment` (1-500) — obrigatórios
- Combinação `name` + `equipment` é única por organização (case-insensitive, soft-delete-aware)
- M2M com job positions via `ppeJobPositions` (soft delete independente)
- Não pode associar mesmo cargo duas vezes (409)
- Não pode associar/desassociar de item deletado

## Audit logging

- Plugin: `auditPlugin` registered in controller
- Resource key: `ppe_item`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- M2M associations (`ppeJobPositions`) not audited as part of this resource — out of scope for this task
- Read audit: not enabled

## Endpoints M2M

- `GET /:id/job-positions` — lista cargos associados
- `POST /:id/job-positions` — associa cargo (usa permissão `ppeItem:update`)
- `DELETE /:id/job-positions/:jobPositionId` — soft delete da associação

## Permissions

- `ppeItem:create` | `ppeItem:read` | `ppeItem:update` | `ppeItem:delete`
- M2M operations: `ppeItem:update`

## Errors

- `PpeItemNotFoundError` (404)
- `PpeItemAlreadyExistsError` (409)
- `PpeItemAlreadyDeletedError` (404)
- `PpeJobPositionNotFoundError` (404)
- `PpeJobPositionAlreadyExistsError` (409)
