# Warnings (Advertências Disciplinares)

Registro de advertências e suspensões disciplinares.

## Business Rules

- `reason` obrigatório
- `date` não pode ser no futuro
- Rastreamento de ciência: `acknowledged` (boolean, default false) + `acknowledgedAt` (datetime opcional)
- `acknowledgedAt` não pode ser no futuro
- `acknowledgedAt` não pode ser anterior a `date`
- `acknowledgedAt` convertido de string para Date no service
- Duplicate check no create: mesmo employee + mesma `date` + mesmo `type` lança `WarningDuplicateError`
- Employee deve estar ativo no create (`ensureEmployeeActive` — rejeita TERMINATED e ON_VACATION)
- `employeeId` é imutável após criação — para reatribuir, criar nova ocorrência e deletar a original
- Listagem ordenada por `date`

## Audit logging

- Plugin: `auditPlugin` registered in controller
- Resource key: `warning`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Ignored fields: `employee` (JOIN-shaped virtual nested object) + `employeeId` (immutable FK; resource identity is captured via `resourceId`)
- **Read audit enabled** on `GET /:id` — disciplinary records are LGPD-sensitive (afetam histórico/reputação trabalhista)

## Enums

- type: `verbal` | `written` | `suspension`

## Fields

- `date` (YYYY-MM-DD)
- `reason` (obrigatório), `description` (opcional)
- `witnessName` (opcional)
- `acknowledged`, `acknowledgedAt`
- `notes` (opcional)

## Errors

- `WarningNotFoundError` (404)
- `WarningAlreadyDeletedError` (404)
- `WarningInvalidEmployeeError` (422)
- `WarningAcknowledgedBeforeDateError` (422)
- `WarningDuplicateError` (409) — same employee + date + type
- `EmployeeTerminatedError` (422) — shared, from `src/modules/employees/errors.ts`
- `EmployeeOnVacationError` (422) — shared, from `src/modules/employees/errors.ts`
