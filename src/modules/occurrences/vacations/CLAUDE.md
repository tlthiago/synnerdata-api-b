# Vacations (Ferias)

Gestao de ferias com periodos aquisitivo e concessivo inline e controle de dias, baseado no modelo de **ciclo ativo**.

## Business Rules

- `startDate` deve ser <= `endDate`
- Nenhuma data das ferias pode ser anterior a data de admissao do funcionario (`hireDate`): `startDate`, `endDate`. (Os periodos aquisitivo/concessivo sao computados a partir do `hireDate`, portanto sempre posteriores por construcao.)
- `daysEntitled` deve corresponder exatamente ao intervalo de datas (`endDate - startDate + 1`), validado via `calculateDaysBetween` no service
- **Soma de `daysEntitled` por aquisitivo nao pode exceder 30 dias** (CLT art. 130). Validado no service via `ensureAquisitivoLimit` considerando todos os registros nao-cancelados e nao-deletados do mesmo employee no mesmo `acquisition_period_start`. Aplicado em create (usando periodos do ciclo ativo) e update (usando o snapshot armazenado, excluindo o proprio registro). Registros com `status = canceled` ou `deletedAt != null` nao contam.
- `daysUsed` deve ser >= 0 e <= `daysEntitled`
- Periodos aquisitivo e concessivo: campos inline na tabela `vacations` (nao entidade separada)
  - `acquisitionPeriodStart` / `acquisitionPeriodEnd` / `concessivePeriodStart` / `concessivePeriodEnd`
  - **Calculados pelo backend** via `computeActiveCycle` (helper em `src/modules/occurrences/vacations/period-calculation.ts`), que resolve o ciclo ativo do funcionario no momento da criacao.
  - **Regra do ciclo ativo**: o sistema sempre apresenta o **primeiro ciclo** (do mais antigo ao mais recente) que satisfaz `daysUsed < 30` **E** `concessivePeriodEnd >= referenceDate`.
    - Ciclos com concessivo vencido **E** `daysUsed < 30` sao **silenciosamente pulados** (considera-se que o cliente ja fez o pagamento de multa externamente fora do sistema).
    - **Novos contratados** (< 1 aniversario completado) **nao sao mais bloqueados** — podem agendar ferias futuras desde que `startDate` esteja dentro do concessivo do 1o ciclo. `computePeriodsFromHireDate` retorna o ciclo 1 com `completed = 0` nesse caso (nao lanca mais erro).
    - `computeActiveCycle` nunca retorna um ciclo sem dias disponiveis ou com concessivo vencido — esses cenarios sao tratados como `VacationActiveCycleUnresolvableError` (defensivo, nao deve ocorrer com dados reais dentro do `SAFETY_BOUND_MONTHS = 24`).
  - **`startDate` obrigatoriamente dentro do concessivo do ciclo ativo** — caso contrario lanca `VacationStartDateOutsideConcessiveError` (422). Essa validacao substitui o antigo `VacationNoRightsError` para novos contratados.
  - **Nao considera seed manual** no employee — tudo eh derivado de `hireDate` + `daysEntitled` das ferias existentes no mesmo aquisitivo. Suporte a ferias fracionadas (multiplos registros no mesmo aquisitivo) ja eh considerado pelo `computeActiveCycle` via soma de `daysEntitled` por `acquisitionPeriodStart`.
  - Regra CLT: aquisitivo = 12 meses; concessivo = 12 meses apos o fim do aquisitivo.
  - **Read-only na API**: removidos dos schemas Zod de create/update. Enviados no payload sao silenciosamente stripados. Frontend exibe em DatePickers desabilitados.
  - **Snapshot historico do ciclo ativo** no momento da criacao — updates preservam os valores (nao recalculam). No `update()`, `validateDatesNotBeforeHire` ainda eh aplicado para registros legados cujo snapshot pode preceder as novas regras.
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

