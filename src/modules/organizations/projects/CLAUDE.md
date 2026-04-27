# Projects (Projetos)

Projetos com alocação de funcionários (M2M).

## Business Rules

- `name` (max 255) — único por organização (case-insensitive, soft-delete-aware)
- `cno` (12 chars exatos) — único por organização (exact match, soft-delete-aware)
- `description` (max 255), `startDate` (ISO date) — obrigatórios
- `employeeIds` opcional no create — se fornecido, todos os employees são associados na criação
- M2M com employees via `projectEmployees` (soft delete independente)
- Não pode adicionar employee duplicado ao projeto (409)
- Não pode adicionar/remover employees de projeto deletado
- Delete do projeto não cascateia para associações
- Listagem ordenada por `startDate` DESC

## Audit logging

- Resource key: `project`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Ignored fields: `employees` (M2M virtual column excluded from diff — M2M associations are not audited as part of the project resource; out of scope for this task)
- Read audit: not enabled

## Endpoints M2M

- `GET /:id/employees` — lista employees do projeto
- `POST /:id/employees` — adiciona employee (usa permissão `project:update`)
- `DELETE /:id/employees/:employeeId` — soft delete da associação

## Permissions

- `project:create` | `project:read` | `project:update` | `project:delete`
- M2M operations: `project:update`

## Errors

- `ProjectNotFoundError` (404)
- `ProjectNameAlreadyExistsError` (409)
- `ProjectCnoAlreadyExistsError` (409)
- `ProjectAlreadyDeletedError` (404)
- `ProjectEmployeeNotFoundError` (404)
- `ProjectEmployeeAlreadyExistsError` (409)
- `ProjectEmployeeNotAssignedError` (404)
