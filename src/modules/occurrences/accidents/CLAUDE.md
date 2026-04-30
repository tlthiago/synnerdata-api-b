# Accidents (Acidentes de Trabalho)

Registro de acidentes de trabalho e incidentes.

## Business Rules

- `date` não pode ser no futuro
- `description` (max 500 chars) e `measuresTaken` (max 500 chars) são obrigatórios
- `nature` (max 255 chars) obrigatório — natureza do acidente
- `cat` (max 25 chars) opcional — número da CAT (Comunicação de Acidente de Trabalho)
- CAT number deve ser único por organização (validado apenas quando fornecido)
- Employee deve estar ativo no create (`ensureEmployeeActive` — rejeita TERMINATED e ON_VACATION)
- `employeeId` é imutável após criação — para reatribuir, criar nova ocorrência e deletar a original
- Listagem ordenada por `date`

## Audit logging

- Plugin: `auditPlugin` registered in controller
- Resource key: `accident`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Ignored fields: `employee` (JOIN-shaped virtual nested object) + `employeeId` (immutable FK; resource identity is captured via `resourceId`)
- **Read audit enabled** on `GET /:id` — accident records may include sensitive medical/incident detail (CAT, body parts injured); LGPD Art. 11 (saúde) sensitivity

## Errors

- `AccidentNotFoundError` (404)
- `AccidentAlreadyDeletedError` (404)
- `AccidentInvalidEmployeeError` (404)
- `AccidentCatAlreadyExistsError` (409) — CAT number unique per organization
- `EmployeeTerminatedError` (422) — shared, from `src/modules/employees/errors.ts`
- `EmployeeOnVacationError` (422) — shared, from `src/modules/employees/errors.ts`

## User Attribution Shape

Response exposes `createdBy: { id, name }` and `updatedBy: { id, name }` via `auditUserAliases()` innerJoin — canonical pattern from `src/modules/organizations/cost-centers/` (PRD #5+).
