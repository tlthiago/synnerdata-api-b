# Sectors (Setores/Departamentos)

Setores organizacionais. Referenciado por employees (FK obrigatória).

## Business Rules

- `name` (1-100 chars) — único por organização (case-insensitive, soft-delete-aware)
- CRUD simples com soft delete

## Permissions

- `sector:create` | `sector:read` | `sector:update` | `sector:delete`

## Errors

- `SectorNotFoundError` (404)
- `SectorAlreadyExistsError` (409)
- `SectorAlreadyDeletedError` (404)
