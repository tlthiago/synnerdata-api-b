# Promotions (Promoções)

Registro de promoções com mudança de cargo e salário.

## Business Rules

- `previousJobPositionId` ≠ `newJobPositionId` (cargo deve mudar)
- `newSalary` > `previousSalary` (salário deve aumentar)
- Ambos os cargos validados via `JobPositionService.findByIdOrThrow()`
- Employee validado via `EmployeeService.findByIdOrThrow()`
- Salários: strings numéricas na API e no banco, comparados como numbers internamente
- Duplicate check no create: mesmo employee + mesma `promotionDate` lança `PromotionDuplicateDateError`
- Employee deve estar ativo no create (`ensureEmployeeActive` — rejeita TERMINATED e ON_VACATION)
- Permissão usa resource genérico `occurrence`, não `promotion`
- Listagem ordenada por `promotionDate`

## Relationships

- FK Employee (obrigatório)
- FK JobPosition × 2 (previous e new) — usa aliased table joins nas queries

## Fields

- `promotionDate` (ISO date)
- `previousSalary`, `newSalary` (strings numéricas)
- `reason` (max 500, opcional), `notes` (max 1000, opcional)

## Errors

- `PromotionNotFoundError` (404)
- `PromotionAlreadyDeletedError` (404)
- `InvalidPromotionDataError` (422) — cargo igual ou salário não aumentou
- `PromotionDuplicateDateError` (409) — same employee + same date
- `EmployeeTerminatedError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
- `EmployeeOnVacationError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
