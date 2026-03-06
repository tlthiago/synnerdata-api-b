# Vacations (Ferias)

Gestao de ferias com controle de periodo aquisitivo e dias utilizados.

## Business Rules

- `startDate` deve ser <= `endDate`
- `daysUsed` deve ser >= 0 e <= dias restantes no periodo aquisitivo (`daysRemaining`). Nao e validado contra o intervalo de datas (`endDate - startDate`) -- intencional, pois ferias CLT podem ser fracionadas
- Periodo aquisitivo: referenciado via `acquisitionPeriodId` (tabela `vacation_acquisition_periods`)
- Acquisition period deve pertencer ao mesmo employee e estar com status `available`
- On vacation create: period's `daysUsed` incrementado; se totalmente usado, status -> `used`
- On vacation delete: period's `daysUsed` decrementado; se era `used`, status -> `available`
- Overlap check no create/update: mesmo employee + datas sobrepostas (excluindo ferias canceladas) lanca `VacationOverlapError`
- Employee nao pode estar desligado no create (`ensureEmployeeNotTerminated` -- ON_VACATION e esperado/permitido)
- Status padrao: `scheduled`
- Listagem ordenada por `startDate`
- Listagem por funcionario via `GET /v1/vacations/employee/:employeeId` -- retorna historico completo de ferias do employee

## Sub-module

- `acquisition-periods/` -- Gestao de periodos aquisitivos (ver `acquisition-periods/CLAUDE.md`)

## Enums

- status: definido via `vacationStatusEnum` no DB (default: `scheduled`)

## Fields

- `daysUsed` (inteiro)
- `acquisitionPeriodId` (referencia ao periodo aquisitivo)
- `notes` (opcional)

## Errors

- `VacationNotFoundError` (404)
- `VacationAlreadyDeletedError` (404)
- `VacationInvalidEmployeeError` (404)
- `VacationInvalidDateRangeError` (422)
- `VacationOverlapError` (409) -- same employee + overlapping dates (excluding canceled)
- `EmployeeTerminatedError` (422) -- shared, from `src/lib/errors/employee-status-errors.ts`
- `AcquisitionPeriodNotAvailableError` (422) -- from acquisition-periods/errors
- `AcquisitionPeriodInsufficientDaysError` (422) -- from acquisition-periods/errors
