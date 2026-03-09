# Vacations (Ferias)

Gestao de ferias com periodos aquisitivo e concessivo inline e controle de dias.

## Business Rules

- `startDate` deve ser <= `endDate`
- `daysUsed` deve ser >= 0 e <= `daysEntitled`. Nao e validado contra o intervalo de datas (`endDate - startDate`) -- intencional, pois ferias CLT podem ser fracionadas
- Periodos aquisitivo e concessivo: campos inline na tabela `vacations` (nao entidade separada)
  - `acquisitionPeriodStart` / `acquisitionPeriodEnd` (opcionais)
  - `concessivePeriodStart` / `concessivePeriodEnd` (opcionais)
  - Calculados a partir da data de admissao do employee (12 meses cada)
- `daysEntitled`: dias de direito (default 30, CLT)
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
- `daysEntitled` (inteiro, default 30)
- `daysUsed` (inteiro)
- `notes` (opcional)

## Errors

- `VacationNotFoundError` (404)
- `VacationAlreadyDeletedError` (404)
- `VacationInvalidEmployeeError` (404)
- `VacationInvalidDateRangeError` (422)
- `VacationInvalidDaysError` (422) -- daysUsed > daysEntitled ou valores invalidos
- `VacationOverlapError` (409) -- same employee + overlapping dates (excluding canceled)
- `EmployeeTerminatedError` (422) -- shared, from `src/lib/errors/employee-status-errors.ts`
