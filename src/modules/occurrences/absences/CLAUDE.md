# Absences (Ausências)

Registro de faltas de funcionários (justificadas ou injustificadas).

## Business Rules

- `startDate` deve ser ≤ `endDate` (validação de range)
- Employee deve existir e não estar deletado na organização
- Employee deve estar ativo no create (`ensureEmployeeActive` — rejeita TERMINATED e ON_VACATION)
- Overlap check no create: mesmo employee + mesmo type + datas sobrepostas lança `AbsenceOverlapError`
- Listagem ordenada por `startDate`

## Audit logging

- Resource key: `absence`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Ignored fields: `employee` (JOIN-shaped virtual nested object) + `employeeId` (immutable FK; resource identity is captured via `resourceId`)
- Read audit: not enabled (no LGPD Art. 11/18 PII on the absence record itself; sensitivity sits with the employee)

## Enums

- type: `justified` | `unjustified`

## Fields

- `startDate`, `endDate` (YYYY-MM-DD)
- `reason`, `notes` (opcionais)

## Errors

- `AbsenceNotFoundError` (404)
- `AbsenceAlreadyDeletedError` (404)
- `AbsenceInvalidDateRangeError` (422)
- `AbsenceInvalidEmployeeError` (422)
- `AbsenceOverlapError` (409) — same employee + type + overlapping dates
- `EmployeeTerminatedError` (422) — shared, from `src/modules/employees/errors.ts`
- `EmployeeOnVacationError` (422) — shared, from `src/modules/employees/errors.ts`

## User Attribution Shape

Response exposes `createdBy: { id, name }` and `updatedBy: { id, name }` via `auditUserAliases()` innerJoin — canonical pattern from `src/modules/organizations/cost-centers/` (PRD #5+).
