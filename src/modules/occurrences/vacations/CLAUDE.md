# Vacations (Férias)

Gestão de férias com controle de período aquisitivo e dias utilizados.

## Business Rules

- `startDate` deve ser ≤ `endDate`
- `daysUsed` deve ser > 0 e ≤ dias restantes no período aquisitivo
- Período aquisitivo: referenciado via `acquisitionPeriodId` (tabela `vacation_acquisition_periods`)
- Overlap check no create/update: mesmo employee + datas sobrepostas (excluindo férias canceladas) lança `VacationOverlapError`
- Employee não pode estar desligado no create (`ensureEmployeeNotTerminated` — ON_VACATION é esperado/permitido)
- Acquisition period deve pertencer ao mesmo employee e estar com status `available`
- Status padrão: `scheduled`
- Listagem ordenada por `startDate`

## Enums

- status: definido via `vacationStatusEnum` no DB (default: `scheduled`)

## Fields

- `daysUsed` (inteiro)
- `acquisitionPeriodId` (referência ao período aquisitivo)
- `notes` (opcional)

## Errors

- `VacationNotFoundError` (404)
- `VacationAlreadyDeletedError` (404)
- `VacationInvalidEmployeeError` (404)
- `VacationInvalidDateRangeError` (422)
- `VacationOverlapError` (409) — same employee + overlapping dates (excluding canceled)
- `EmployeeTerminatedError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
- `AcquisitionPeriodNotAvailableError` (422) — from acquisition-periods/errors
- `AcquisitionPeriodInsufficientDaysError` (422) — from acquisition-periods/errors
