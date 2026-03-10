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
- Permissão usa resource genérico `occurrence`, não `termination`
- Listagem ordenada por `terminationDate`

## Enums

- type: `RESIGNATION` | `DISMISSAL_WITH_CAUSE` | `DISMISSAL_WITHOUT_CAUSE` | `MUTUAL_AGREEMENT` | `CONTRACT_END`

## Errors

- `TerminationNotFoundError` (404)
- `TerminationAlreadyDeletedError` (404)
- `TerminationInvalidEmployeeError` (422)
- `TerminationAlreadyExistsError` (409) — one active termination per employee
