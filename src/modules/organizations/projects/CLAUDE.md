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
- Ignored fields: `employees` (M2M virtual column excluded from diff — M2M associations are audited separately as `project_employee`)
- Read audit: not enabled

### M2M associations (`project_employees`)

- Resource key: `project_employee`
- Mutations logged: `create` (via `addEmployee` or inline `create` loop), `delete` (via `removeEmployee`)
- Diff fields: `projectId`, `employeeId` (junction columns)
- Why audited separately: junction table has its own lifecycle; `deletedBy` was dropped from both `projects` and `project_employees` in PRD #3, so `audit_logs` is the deletion attribution source for both

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

## User attribution shape

Este módulo segue o pattern canônico de `createdBy`/`updatedBy` como `entityReferenceSchema` (`{ id, name }`), documentado em `src/modules/organizations/cost-centers/CLAUDE.md`. O M2M `project_employees` não expõe `createdBy`/`updatedBy` na resposta da API (apenas `projectId`, `employeeId`, `createdAt`), pois a tabela junction só possui `createdBy` e não tem endpoint de leitura enriquecida.
