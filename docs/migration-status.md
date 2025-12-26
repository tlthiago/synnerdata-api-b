# Status de Migração - Projeto Antigo (NestJS) → Novo (Elysia)

> **Última atualização:** 2025-12-26

Este documento acompanha o progresso da migração dos módulos do projeto NestJS antigo para a nova arquitetura Elysia/Drizzle.

---

## Resumo

| Status | Quantidade |
|--------|------------|
| ✅ Concluído | 18 |
| 🔄 Em Progresso | 0 |
| ⏳ Pendente | 0 |
| ⏭️ Não Aplicável | 6 |

**Progresso: 100% concluído (18/18 módulos)**

---

## Legenda

- ✅ **Concluído** - Módulo migrado e testado
- 🔄 **Em Progresso** - Migração iniciada
- ⏳ **Pendente** - Aguardando migração
- ⏭️ **Não Aplicável** - Já existe no novo projeto ou não será migrado

---

## Módulos Já Existentes no Novo Projeto

Estes módulos já foram implementados nativamente no novo projeto (não são migração):

| Módulo Novo | Descrição | Status |
|-------------|-----------|--------|
| Auth (better-auth) | Autenticação, usuários, sessões | ✅ Implementado |
| Organizations | Organizações e membros | ✅ Implementado |
| Organization Profiles | Perfil da organização (dados fiscais) | ✅ Implementado |
| Payments | Checkout, subscriptions, plans (Pagar.me) | ✅ Implementado |
| Audit | Logs de auditoria | ✅ Implementado |

---

## Fase 1: Estrutura Organizacional ✅ COMPLETA

| # | Antigo (PT) | Novo (EN) | Tabela | Status | Notas |
|---|-------------|-----------|--------|--------|-------|
| 1 | Filiais | Branches | `branches` | ✅ Concluído | CNPJ único, soft delete |
| 2 | Setores | Sectors | `sectors` | ✅ Concluído | Apenas nome, soft delete |
| 3 | Centros de Custo | Cost Centers | `cost_centers` | ✅ Concluído | Apenas nome, soft delete |
| 4 | CBOs | Job Classifications | `job_classifications` | ✅ Concluído | Apenas nome, soft delete |
| 5 | Funções | Job Positions | `job_positions` | ✅ Concluído | Nome + descrição, soft delete |

---

## Fase 2: Gestão de Funcionários

### Migrados

| # | Antigo (PT) | Novo (EN) | Tabela | Status | Notas |
|---|-------------|-----------|--------|--------|-------|
| 6 | Funcionários | Employees | `employees` | ✅ Concluído | 45+ campos, 6 enums, 6 FKs, CPF único, soft delete |
| 7 | Ausências/Faltas | Absences | `absences` | ✅ Concluído | Enum: justified/unjustified, 16 testes |
| 8 | Atestados | Medical Certificates | `medical_certificates` | ✅ Concluído | CID, médico, dias afastamento, 33 testes |
| 9 | Férias | Vacations | `vacations` | ✅ Concluído | Enum status, período aquisitivo, 39 testes |
| 10 | Advertências | Warnings | `warnings` | ✅ Concluído | Enum: verbal/written/suspension, 37 testes |
| 11 | Demissões | Terminations | `terminations` | ✅ Concluído | Enum type, 39 testes |
| 12 | Promoções | Promotions | `promotions` | ✅ Concluído | FKs job_positions, 40 testes |
| 13 | Análise de CPF | CPF Analysis | `cpf_analyses` | ✅ Concluído | Enum status/riskLevel, score, ~37 testes |

---

## Fase 3: Saúde e Segurança (SST) ✅ COMPLETA

| # | Antigo (PT) | Novo (EN) | Tabela | Complexidade | Dependências | Status |
|---|-------------|-----------|--------|--------------|--------------|--------|
| 14 | Acidentes | Accidents | `accidents` | Média | Employees | ✅ Concluído |
| 15 | EPIs | PPE (Equipment) | `ppe_items` | Média | Job Positions (M2M) | ✅ Concluído |
| 16 | Entregas de EPIs | PPE Deliveries | `ppe_deliveries` | Complexa | Employees, PPE Items | ✅ Concluído |

