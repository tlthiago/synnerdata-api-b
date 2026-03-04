# Vacations (Férias)

Gestão de férias com controle de período aquisitivo e dias utilizados.

## Business Rules

- `startDate` deve ser ≤ `endDate`
- `daysTotal` deve ser > 0
- `daysUsed` deve ser ≥ 0 e ≤ `daysTotal`
- Período aquisitivo: `acquisitionPeriodStart` e `acquisitionPeriodEnd` definem quando os dias foram adquiridos
- Status padrão: `scheduled`
- Listagem ordenada por `startDate`

## Enums

- status: definido via `vacationStatusEnum` no DB (default: `scheduled`)

## Fields

- `daysTotal`, `daysUsed` (inteiros)
- `acquisitionPeriodStart`, `acquisitionPeriodEnd` (YYYY-MM-DD)
- `notes` (opcional)

## Errors

- `VacationNotFoundError` (404)
- `VacationAlreadyDeletedError` (404)
- `VacationInvalidEmployeeError` (404)
- `VacationInvalidDateRangeError` (422)
- `VacationInvalidDaysError` (422)
