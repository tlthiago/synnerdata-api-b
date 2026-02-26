# Employees Module

Cadastro e gestão de funcionários vinculados a uma organização.

## Business Rules

- Employee pertence a uma organization (multi-tenant via session.activeOrganizationId)
- CPF é único por organização (não global) — validado em create e update
- Criação verifica limite do plano de assinatura via `LimitsService.requireEmployeeLimit()`
- Soft delete — nunca hard delete

## Relationships (validated on create/update)

- **Obrigatórias**: sector, jobPosition, jobClassification
- **Opcionais**: branch, costCenter
- Todas validadas contra a mesma organização antes de persistir
- Response expande FK IDs para `EntityReference` ({ id, name }) via `enrichEmployee()`

## Status Lifecycle

`ACTIVE` → `ON_LEAVE` | `ON_VACATION` | `VACATION_SCHEDULED` | `TERMINATED`

Alterado via `PATCH /:id/status` (endpoint dedicado, não pelo PUT geral)

## Data Conventions

- Campos numéricos (salary, height, weight, weeklyHours, allowances) entram como `number` na API mas são armazenados como `string` no banco (colunas decimal)
- Documentos brasileiros: CPF (11 dígitos), PIS (11 dígitos), CTPS (número + série), CEP (8 dígitos), UF (2 chars)
- Datas (birthDate, hireDate) não podem ser futuras

## Enums

- contractType: `CLT` | `PJ`
- gender: `MALE` | `FEMALE` | `NOT_DECLARED` | `OTHER`
- maritalStatus: `SINGLE` | `MARRIED` | `DIVORCED` | `WIDOWED` | `STABLE_UNION` | `SEPARATED`
- workShift: `TWELVE_THIRTY_SIX` | `SIX_ONE` | `FIVE_TWO` | `FOUR_THREE`
- educationLevel: `ELEMENTARY` | `HIGH_SCHOOL` | `BACHELOR` | `POST_GRADUATE` | `MASTER` | `DOCTORATE`
- status: `ACTIVE` | `TERMINATED` | `ON_LEAVE` | `ON_VACATION` | `VACATION_SCHEDULED`