---

## Fase 4: Jurídico e Projetos ✅ COMPLETA

| # | Antigo (PT) | Novo (EN) | Tabela | Complexidade | Dependências | Status |
|---|-------------|-----------|--------|--------------|--------------|--------|
| 17 | Ações Trabalhistas | Labor Lawsuits | `labor_lawsuits` | Complexa | Employees | ✅ Concluído |
| 18 | Projetos | Projects | `projects` | Média | Employees (M2M) | ✅ Concluído |

---

## Não Aplicável / Já Coberto

| Antigo (PT) | Motivo | Status |
|-------------|--------|--------|
| Empresas | Coberto por Organizations + Profiles | ⏭️ N/A |
| Usuários | Coberto por better-auth | ⏭️ N/A |
| Auth/Tokens | Coberto por better-auth | ⏭️ N/A |
| Pagamentos | Coberto por módulo Payments | ⏭️ N/A |
| Mail | Coberto por lib/email | ⏭️ N/A |
| Status/Health | Coberto por endpoint /health | ⏭️ N/A |

---

## Ordem de Implementação Sugerida

### Próximos (Fase 3 - SST) ✅ COMPLETA
1. ~~**Accidents** - Média, depende de Employees~~ ✅
2. ~~**PPE Items** - Média, M2M com Job Positions~~ ✅
3. ~~**PPE Deliveries** - Complexa, depende de Employees + PPE Items~~ ✅

### Por Último (Fase 4 - Jurídico/Projetos) ✅ COMPLETA
4. ~~**Labor Lawsuits** - Complexa, depende de Employees~~ ✅
5. ~~**Projects** - Média, M2M com Employees~~ ✅

---

## Decisões de Migração

### Padrões Aplicados

| Aspecto | Antigo | Novo |
|---------|--------|------|
| Soft Delete | `status: 'A'/'I'/'E'/'P'` | `deletedAt` timestamp |
| Nomenclatura | Português | Inglês |
| ORM | TypeORM | Drizzle |
| Validação | class-validator | Zod |
| Resposta API | `{ succeeded, data, message }` | `{ success, data }` |
| IDs | UUID sem prefixo | `{resource}-{uuid}` |
| Estrutura de Rotas | Aninhada `/organization/*` | Flat `/v1/*` |

### Estrutura de Rotas RESTful

O projeto adota estrutura **flat** com prefixo `/v1/`:

```text
/v1/organization/profile      - Perfil da organização
/v1/organization/billing-status

/v1/branches                  - CRUD de filiais
/v1/sectors                   - CRUD de setores
/v1/cost-centers              - CRUD de centros de custo
/v1/job-positions             - CRUD de funções
/v1/job-classifications       - CRUD de CBOs
/v1/ppe-items                 - CRUD de EPIs + M2M job-positions

/v1/employees                 - CRUD de funcionários

/v1/absences                  - CRUD de ausências
/v1/vacations                 - CRUD de férias
/v1/warnings                  - CRUD de advertências
/v1/medical-certificates      - CRUD de atestados
/v1/cpf-analyses              - CRUD de análises de CPF
/v1/terminations              - CRUD de demissões
/v1/promotions                - CRUD de promoções
/v1/accidents                 - CRUD de acidentes de trabalho
/v1/labor-lawsuits            - CRUD de ações trabalhistas
/v1/projects                  - CRUD de projetos + M2M employees
```

**Agrupamento OpenAPI via tags:**
- `Organization - Branches`, `Organization - Sectors`, etc.
- `Employees`
- `Occurrences - Absences`, `Occurrences - Vacations`, etc.

### Campos Únicos com Soft Delete

Quando um campo tem constraint `unique` e usa soft delete, usar índice parcial:
```sql
CREATE UNIQUE INDEX ON resources (field) WHERE deleted_at IS NULL;
```

