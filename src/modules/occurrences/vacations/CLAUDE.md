# Vacations (Ferias)

Gestao de ferias com periodos aquisitivo e concessivo inline e controle de dias.

## Business Rules

- `startDate` deve ser <= `endDate`
- Nenhuma data das ferias pode ser anterior a data de admissao do funcionario (`hireDate`): `startDate`, `endDate`. (Os periodos aquisitivo/concessivo sao computados a partir do `hireDate`, portanto sempre posteriores por construcao.)
- `daysEntitled` deve corresponder exatamente ao intervalo de datas (`endDate - startDate + 1`), validado via `calculateDaysBetween` no service
- **Soma de `daysEntitled` por aquisitivo nao pode exceder 30 dias** (CLT art. 130). Validado no service via `ensureAquisitivoLimit` considerando todos os registros nao-cancelados e nao-deletados do mesmo employee no mesmo `acquisition_period_start`. Aplicado em create (usando periodos computados) e update (usando o snapshot armazenado, excluindo o proprio registro). Registros com `status = canceled` ou `deletedAt != null` nao contam.
- `daysUsed` deve ser >= 0 e <= `daysEntitled`
- Periodos aquisitivo e concessivo: campos inline na tabela `vacations` (nao entidade separada)
  - `acquisitionPeriodStart` / `acquisitionPeriodEnd` / `concessivePeriodStart` / `concessivePeriodEnd`
  - **Calculados pelo backend** via `computePeriodsFromHireDate(hireDate, vacation.startDate)`. O aquisitivo retornado eh aquele cujo concessivo contem a `startDate` — ou seja, o ciclo pendente para gozo, nao o ciclo que esta acumulando. Helper em `src/modules/occurrences/vacations/period-calculation.ts`.
  - **Nao considera historico** de ferias anteriores nem seed manual no employee — tudo eh derivado de `hireDate` + `startDate`. Suporte a ferias fracionadas (multiplos registros no mesmo aquisitivo) sera implementado em issue separada (#227).
  - **Erro `VacationNoRightsError` (422)** quando `startDate` eh anterior ao primeiro aniversario da admissao (funcionario sem direito adquirido).
  - Regra CLT: aquisitivo = 12 meses; concessivo = 12 meses apos o fim do aquisitivo.
  - **Read-only na API**: removidos dos schemas Zod de create/update. Enviados no payload sao silenciosamente stripados. Frontend exibe em DatePickers desabilitados.
  - Snapshot historico do momento da criacao — updates preservam os valores (nao recalculam).
- `daysEntitled`: dias (calculado pelo frontend como endDate - startDate + 1, sem default)
- Overlap check no create/update: mesmo employee + datas sobrepostas (excluindo ferias canceladas) lanca `VacationOverlapError`
- Employee nao pode estar desligado no create (`ensureEmployeeNotTerminated` -- ON_VACATION e esperado/permitido)
- Status padrao: `scheduled`
- Listagem ordenada por `startDate`
- Listagem por funcionario via `GET /v1/vacations/employee/:employeeId` -- retorna historico completo de ferias do employee

## Employee Status Sync

Criar, atualizar status ou deletar ferias sincroniza automaticamente o status do funcionario via `syncEmployeeStatus`:

| Status da ferias | Status do funcionario |
|---|---|
| `scheduled` | `VACATION_SCHEDULED` |
| `in_progress` | `ON_VACATION` |
| `completed` / `canceled` / deletado | `ACTIVE` (se nao houver outras ferias ativas) |

Prioridade: `in_progress` > `scheduled` > `ACTIVE`. O helper consulta todas as ferias ativas (nao deletadas, nao canceladas, nao completadas) do funcionario para determinar o status correto.

## Enums

- status: definido via `vacationStatusEnum` no DB (default: `scheduled`)

## Fields

- `startDate`, `endDate` (datas das ferias)
- `acquisitionPeriodStart`, `acquisitionPeriodEnd` (periodo aquisitivo — **computado pelo backend**, read-only na API, presente na response)
- `concessivePeriodStart`, `concessivePeriodEnd` (periodo concessivo — **computado pelo backend**, read-only na API, presente na response)
- `daysEntitled` (inteiro, 1 a 30 conforme CLT art. 130, obrigatorio, sem default)
- `daysUsed` (inteiro)
- `notes` (opcional)

## Errors

- `VacationNotFoundError` (404)
- `VacationAlreadyDeletedError` (404)
- `VacationInvalidEmployeeError` (404)
- `VacationInvalidDateRangeError` (422)
- `VacationInvalidDaysError` (422) -- daysEntitled != intervalo de datas, ou daysUsed > daysEntitled
- `VacationDateBeforeHireError` (422) -- qualquer data anterior a hireDate do funcionario
- `VacationAquisitivoExceededError` (422) -- soma de `daysEntitled` no aquisitivo excederia 30 dias. Details: `{ acquisitionPeriodStart, acquisitionPeriodEnd, currentTotal, requestedDays, daysRemaining, maxAllowed: 30 }`.
- `VacationNoRightsError` (422) -- `startDate` anterior ao primeiro aniversario da admissao
- `VacationOverlapError` (409) -- same employee + overlapping dates (excluding canceled)
- `EmployeeTerminatedError` (422) -- shared, from `src/modules/employees/errors.ts`

## Scheduled Jobs

Jobs automaticos em `vacation-jobs.service.ts`, registrados em `src/lib/cron-plugin.ts` (03:00 UTC / 00:00 BRT diariamente):

| Job | Acao |
|---|---|
| `activateScheduledVacations` | `scheduled` → `in_progress` quando `startDate <= hoje` |
| `completeExpiredVacations` | `in_progress` → `completed` quando `endDate < hoje` |

Ambos sincronizam o status do funcionario apos a transicao via `syncEmployeeStatus`.
