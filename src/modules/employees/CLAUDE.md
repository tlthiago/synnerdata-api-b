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

## Import (Bulk)

- `GET /v1/employees/import/template` — downloads .xlsx template populado com dados da org
- `POST /v1/employees/import` — importa funcionários via .xlsx (multipart/form-data)
- Template é per-organization (dropdowns dinâmicos de setores, cargos, CBOs, filiais, centros de custo)
- Import parcial: linhas válidas inseridas, inválidas reportadas no response
- Máx 500 linhas por arquivo
- Respeita limite de funcionários do plano
- Audit log: action "create", resource "employee"
- Enums usam labels PT-BR no template, mapeados de volta no import
- FK fields (setor, cargo, CBO, filial, centro de custo) resolvidos por nome → ID
- Datas no template: DD/MM/AAAA, parseadas para YYYY-MM-DD
- CPF validado: formato + algoritmo + unicidade na org + unicidade no arquivo

### Sub-módulo Import

- `import/import.constants.ts` — label maps PT-BR, definições de colunas, limites
- `import/template.service.ts` — gera .xlsx com ExcelJS (3 abas: Instruções, Funcionários, Dados)
- `import/import.parser.ts` — parseia linhas, mapeia labels, resolve entidades, valida com Zod
- `import/import.service.ts` — orquestra parsing, dedup CPF, check limite, batch insert, audit
- `import/import.model.ts` — schemas Zod para response do import
- `import/import.errors.ts` — erros específicos do import
