# Sectors (Setores/Departamentos)

Setores organizacionais. Referenciado por employees (FK obrigatória).

## Business Rules

- `name` (1-100 chars) — sem constraint de unicidade
- CRUD simples com soft delete

## Permissions

- `sector:create` | `sector:read` | `sector:update` | `sector:delete`

## Errors

- `SectorNotFoundError` (404)
- `SectorAlreadyDeletedError` (404)
