# Vacations (Ferias)

Gestao de ferias com periodos aquisitivo e concessivo inline e controle de dias.

## Business Rules

- `startDate` deve ser <= `endDate`
- Nenhuma data pode ser anterior a data de admissao do funcionario (`hireDate`): `startDate`, `endDate`, `acquisitionPeriodStart`, `acquisitionPeriodEnd`, `concessivePeriodStart`, `concessivePeriodEnd`
- `daysEntitled` deve corresponder exatamente ao intervalo de datas (`endDate - startDate + 1`), validado via `calculateDaysBetween` no service
- `daysUsed` deve ser >= 0 e <= `daysEntitled`
- Periodos aquisitivo e concessivo: campos inline na tabela `vacations` (nao entidade separada)
  - `acquisitionPeriodStart` / `acquisitionPeriodEnd` (opcionais)
  - `concessivePeriodStart` / `concessivePeriodEnd` (opcionais)
  - Calculados pelo frontend a partir da data de admissao do employee (12 meses cada)
  - Periodo concessivo deve ser posterior ao periodo aquisitivo (`concessivePeriodStart > acquisitionPeriodEnd`)
- `daysEntitled`: dias (calculado pelo frontend como endDate - startDate + 1, sem default)
- Overlap check no create/update: mesmo employee + datas sobrepostas (excluindo ferias canceladas) lanca `VacationOverlapError`
- Employee nao pode estar desligado no create (`ensureEmployeeNotTerminated` -- ON_VACATION e esperado/permitido)
- Status padrao: `scheduled`
- Listagem ordenada por `startDate`
- Listagem por funcionario via `GET /v1/vacations/employee/:employeeId` -- retorna historico completo de ferias do employee

## Enums

- status: definido via `vacationStatusEnum` no DB (default: `scheduled`)

## Fields

- `startDate`, `endDate` (datas das ferias)
- `acquisitionPeriodStart`, `acquisitionPeriodEnd` (periodo aquisitivo, opcionais)
- `concessivePeriodStart`, `concessivePeriodEnd` (periodo concessivo, opcionais)
- `daysEntitled` (inteiro, obrigatorio, sem default)
- `daysUsed` (inteiro)
- `notes` (opcional)

## Errors

- `VacationNotFoundError` (404)
- `VacationAlreadyDeletedError` (404)
- `VacationInvalidEmployeeError` (404)
- `VacationInvalidDateRangeError` (422)
- `VacationInvalidDaysError` (422) -- daysEntitled != intervalo de datas, ou daysUsed > daysEntitled
- `VacationDateBeforeHireError` (422) -- qualquer data anterior a hireDate do funcionario
- `VacationConcessiveBeforeAcquisitionError` (422) -- concessivePeriodStart <= acquisitionPeriodEnd
- `VacationOverlapError` (409) -- same employee + overlapping dates (excluding canceled)
- `EmployeeTerminatedError` (422) -- shared, from `src/lib/errors/employee-status-errors.ts`
