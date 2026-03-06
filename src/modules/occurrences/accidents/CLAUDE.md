# Accidents (Acidentes de Trabalho)

Registro de acidentes de trabalho e incidentes.

## Business Rules

- `date` não pode ser no futuro
- `description` (max 500 chars) e `measuresTaken` (max 500 chars) são obrigatórios
- `nature` (max 255 chars) obrigatório — natureza do acidente
- `cat` (max 25 chars) opcional — número da CAT (Comunicação de Acidente de Trabalho)
- CAT number deve ser único por organização (validado apenas quando fornecido)
- Employee deve estar ativo no create (`ensureEmployeeActive` — rejeita TERMINATED e ON_VACATION)
- Listagem ordenada por `date`

## Errors

- `AccidentNotFoundError` (404)
- `AccidentAlreadyDeletedError` (404)
- `AccidentInvalidEmployeeError` (404)
- `AccidentCatAlreadyExistsError` (409) — CAT number unique per organization
- `EmployeeTerminatedError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
- `EmployeeOnVacationError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
