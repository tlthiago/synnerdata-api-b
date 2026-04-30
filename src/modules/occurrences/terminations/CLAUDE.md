# Terminations (Desligamentos)

Registro de desligamentos de funcionários com suporte a agendamento futuro.

## Business Rules

- `terminationDate` pode ser **passada, hoje ou futura**:
  - Se `terminationDate > hoje` → registro criado com `status = scheduled`, employee fica `TERMINATION_SCHEDULED`.
  - Se `terminationDate <= hoje` → registro criado com `status = completed`, employee vai para `TERMINATED`.
- `lastWorkingDay <= terminationDate` (independente de scheduled ou completed).
- `noticePeriodDays` (inteiro ≥ 0, opcional) + `noticePeriodWorked` (boolean, default false).
- `reason` (max 1000), `notes` (max 2000) — opcionais.
- Um employee só pode ter um desligamento ativo (não deletado) — `TerminationAlreadyExistsError` (409).
- Update que altera `terminationDate` flipa o `status` imediatamente (sem esperar cron).
- Soft delete seta `status = canceled` em paralelo a `deletedAt` — preserva o lifecycle do recurso no enum (estado de negócio) enquanto `deletedAt` mantém o sinal técnico de soft-delete (filtro universal `isNull(deletedAt)` em queries; permite restore por `UPDATE ... SET deleted_at = NULL`).
- Sem verificação de status do employee no create — `TERMINATION_SCHEDULED` não bloqueia outras ocorrências (employee em rescisão agendada ainda pode tirar férias, registrar atestado, etc., durante o aviso prévio).

## Status Lifecycle

- `scheduled` — `terminationDate` no futuro. Employee em `TERMINATION_SCHEDULED`.
- `completed` — `terminationDate <= hoje`. Employee em `TERMINATED`.
- `canceled` — soft-deleted. Employee revertido para `ACTIVE` (se não houver outras terminations ativas).

Transições:
- `scheduled` → `completed`: cron `process-scheduled-terminations` (03:00 UTC / 00:00 BRT) ou update direto da data.
- `scheduled` ↔ `completed`: update da `terminationDate` move entre os estados imediatamente.
- `*` → `canceled`: DELETE soft.

## Employee Status Sync

Helper `syncEmployeeStatusForTermination` (private, na service) consulta a única termination ativa do employee e calcula:

| Termination status | Employee status |
|---|---|
| `completed` | `TERMINATED` |
| `scheduled` | `TERMINATION_SCHEDULED` |
| `canceled` ou nenhuma ativa | `ACTIVE` |

Aplicado em create, update e delete. Sync no-op (mesmo status) não emite audit log.

O cron job (`TerminationJobsService.processScheduledTerminations`) usa `UPDATE` direto no employee (não passa pelo helper) — segue o precedente do `vacation-jobs.service.ts`. Sem audit log para o flip do cron porque `AuditService.log` exige `userId` não-null e o cron não tem actor humano.

## Audit logging

- Plugin: `auditPlugin` registered in controller.
- Resource key: `termination`.
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`).
- Ignored fields: `employee` (JOIN-shaped virtual nested object) + `employeeId` (immutable FK; resource identity é capturada via `resourceId`).
- Side effects on `employees.status` ARE audited as `resource: "employee"` quando o status efetivamente muda (no-op syncs não emitem entry).
- Cron job NÃO audita o flip employee status (limitação atual; vacations segue o mesmo precedente).
- **Read audit enabled** on `GET /:id` — termination records contêm contexto de rescisão/dispensa (LGPD-sensitive).

## Enums

- type: `RESIGNATION` | `DISMISSAL_WITH_CAUSE` | `DISMISSAL_WITHOUT_CAUSE` | `MUTUAL_AGREEMENT` | `CONTRACT_END`
- status: `scheduled` | `completed` | `canceled` (default DB: `completed`)

## Errors

- `TerminationNotFoundError` (404)
- `TerminationAlreadyDeletedError` (404)
- `TerminationInvalidEmployeeError` (422)
- `TerminationAlreadyExistsError` (409) — one active termination per employee

## Scheduled Jobs

| Job | Action |
|---|---|
| `process-scheduled-terminations` | `scheduled` → `completed` quando `terminationDate <= hoje`; flipa employee para `TERMINATED` |

Registrado em `src/plugins/cron/cron-plugin.ts` em `0 3 * * *` (03:00 UTC / 00:00 BRT).
