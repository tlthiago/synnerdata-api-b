# Occurrences Module

Eventos e registros vinculados a funcionários. Toda ocorrência pertence a um employee que pertence a uma organization.

Vacations armazena periodos aquisitivo e concessivo inline (campos na propria tabela, sem entidade separada).

## Common Patterns (all submodules)

- Todas as ocorrências referenciam `employeeId` (obrigatório) — employee deve existir, pertencer à organização e não estar deletado
- Organization scoping via `session.activeOrganizationId` em todas as queries
- Soft delete em todos os sub-módulos (`deletedAt`/`deletedBy`) — re-delete lança `AlreadyDeletedError` (404)
- Audit trail: `createdBy`, `updatedBy`, `deletedBy` com userId da sessão
- ID format: `<entity>-${crypto.randomUUID()}` (e.g., `absence-...`, `accident-...`)
- Service: abstract class com métodos estáticos, private `findById`/`findByIdIncludingDeleted`
- Listagem ordenada pelo campo de data principal de cada entidade
- Campos de data não aceitam datas no futuro (exceções: férias `startDate`/`endDate` podem ser futuras; medical-certificates `endDate` pode ser futuro)
- Ranges de data (startDate/endDate) validam que início ≤ fim
- Updates parciais validam datas contra valores existentes no DB via service
- Helper compartilhado: `isFutureDate` e `isFutureDatetime` em `src/lib/schemas/date-helpers.ts`

## Employee Status Validation on Create

Shared helpers at `src/modules/employees/status.ts` and errors at `src/modules/employees/errors.ts`.

- `ensureEmployeeActive` (rejects TERMINATED + ON_VACATION): absences, accidents, cpf-analyses, medical-certificates, promotions, warnings, ppe-deliveries
- `ensureEmployeeNotTerminated` (rejects only TERMINATED, ON_VACATION allowed): vacations, labor-lawsuits
- Vacations also validate `daysUsed <= daysEntitled`
- No status check: terminations

Shared errors: `EmployeeTerminatedError` (422), `EmployeeOnVacationError` (422).

## Duplicate / Overlap Prevention on Create

| Module | Validation | Scope | Error (409) |
|---|---|---|---|
| absences | Date overlap | same employee + same type | `AbsenceOverlapError` |
| medical-certificates | Date overlap | same employee (no type filter) | `MedicalCertificateOverlapError` |
| vacations | Date overlap | same employee (excluding canceled) | `VacationOverlapError` |
| accidents | CAT unique | per organization (only when provided) | `AccidentCatAlreadyExistsError` |
| cpf-analyses | Same date | same employee | `CpfAnalysisDuplicateDateError` |
| promotions | Same date | same employee | `PromotionDuplicateDateError`. Update/delete restricted to latest promotion per employee (`PromotionNotLatestError`) |
| warnings | Same date + type | same employee | `WarningDuplicateError` |
| terminations | One active | per employee | `TerminationAlreadyExistsError` |
| labor-lawsuits | processNumber unique | global (CNJ, unique index) | `LaborLawsuitProcessNumberAlreadyExistsError` |
| ppe-deliveries | None | multiple deliveries per day are valid | — |

## Permissions

- Maioria usa resource name específico: `{ absence: ["create"] }`, `{ accident: ["read"] }`
- Sem exceções: cada recurso usa sua chave específica (e.g., `{ promotion: ["create"] }`, `{ termination: ["create"] }`)
- Todos requerem `requireOrganization: true`
