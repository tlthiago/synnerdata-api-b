# Job Classifications (CBO — Classificacao Brasileira de Ocupacoes)

Codigos CBO para compliance trabalhista brasileiro. Referenciado por employees (FK obrigatoria).

## Business Rules

- `name` (1-255 chars) — nome/codigo do CBO, unico por organizacao (case-insensitive, soft-delete-aware)
- CRUD simples com soft delete
- `cboOccupationId` (optional, nullable FK) — references `cbo_occupations.id`
- If `cboOccupationId` provided without `name`, auto-fills `name` from CBO title
- If both provided, uses the user-provided `name` (override)
- Setting `cboOccupationId` to `null` on update clears the CBO reference

## Audit logging

- Resource key: `job_classification`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Read audit: not enabled (data is not LGPD Art. 11/18 sensitive)

## Permissions

- `jobClassification:create` | `jobClassification:read` | `jobClassification:update` | `jobClassification:delete`

## Errors (updated)

- `JobClassificationNotFoundError` (404)
- `JobClassificationAlreadyExistsError` (409)
- `JobClassificationAlreadyDeletedError` (404)
- `InvalidCboOccupationError` (422) — invalid cboOccupationId reference
