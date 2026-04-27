# Vacations (Ferias)

Gestao de ferias com periodos aquisitivo e concessivo inline e controle de dias, baseado em **histórico de cadastros** (next cycle derivation).

## Business Rules

- `startDate` deve ser <= `endDate`
- Nenhuma data das ferias pode ser anterior a data de admissao do funcionario (`hireDate`): `startDate`, `endDate`. (Os periodos aquisitivo/concessivo sao computados a partir do `hireDate`, portanto sempre posteriores por construcao.)
- `daysEntitled` deve corresponder exatamente ao intervalo de datas (`endDate - startDate + 1`), validado via `calculateDaysBetween` no service
- **Soma de `daysEntitled` por aquisitivo nao pode exceder 30 dias** (CLT art. 130). Validado no service via `ensureAquisitivoLimit` considerando todos os registros nao-cancelados e nao-deletados do mesmo employee no mesmo `acquisition_period_start`. Aplicado em create (usando periodos do proximo ciclo) e update (usando o snapshot armazenado, excluindo o proprio registro). Registros com `status = canceled` ou `deletedAt != null` nao contam.
- `daysUsed` deve ser >= 0 e <= `daysEntitled`
- Periodos aquisitivo e concessivo: campos inline na tabela `vacations` (nao entidade separada)
  - `acquisitionPeriodStart` / `acquisitionPeriodEnd` / `concessivePeriodStart` / `concessivePeriodEnd`
  - **Calculados pelo backend** via `resolveNextCycle` (helper em `src/modules/occurrences/vacations/period-calculation.ts`), que resolve o próximo ciclo a ser cadastrado **com base no histórico de férias já registradas** — não há dependência do tempo atual.
  - **Regra do próximo ciclo**:
    - **Sem histórico** (funcionário ainda não tem férias cadastradas no sistema): retorna o **ciclo 1** — aquisitivo começa em `hireDate`, termina em `hireDate + 12 meses - 1 dia`. Concessivo imediatamente após.
    - **Com histórico**: identifica o maior `acquisitionPeriodStart` registrado:
      - Se `daysUsed < 30` nesse aquisitivo → retorna o **mesmo ciclo** (ainda tem saldo a cadastrar).
      - Se `daysUsed === 30` → retorna o **próximo ciclo contíguo** (`lastAquisitivoStart + 12 meses`).
    - Não há silent skip de ciclos vencidos — a sequência é contíguamente derivada do histórico.
  - **`startDate` é livre** dentro dos limites gerais do módulo (validações de `validateDates`, `validateDaysBetweenDates`, `ensureAquisitivoLimit`, `ensureNoOverlap`). O snapshot de aquisitivo/concessivo capturado no registro é sempre o ciclo retornado por `resolveNextCycle` (derivado do histórico), **mesmo quando `startDate` cai fora do concessivo desse ciclo** — isso representa o cenário de férias pagas fora do prazo legal (pago via multa, CLT art. 137).

    A **classificação "Pago via Multa"** é **derivada pela UI** (frontend) a partir da comparação `startDate > concessivePeriodEnd` do snapshot. Não é persistida no banco — o dado fica na combinação `(startDate, concessivePeriodEnd)`. Se futuramente precisarmos rastrear overrides manuais (ex: "gozado em data fora do prazo por acordo coletivo"), migrar pra campo persistido.
  - **Exemplo — empresa migrando**: funcionário admitido em 15/02/2019, sem férias cadastradas → primeiro cadastro cai no ciclo 1 (aquisitivo 15/02/2019-14/02/2020). Depois de completar 30 dias nesse ciclo → próximo cadastro cai no ciclo 2 (aquisitivo 15/02/2020-14/02/2021). Assim sucessivamente até chegar ao ciclo atual. O RH preserva a história da organização no sistema.
  - **Exemplo — pago via multa (Maria, caso reportado em homologação)**: funcionário admitido em 02/04/2024, sem férias cadastradas → `resolveNextCycle` retorna ciclo 1 (aquisitivo 02/04/2024-01/04/2025, concessivo 02/04/2025-01/04/2026). Hoje é 23/04/2026 — concessivo já terminou há 22 dias. Cadastro com `startDate=21/05/2026, endDate=31/05/2026` → aceito, snapshot captura ciclo 1. UI compara `startDate (21/05/2026) > concessivePeriodEnd (01/04/2026)` → exibe badge "Pago via Multa".
  - Suporte a ferias fracionadas (multiplos registros no mesmo aquisitivo) já é considerado por `resolveNextCycle` via soma de `daysEntitled` por `acquisitionPeriodStart`.
  - Regra CLT: aquisitivo = 12 meses; concessivo = 12 meses apos o fim do aquisitivo.
  - **Read-only na API**: removidos dos schemas Zod de create/update. Enviados no payload sao silenciosamente stripados. Frontend exibe em DatePickers desabilitados.
  - **Snapshot histórico** do ciclo resolvido no momento da criação — updates preservam os valores (não recalculam). No `update()`, `validateDatesNotBeforeHire` ainda é aplicado para registros legados.
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