Exemplo: `taxId` em branches, `cpf` em employees.

---

## Notas de Implementação

### Módulos Complexos

**Employees (Funcionários):**
- Maior entidade do sistema (611 linhas de service no antigo)
- 10+ relacionamentos com outras entidades
- Campos: dados pessoais, documentos, contrato, salário, endereço, etc.
- Enums: ContractType, EducationLevel, Gender, MaritalStatus, Shift, EmployeeStatus

**PPE Deliveries (Entregas de EPIs):**
- M2M com PPE Items
- Audit trail de entregas (logs)
- Relacionamento com Employees

**Labor Lawsuits (Ações Trabalhistas):**
- Muitos campos específicos (processo, partes, advogados, valores)
- Estados de progresso do caso

### Relacionamentos M2M

| Entidade 1 | Entidade 2 | Tabela Junção | Status |
|------------|------------|---------------|--------|
| Job Positions | PPE Items | `ppe_job_positions` | ✅ Implementado |
| Projects | Employees | `project_employees` | ✅ Implementado |
| PPE Deliveries | PPE Items | `ppe_delivery_items` | ✅ Implementado |

---

## Estatísticas de Testes

| Módulo | Testes | Status |
|--------|--------|--------|
| Branches | ~35 | ✅ |
| Sectors | ~35 | ✅ |
| Cost Centers | ~35 | ✅ |
| Job Classifications | ~35 | ✅ |
| Job Positions | 38 | ✅ |
| Employees | 41 | ✅ |
| Absences | 16 | ✅ |
| Medical Certificates | 33 | ✅ |
| Vacations | 39 | ✅ |
| Warnings | 37 | ✅ |
| CPF Analysis | ~37 | ✅ |
| Terminations | 39 | ✅ |
| Promotions | 40 | ✅ |
| Accidents | 41 | ✅ |
| PPE Items | 54 | ✅ |
| PPE Deliveries | 54 | ✅ |
| Labor Lawsuits | 40 | ✅ |
| Projects | 69 | ✅ |
| **Total** | **~772** | ✅ |

---

## Histórico de Atualizações

| Data | Módulo | Ação |
|------|--------|------|
| 2025-12-26 | Projects | ✅ Migração concluída (69 testes, M2M Employees, 8 endpoints) - **MIGRAÇÃO 100% COMPLETA** |
| 2025-12-26 | Labor Lawsuits | ✅ Migração concluída (40 testes, 17+ campos, relacionamento com Employees) |
| 2025-12-26 | PPE Deliveries | ✅ Migração concluída (54 testes, M2M PPE Items, logs de auditoria) |
| 2025-12-26 | PPE Items | ✅ Migração concluída (54 testes, M2M Job Positions) |
| 2025-12-26 | Accidents | ✅ Migração concluída (41 testes) |
| 2025-12-24 | Rotas | 🔄 Reestruturação para padrão RESTful flat `/v1/*` |
| 2025-12-24 | Promotions | ✅ Migração concluída (40 testes) |
| 2025-12-24 | Terminations | ✅ Migração concluída (39 testes) |
| 2025-12-24 | CPF Analysis | ✅ Migração concluída (~37 testes) |
| 2025-12-24 | Warnings | ✅ Migração concluída (37 testes) |
| 2025-12-24 | Vacations | ✅ Migração concluída (39 testes) |
| 2025-12-24 | Medical Certificates | ✅ Migração concluída (33 testes) |
| 2025-12-24 | Absences | ✅ Migração concluída (16 testes) |
| 2025-12-24 | Employees | ✅ Migração concluída (45+ campos, 6 enums, 41 testes) |
| 2025-12-24 | Job Positions | ✅ Migração concluída (38 testes) |
| 2025-12-24 | Job Classifications | ✅ Migração concluída |
| 2025-12-24 | Cost Centers | ✅ Migração concluída |
| 2025-12-24 | Branches | ✅ Migração concluída |
| 2025-12-24 | Sectors | ✅ Migração concluída |
| 2025-12-24 | - | 📄 Documento criado |
