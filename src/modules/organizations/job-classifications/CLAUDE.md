# Job Classifications (CBO — Classificação Brasileira de Ocupações)

Códigos CBO para compliance trabalhista brasileiro. Referenciado por employees (FK obrigatória).

## Business Rules

- `name` (1-255 chars) — nome/código do CBO, único por organização (case-insensitive, soft-delete-aware)
- CRUD simples com soft delete

## Permissions

- `jobClassification:create` | `jobClassification:read` | `jobClassification:update` | `jobClassification:delete`

## Errors

- `JobClassificationNotFoundError` (404)
- `JobClassificationAlreadyExistsError` (409)
- `JobClassificationAlreadyDeletedError` (404)
