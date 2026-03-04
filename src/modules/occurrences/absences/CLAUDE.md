# Absences (Ausências)

Registro de faltas de funcionários (justificadas ou injustificadas).

## Business Rules

- `startDate` deve ser ≤ `endDate` (validação de range)
- Employee deve existir e não estar deletado na organização
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