- `startDate`, `endDate` (datas das ferias — obrigatoriamente dentro do concessivo do ciclo ativo no momento do create)
- `acquisitionPeriodStart`, `acquisitionPeriodEnd` (periodo aquisitivo — **snapshot do ciclo ativo** resolvido pelo backend no create, read-only na API, presente na response)
- `concessivePeriodStart`, `concessivePeriodEnd` (periodo concessivo — **snapshot do ciclo ativo** resolvido pelo backend no create, read-only na API, presente na response)
- `daysEntitled` (inteiro, 1 a 30 conforme CLT art. 130, obrigatorio, sem default)
- `daysUsed` (inteiro)
- `notes` (opcional)

## Endpoints

- `POST /v1/vacations` — cria ferias. Resolve o ciclo ativo do employee e grava snapshot dos periodos aquisitivo/concessivo.
- `GET /v1/vacations` — lista todas as ferias da organizacao.
- `GET /v1/vacations/employee/:employeeId` — lista historico completo de ferias do employee.
- `GET /v1/vacations/employee/:employeeId/active-cycle` — retorna o ciclo ativo atual do employee. Response:
  ```json
  {
    "acquisitionPeriodStart": "YYYY-MM-DD",
    "acquisitionPeriodEnd": "YYYY-MM-DD",
    "concessivePeriodStart": "YYYY-MM-DD",
    "concessivePeriodEnd": "YYYY-MM-DD",
    "daysUsed": 0,
    "daysRemaining": 30
  }
  ```
  Usado pelo frontend para preencher os DatePickers desabilitados e mostrar o saldo disponivel antes da criacao.
- `GET /v1/vacations/:id` — detalha uma ferias.
- `PUT /v1/vacations/:id` — atualiza ferias. **Preserva o snapshot** dos periodos aquisitivo/concessivo; aplica `validateDatesNotBeforeHire` (para registros legados).
- `DELETE /v1/vacations/:id` — soft delete.

## Errors

- `VacationNotFoundError` (404)
- `VacationAlreadyDeletedError` (404)
- `VacationInvalidEmployeeError` (404)
- `VacationInvalidDateRangeError` (422)
- `VacationInvalidDaysError` (422) -- daysEntitled != intervalo de datas, ou daysUsed > daysEntitled
- `VacationDateBeforeHireError` (422) -- qualquer data anterior a hireDate do funcionario
- `VacationAquisitivoExceededError` (422) -- soma de `daysEntitled` no aquisitivo excederia 30 dias. Details: `{ acquisitionPeriodStart, acquisitionPeriodEnd, currentTotal, requestedDays, daysRemaining, maxAllowed: 30 }`.
- `VacationStartDateOutsideConcessiveError` (422) -- `startDate` fora do concessivo do ciclo ativo. Details: `{ startDate, concessivePeriodStart, concessivePeriodEnd }`. Substitui a antiga regra que bloqueava novos contratados.
- `VacationActiveCycleUnresolvableError` (500) -- defensivo, **nao alcancavel com dados reais**. Lancado por `computeActiveCycle` se nenhum ciclo viavel for encontrado dentro do `SAFETY_BOUND_MONTHS = 24`. Details: `{ hireDate, referenceDate }`.
- `VacationNoRightsError` (422) -- **legacy, nao mais lancado em producao**. Mantido no arquivo `errors.ts` para compatibilidade retroativa (codigos de erro ja expostos em integracoes / historicos). Novos contratados agora agendam ferias futuras livremente via ciclo ativo.
- `VacationOverlapError` (409) -- same employee + overlapping dates (excluding canceled)
- `EmployeeTerminatedError` (422) -- shared, from `src/modules/employees/errors.ts`

## Scheduled Jobs

Jobs automaticos em `vacation-jobs.service.ts`, registrados em `src/lib/cron-plugin.ts` (03:00 UTC / 00:00 BRT diariamente):

| Job | Acao |
|---|---|
| `activateScheduledVacations` | `scheduled` → `in_progress` quando `startDate <= hoje` |
| `completeExpiredVacations` | `in_progress` → `completed` quando `endDate < hoje` |

Ambos sincronizam o status do funcionario apos a transicao via `syncEmployeeStatus`.
