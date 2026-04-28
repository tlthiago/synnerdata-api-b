# Sectors (Setores/Departamentos)

Setores organizacionais. Referenciado por employees (FK obrigatória).

## Business Rules

- `name` (1-100 chars) — único por organização (case-insensitive, soft-delete-aware)
- CRUD simples com soft delete

## Audit logging

- Resource key: `sector`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Read audit: not enabled (data is not LGPD Art. 11/18 sensitive)

## Permissions

- `sector:create` | `sector:read` | `sector:update` | `sector:delete`

## Errors

- `SectorNotFoundError` (404)
- `SectorAlreadyExistsError` (409)
- `SectorAlreadyDeletedError` (404)
