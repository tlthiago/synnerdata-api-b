# Promotions (Promoções)

Registro de promoções com mudança de cargo e salário. Sincroniza automaticamente o cadastro do funcionário.

## Business Rules

- `previousJobPositionId` ≠ `newJobPositionId` (cargo deve mudar)
- `newSalary` > `previousSalary` (salário deve aumentar)
- Ambos os cargos validados via `JobPositionService.findByIdOrThrow()`
- Employee validado via `EmployeeService.findByIdOrThrow()`
- Salários: numbers na API, strings no banco, comparados como numbers internamente
- Duplicate check no create: mesmo employee + mesma `promotionDate` lança `PromotionDuplicateDateError`
- Employee deve estar ativo no create (`ensureEmployeeActive` — rejeita TERMINATED e ON_VACATION)
- `employeeId` é imutável após criação — para reatribuir, criar nova ocorrência e deletar a original
- Permissão usa resource específico `promotion`
- Listagem ordenada por `promotionDate`

## Employee Sync

- **Create**: atualiza `salary` e `jobPositionId` do employee **apenas se a promoção é a mais recente por data** (retroativas são salvas como registro histórico sem efeito)
- **Update**: **apenas a promoção mais recente** do employee pode ser editada (lança `PromotionNotLatestError` caso contrário). Após update, re-sincroniza o employee
- **Delete**: **apenas a promoção mais recente** do employee pode ser deletada (lança `PromotionNotLatestError` caso contrário). Reverte employee para valores da promoção anterior (se existir) ou para `previousSalary`/`previousJobPositionId` da promoção deletada (se era a única)

## Relationships

- FK Employee (obrigatório)
- FK JobPosition × 2 (previous e new) — usa aliased table joins nas queries

## Fields

- `promotionDate` (ISO date)
- `previousSalary`, `newSalary` (strings numéricas)
- `reason` (max 500, opcional), `notes` (max 1000, opcional)

## Audit logging

- Plugin: `auditPlugin` registered in controller
- Resource key: `promotion`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- PII set extended with `previousSalary` and `newSalary` (default `salary` doesn't match these column names)
- Ignored fields: `employee`, `employeeId`, `previousJobPosition`, `previousJobPositionId`, `newJobPosition`, `newJobPositionId` — JOIN-shaped nested objects and their FK columns; audit focuses on the mutable content fields (`promotionDate`, salaries, `reason`, `notes`)
- Side effects via `syncEmployeeFromPromotion` (employee `salary` + `jobPositionId` transitions) ARE audited as `resource: "employee"` entries — only when at least one of the two fields actually changes. Salary is redacted via default `PII_FIELDS`; `jobPositionId` appears as actual ID.
- **Read audit enabled** on `GET /:id` — promotion records include salary information; LGPD financial PII

## Errors

- `PromotionNotFoundError` (404)
- `PromotionAlreadyDeletedError` (404)
- `InvalidPromotionDataError` (422) — cargo igual ou salário não aumentou
- `PromotionDuplicateDateError` (409) — same employee + same date
- `PromotionNotLatestError` (422) — tentativa de editar/deletar promoção que não é a mais recente
- `EmployeeTerminatedError` (422) — shared, from `src/modules/employees/errors.ts`
- `EmployeeOnVacationError` (422) — shared, from `src/modules/employees/errors.ts`

## User Attribution Shape

Response exposes `createdBy: { id, name }` and `updatedBy: { id, name }` via `auditUserAliases()` innerJoin — canonical pattern from `src/modules/organizations/cost-centers/` (PRD #5+). Replaces the legacy `z.string().nullable()` shape with `entityReferenceSchema` (FK NOT NULL since PRD #3).
