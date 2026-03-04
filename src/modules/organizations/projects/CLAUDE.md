# Projects (Projetos)

Projetos com alocação de funcionários (M2M).

## Business Rules

- `name` (max 255), `description` (max 255), `startDate` (ISO date), `cno` (12 chars exatos) — obrigatórios
- `employeeIds` opcional no create — se fornecido, todos os employees são associados na criação
- M2M com employees via `projectEmployees` (soft delete independente)
- Não pode adicionar employee duplicado ao projeto (409)
- Não pode adicionar/remover employees de projeto deletado
- Delete do projeto não cascateia para associações
- Listagem ordenada por `startDate` DESC

## Endpoints M2M

- `GET /:id/employees` — lista employees do projeto
- `POST /:id/employees` — adiciona employee (usa permissão `project:update`)
- `DELETE /:id/employees/:employeeId` — soft delete da associação

## Permissions

- `project:create` | `project:read` | `project:update` | `project:delete`
- M2M operations: `project:update`

## Errors

- `ProjectNotFoundError` (404)
- `ProjectAlreadyDeletedError` (404)
- `ProjectEmployeeNotFoundError` (404)
- `ProjectEmployeeAlreadyExistsError` (409)
- `ProjectEmployeeNotAssignedError` (404)
