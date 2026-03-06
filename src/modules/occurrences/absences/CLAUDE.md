# Absences (Ausências)

Registro de faltas de funcionários (justificadas ou injustificadas).

## Business Rules

- `startDate` deve ser ≤ `endDate` (validação de range)
- Employee deve existir e não estar deletado na organização
- Employee deve estar ativo no create (`ensureEmployeeActive` — rejeita TERMINATED e ON_VACATION)
- Overlap check no create: mesmo employee + mesmo type + datas sobrepostas lança `AbsenceOverlapError`
- Listagem ordenada por `startDate`

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
- `EmployeeTerminatedError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
- `EmployeeOnVacationError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
