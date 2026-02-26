# PPE Items (Itens de EPI)

Catálogo de Equipamentos de Proteção Individual com associação a cargos.

## Business Rules

- `name` (1-100), `description` (1-500), `equipment` (1-500) — obrigatórios
- M2M com job positions via `ppeJobPositions` (soft delete independente)
- Não pode associar mesmo cargo duas vezes (409)
- Não pode associar/desassociar de item deletado

## Endpoints M2M

- `GET /:id/job-positions` — lista cargos associados
- `POST /:id/job-positions` — associa cargo (usa permissão `ppeItem:update`)
- `DELETE /:id/job-positions/:jobPositionId` — soft delete da associação

## Permissions

- `ppeItem:create` | `ppeItem:read` | `ppeItem:update` | `ppeItem:delete`
- M2M operations: `ppeItem:update`

## Errors

- `PpeItemNotFoundError` (404)
- `PpeItemAlreadyDeletedError` (404)
- `PpeJobPositionNotFoundError` (404)
- `PpeJobPositionAlreadyExistsError` (409)
