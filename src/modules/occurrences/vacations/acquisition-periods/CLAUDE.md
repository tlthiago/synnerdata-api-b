# Acquisition Periods (Periodos Aquisitivos)

Gestao de periodos aquisitivos de ferias conforme CLT.

## Business Rules (CLT)

- Periodo aquisitivo: 12 meses de trabalho a partir da data de admissao (hireDate)
- Periodo concessivo: 12 meses seguintes ao fim do periodo aquisitivo (prazo para gozar as ferias)
- Direito padrao: 30 dias por periodo
- Periodos sao gerados automaticamente a partir da hireDate do employee
- Cada periodo e independente: daysEntitled (fixo 30), daysUsed (incrementado por ferias), daysRemaining (computed: daysEntitled - daysUsed)

## Status Lifecycle

`pending` -> `available` -> `used` | `expired`

- **pending**: periodo aquisitivo ainda em andamento (acquisitionEnd > today)
- **available**: periodo aquisitivo completado, ferias podem ser agendadas (acquisitionEnd <= today e concessionEnd >= today)
- **used**: todos os dias do periodo foram utilizados (daysUsed == daysEntitled)
- **expired**: periodo concessivo expirou sem uso completo dos dias (concessionEnd < today e daysUsed < daysEntitled)

## Generation Logic

- A partir da hireDate, gera periodos sequenciais de 12 meses
- Para cada periodo: acquisitionStart -> +12 meses -1 dia = acquisitionEnd
- concessionStart = acquisitionEnd + 1 dia; concessionEnd = concessionStart + 12 meses - 1 dia
- Status calculado baseado na data atual (today): pending, available, ou expired
- Gera ate encontrar o primeiro periodo `pending` (futuro)

## Cron Job

- `updatePeriodStatuses()` executado periodicamente
- Transiciona `pending` -> `available` quando acquisitionEnd <= today
- Transiciona `available` -> `expired` quando concessionEnd < today e daysUsed < daysEntitled
- Gera novo periodo `pending` para employees que nao possuem nenhum periodo pendente

## Event-Driven Generation

- **`employee.created`**: gera todos os periodos desde a hireDate ate o proximo periodo pendente
- **`employee.hireDateUpdated`**: recalcula todos os periodos (hard delete + regenerate)
- Listeners registrados em `src/modules/employees/hooks/listeners.ts`
- Registrado em `src/index.ts` via `registerEmployeeListeners()`

## HireDate Update Blocking

- Se qualquer periodo aquisitivo do employee tem `daysUsed > 0`, a alteracao da hireDate e bloqueada
- Validado via `ensureRecalculationAllowed()` no employee update
- Erro: `HireDateUpdateBlockedError` (409)

## Enums

- status: `pending` | `available` | `used` | `expired`

## Fields

- `acquisitionStart` / `acquisitionEnd` (datas do periodo aquisitivo)
- `concessionStart` / `concessionEnd` (datas do periodo concessivo)
- `daysEntitled` (inteiro, default 30)
- `daysUsed` (inteiro, default 0)
- `daysRemaining` (computed: daysEntitled - daysUsed, nao persiste no DB)
- `status` (enum)
- `notes` (opcional)

## Errors

- `AcquisitionPeriodNotFoundError` (404)
- `AcquisitionPeriodAlreadyDeletedError` (404)
- `AcquisitionPeriodInvalidEmployeeError` (404)
- `AcquisitionPeriodNotAvailableError` (422) -- periodo nao esta com status `available`
- `AcquisitionPeriodInsufficientDaysError` (422) -- dias solicitados > daysRemaining
- `AcquisitionPeriodDuplicateError` (409) -- periodo duplicado para mesmo employee + acquisitionStart
- `HireDateUpdateBlockedError` (409) -- hireDate nao pode ser alterada pois existem ferias vinculadas

## Permissions

- Usa as mesmas permissoes do modulo de vacations: `{ vacation: ["create" | "read" | "update" | "delete"] }`
