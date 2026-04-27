# Terminations (Desligamentos)

Registro de desligamentos de funcionários.

## Business Rules

- `terminationDate` e `lastWorkingDay` não podem ser no futuro
- `noticePeriodDays` (inteiro ≥ 0, opcional) + `noticePeriodWorked` (boolean, default false)
- `reason` (max 1000), `notes` (max 2000) — opcionais
- Um employee só pode ter um desligamento ativo (não deletado) — tentativa de criar segundo lança `TerminationAlreadyExistsError`
- Criar desligamento altera automaticamente o status do funcionário para `TERMINATED`
- Deletar (soft delete) desligamento reverte o status do funcionário para `ACTIVE`
- Sem verificação de status do employee no create (diferente dos demais sub-módulos)
- Permissão usa resource específico `termination`
- Listagem ordenada por `terminationDate`

## Audit logging

- Plugin: `auditPlugin` registered in controller
- Resource key: `termination`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Ignored fields: `employee` (JOIN-shaped virtual nested object) + `employeeId` (immutable FK; resource identity is captured via `resourceId`)
- The side-effect UPDATEs on `employees.status` (TERMINATED on create, ACTIVE on delete) are NOT audited as part of this resource — termination audit covers the termination row only
- **Read audit enabled** on `GET /:id` — termination records include rescission/dismissal context (LGPD-sensitive)

## Enums

- type: `RESIGNATION` | `DISMISSAL_WITH_CAUSE` | `DISMISSAL_WITHOUT_CAUSE` | `MUTUAL_AGREEMENT` | `CONTRACT_END`

## Errors

- `TerminationNotFoundError` (404)
- `TerminationAlreadyDeletedError` (404)
- `TerminationInvalidEmployeeError` (422)
- `TerminationAlreadyExistsError` (409) — one active termination per employee