## Audit logging

- Resource key: `vacation`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Ignored fields: `employee` (JOIN-shaped virtual nested object) + `employeeId` (immutable FK; resource identity is captured via `resourceId`)
- Side effects via `syncEmployeeStatus` (employee status transitions: ACTIVE / VACATION_SCHEDULED / ON_VACATION) ARE audited as `resource: "employee"` entries — only when status actually changes (no-op syncs produce no audit entry)
- Read audit: not enabled

## Enums

- status: definido via `vacationStatusEnum` no DB (default: `scheduled`)

## Fields

- `startDate`, `endDate` (datas das ferias — livres dentro dos limites gerais do módulo; quando `startDate > concessivePeriodEnd` do snapshot, a UI classifica como "Pago via Multa")
- `acquisitionPeriodStart`, `acquisitionPeriodEnd` (periodo aquisitivo — **snapshot do proximo ciclo** resolvido pelo backend no create, read-only na API, presente na response)
- `concessivePeriodStart`, `concessivePeriodEnd` (periodo concessivo — **snapshot do proximo ciclo** resolvido pelo backend no create, read-only na API, presente na response)
- `daysEntitled` (inteiro, 1 a 30 conforme CLT art. 130, obrigatorio, sem default)
- `daysUsed` (inteiro)
- `notes` (opcional)

## Endpoints

- `POST /v1/vacations` — cria ferias. Resolve o proximo ciclo do employee e grava snapshot dos periodos aquisitivo/concessivo.
- `GET /v1/vacations` — lista todas as ferias da organizacao.
- `GET /v1/vacations/employee/:employeeId` — lista historico completo de ferias do employee.
- `GET /v1/vacations/employee/:employeeId/next-cycle` — retorna o próximo ciclo de férias a ser cadastrado para o employee, baseado no histórico de férias registradas. Response:
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
  Usado pelo frontend para preencher os DatePickers desabilitados e mostrar o saldo disponivel antes da criacao (ciclo 1 quando o funcionário não possui histórico, ou próximo contíguo ao último registrado).
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
- `VacationNoRightsError` (422) -- **legacy, nao mais lancado em producao**. Mantido no arquivo `errors.ts` para compatibilidade retroativa (codigos de erro ja expostos em integracoes / historicos). Novos contratados agora agendam ferias futuras livremente via proximo ciclo.
- `VacationOverlapError` (409) -- same employee + overlapping dates (excluding canceled)
- `EmployeeTerminatedError` (422) -- shared, from `src/modules/employees/errors.ts`

## Scheduled Jobs

Jobs automaticos em `vacation-jobs.service.ts`, registrados em `src/lib/cron-plugin.ts` (03:00 UTC / 00:00 BRT diariamente):

| Job | Acao |
|---|---|
| `activateScheduledVacations` | `scheduled` → `in_progress` quando `startDate <= hoje` |
| `completeExpiredVacations` | `in_progress` → `completed` quando `endDate < hoje` |

Ambos sincronizam o status do funcionario apos a transicao via `syncEmployeeStatus`.
