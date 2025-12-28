# Sugestões de Novos Relatórios

## Visão Geral

Este documento apresenta uma análise dos dados disponíveis na plataforma que **não são utilizados** pelos relatórios existentes do Power BI, junto com sugestões de novos relatórios que agregariam valor significativo para os clientes.

---

## Análise: Dados Disponíveis vs Utilizados

### Entidades NÃO cobertas pelos relatórios Power BI

| Entidade | Dados Disponíveis | Cobertura Atual |
|----------|-------------------|-----------------|
| `promotions` | Histórico de promoções + reajustes salariais | ❌ Não utilizado |
| `labor_lawsuits` | Processos trabalhistas completos | ❌ Não utilizado |
| `cpf_analyses` | Análise de risco/crédito CPF | ❌ Não utilizado |
| `projects` + `project_employees` | Projetos e alocação de funcionários | ❌ Não utilizado |
| `vacations` | Gestão completa de férias | ⚠️ Parcial (apenas Status) |

### Campos de `employees` não explorados

| Campo | Potencial de Insight | Cobertura |
|-------|---------------------|-----------|
| `lastHealthExamDate` | Exames ASO vencidos/pendentes | ❌ Não utilizado |
| `admissionExamDate` | Compliance de exames admissionais | ❌ Não utilizado |
| `probation1ExpiryDate` | Experiências vencendo (45 dias) | ❌ Não utilizado |
| `probation2ExpiryDate` | Experiências vencendo (90 dias) | ❌ Não utilizado |
| `hasSpecialNeeds` | Diversidade e inclusão (PCD) | ❌ Não utilizado |
| `disabilityType` | Tipo de deficiência | ❌ Não utilizado |
| `hasChildren`, `childrenCount` | Perfil familiar | ❌ Não utilizado |
| `hasChildrenUnder21` | Dependentes (benefícios) | ❌ Não utilizado |
| `latitude`, `longitude` | Distribuição geográfica | ❌ Não utilizado |

---

## Novos Relatórios Sugeridos

### 1. Compliance e Exames (NR-7)

**Prioridade: CRÍTICA (obrigatório por lei)**

#### Justificativa
A NR-7 (Norma Regulamentadora 7) exige controle de exames ocupacionais. O não cumprimento gera multas e processos trabalhistas.

#### Fonte de Dados
```
employees.lastHealthExamDate
employees.admissionExamDate
employees.probation1ExpiryDate
employees.probation2ExpiryDate
```

#### KPIs Propostos

| KPI | Cálculo | Alerta |
|-----|---------|--------|
| ASO Vencidos | `lastHealthExamDate < hoje - 12 meses` | 🔴 Crítico |
| ASO Vencendo (30d) | `lastHealthExamDate < hoje - 11 meses` | 🟡 Atenção |
| Admissionais Pendentes | `admissionExamDate IS NULL` | 🔴 Crítico |
| Experiências Vencendo | `probation1/2ExpiryDate` próximas | 🟡 Atenção |

#### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  COMPLIANCE - EXAMES E EXPERIÊNCIAS                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │🔴 ASO     │  │🟡 ASO     │  │🔴 Admis.  │  │🟡 Exper.  │    │
│  │ Vencidos  │  │ Vencendo  │  │ Pendentes │  │ Vencendo  │    │
│  │    12     │  │    8      │  │    3      │  │    5      │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  📋 FUNCIONÁRIOS COM PENDÊNCIAS                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Nome          │ Tipo      │ Vencimento │ Dias  │ Ação   │   │
│  │ João Silva    │ ASO       │ 15/10/2025 │ -45   │ [📧]   │   │
│  │ Maria Santos  │ Exp. 90d  │ 02/01/2026 │ +5    │ [📧]   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### Funcionalidades Extras
- Envio automático de alertas por email
- Integração com calendário (agendar exames)
- Exportação para clínicas ocupacionais

---

### 2. Processos Trabalhistas

**Prioridade: ALTA (gestão de risco financeiro)**

#### Justificativa
Processos trabalhistas representam risco financeiro significativo. Visibilidade permite provisionamento e identificação de padrões.

#### Fonte de Dados
```
labor_lawsuits.*
employees.*
terminations.*
```

#### KPIs Propostos

| KPI | Campo | Descrição |
|-----|-------|-----------|
| Processos Ativos | `conclusionDate IS NULL` | Em andamento |
| Valor em Risco | `SUM(claimAmount)` | Total reclamado |
| Custos Acumulados | `SUM(costsExpenses)` | Gastos até agora |
| Taxa de Condenação | `% com decision desfavorável` | Histórico |

#### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  PROCESSOS TRABALHISTAS                                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │ Ativos    │  │ Valor em  │  │ Custos    │  │ Encerrados│    │
│  │           │  │ Risco     │  │ Acumulados│  │ (ano)     │    │
│  │    8      │  │ R$450.000 │  │ R$32.000  │  │    12     │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │ 📊 Por Status       │  │ 📈 Evolução Mensal              │  │
│  │ [Donut chart]       │  │ [Line chart: novos vs encerr.]  │  │
│  └─────────────────────┘  └─────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  📋 PROCESSOS ATIVOS                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Nº Processo    │ Reclamante  │ Valor     │ Status      │   │
│  │ 0001234-55...  │ João Silva  │ R$50.000  │ Audiência   │   │
│  │ 0005678-99...  │ Maria Santos│ R$120.000 │ Recurso     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### Funcionalidades Extras
- Alertas de audiências próximas
- Provisionamento sugerido (% do valor em risco)
- Análise de padrões (motivos recorrentes)

---

### 3. Gestão de Férias

**Prioridade: ALTA (compliance + planejamento)**

#### Justificativa
Férias vencidas (>12 meses do período aquisitivo) geram multa de pagamento em dobro. Planejamento evita sobrecarga de setores.

#### Fonte de Dados
```
vacations.*
employees.*
```

#### KPIs Propostos

| KPI | Cálculo | Alerta |
|-----|---------|--------|
| Em Férias (hoje) | `status = 'in_progress'` | Info |
| Férias Vencidas | `acquisitionPeriodEnd < hoje - 12 meses` | 🔴 Crítico |
| Vencendo (90d) | Próximas a vencer | 🟡 Atenção |
| Programadas | `status = 'scheduled'` | Info |

#### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  GESTÃO DE FÉRIAS                                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │🏖️ Em     │  │🔴 Férias  │  │🟡 Vencendo│  │📅 Progra- │    │
│  │  Férias   │  │ Vencidas  │  │  (90d)    │  │  madas    │    │
│  │    5      │  │    3      │  │    12     │  │    28     │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  📅 CALENDÁRIO DE FÉRIAS                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Jan │ Fev │ Mar │ Abr │ Mai │ Jun │ Jul │ Ago │ ...    │   │
│  │  3  │  5  │  4  │  2  │  6  │  8  │ 12  │  7  │ ...    │   │
│  │ ███ │█████│████ │ ██  │█████│█████│█████│█████│        │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ⚠️ FÉRIAS VENCIDAS (ação imediata necessária)                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Funcionário   │ Período Aquis.│ Venceu em  │ Dias      │   │
│  │ João Silva    │ 2023/2024     │ 15/03/2025 │ 288       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. Promoções e Carreira

**Prioridade: ALTA (retenção de talentos)**

#### Justificativa
Visibilidade sobre promoções demonstra meritocracia, auxilia em decisões de carreira e análise de equidade salarial.

#### Fonte de Dados
```
promotions.*
employees.*
job_positions.*
```

#### KPIs Propostos

| KPI | Cálculo |
|-----|---------|
| Promoções (período) | `COUNT(promotions)` |
| % Promovidos | `promovidos / total funcionários` |
| Aumento Médio | `AVG((newSalary - previousSalary) / previousSalary * 100)` |
| Tempo Médio p/ Promoção | `AVG(promotionDate - hireDate)` |

#### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  PROMOÇÕES E CARREIRA                                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │ Promoções │  │ % Func.   │  │ Aumento   │  │ Tempo p/  │    │
│  │ (ano)     │  │ Promovidos│  │ Médio     │  │ Promoção  │    │
│  │    24     │  │   15%     │  │  12.5%    │  │  2.3 anos │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │ 📈 Evolução Mensal  │  │ 📊 Por Setor                    │  │
│  │ [Bar chart]         │  │ [Horizontal bar]                │  │
│  └─────────────────────┘  └─────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  🔄 MOVIMENTAÇÕES DE CARGO                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ De (Cargo)      │  →  │ Para (Cargo)    │ Qtd │ Aum.%  │   │
│  │ Aux. Adm.       │  →  │ Assistente Adm. │  8  │ 15%    │   │
│  │ Analista Jr     │  →  │ Analista Pleno  │  5  │ 20%    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5. Dashboard Executivo (C-Level)

**Prioridade: ALTA (visão estratégica)**

#### Justificativa
Consolidação de KPIs estratégicos para alta gestão, com visão rápida da saúde organizacional.

#### Fonte de Dados
```
employees.*, terminations.*, absences.*, medical_certificates.*,
labor_lawsuits.*, vacations.*, promotions.*
```

#### KPIs Propostos

| Categoria | KPIs |
|-----------|------|
| Headcount | Total, Admissões, Demissões, Turnover |
| Financeiro | Folha Total, Custo Médio, Processos (R$) |
| Operacional | Absenteísmo, Afastados, Em Férias |
| Compliance | ASO Vencidos, Férias Vencidas, Acidentes |

#### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  DASHBOARD EXECUTIVO                         Dezembro 2025      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  👥 PESSOAS           💰 FINANCEIRO         ⚠️ COMPLIANCE       │
│  ┌─────────────┐     ┌─────────────┐       ┌─────────────┐     │
│  │ Headcount   │     │ Folha       │       │ ASO Vencido │     │
│  │    156      │     │ R$245.000   │       │     12      │     │
│  │ ▲ +3 vs mês │     │ ▲ +2.1%     │       │ 🔴 CRÍTICO  │     │
│  └─────────────┘     └─────────────┘       └─────────────┘     │
│  ┌─────────────┐     ┌─────────────┐       ┌─────────────┐     │
│  │ Turnover    │     │ Processos   │       │ Férias Venc.│     │
│  │   2.1%      │     │ R$450.000   │       │      3      │     │
│  │ ▼ -0.5%     │     │ 8 ativos    │       │ 🔴 CRÍTICO  │     │
│  └─────────────┘     └─────────────┘       └─────────────┘     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📈 TENDÊNCIAS (12 meses)                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [Gráfico combinado: Headcount + Turnover + Absenteísmo] │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6. Ficha Completa do Funcionário

**Prioridade: ALTA (drill-down universal)**

#### Justificativa
Visão 360° do funcionário, acessível via drill-down de qualquer relatório.

#### Fonte de Dados
```
Todas as entidades relacionadas ao funcionário
```

#### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  FICHA DO FUNCIONÁRIO                                   [X]     │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────┐                                                       │
│  │ FOTO │  João Silva                                           │
│  │      │  Analista de RH Pleno                                 │
│  └──────┘  Setor: Recursos Humanos │ Gestor: Maria Santos       │
│            Admissão: 15/03/2022 │ Tempo: 2 anos e 9 meses       │
├─────────────────────────────────────────────────────────────────┤
│  [Dados] [Carreira] [Ocorrências] [Férias] [EPIs] [Documentos]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 RESUMO                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │Promoções│ │ Faltas  │ │Atestados│ │ Advert. │ │Acidentes│   │
│  │    2    │ │    3    │ │    5    │ │    0    │ │    0    │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                 │
│  📈 HISTÓRICO DE CARREIRA                                       │
│  ──●── 15/03/2022: Admissão como Aux. Administrativo           │
│    │                                                            │
│  ──●── 01/09/2023: Promoção → Assistente RH (+15%)             │
│    │                                                            │
│  ──●── 01/06/2024: Promoção → Analista RH Jr (+18%)            │
│    │                                                            │
│  ──●── 01/03/2025: Promoção → Analista RH Pleno (+12%)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 7. Alocação em Projetos

**Prioridade: MÉDIA (específico para construção/engenharia)**

#### Justificativa
Para empresas com projetos/obras, controle de alocação de mão de obra e custos por projeto.

#### Fonte de Dados
```
projects.*
project_employees.*
employees.*
```

#### KPIs Propostos

| KPI | Descrição |
|-----|-----------|
| Projetos Ativos | Projetos em andamento |
| Funcionários Alocados | Total com projeto |
| Sem Alocação | Funcionários disponíveis |
| Custo por Projeto | Soma de salários |

#### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  ALOCAÇÃO EM PROJETOS                                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │ Projetos  │  │ Func.     │  │ Sem       │  │ Custo     │    │
│  │ Ativos    │  │ Alocados  │  │ Alocação  │  │ Total     │    │
│  │    12     │  │    89     │  │    23     │  │ R$180.000 │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  📋 PROJETOS                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Projeto       │ CNO          │ Func. │ Custo    │ Início│   │
│  │ Obra Centro   │ 123456789012 │   15  │ R$45.000 │ Jan/25│   │
│  │ Reforma Loja  │ 987654321098 │    8  │ R$22.000 │ Mar/25│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 8. Diversidade e Inclusão

**Prioridade: MÉDIA (compliance + ESG)**

#### Justificativa
Lei de Cotas (8.213/91) exige % de PCD. Relatórios ESG cada vez mais exigidos por investidores.

#### Fonte de Dados
```
employees.hasSpecialNeeds
employees.disabilityType
employees.gender
```

#### KPIs Propostos

| KPI | Cálculo |
|-----|---------|
| % PCD | `hasSpecialNeeds = true / total` |
| Cota Legal | 2-5% dependendo do porte |
| Gap de Cota | Diferença para atingir cota |
| Distribuição Gênero | Por nível hierárquico |

---

## Priorização de Implementação

| # | Relatório | Valor | Justificativa | Esforço |
|---|-----------|-------|---------------|---------|
| 1 | Compliance/Exames | **CRÍTICO** | Obrigatório por lei (NR-7) | Baixo |
| 2 | Processos Trabalhistas | **ALTO** | Gestão de risco financeiro | Médio |
| 3 | Gestão de Férias | **ALTO** | Compliance + Planejamento | Baixo |
| 4 | Promoções e Carreira | **ALTO** | Retenção de talentos | Médio |
| 5 | Dashboard Executivo | **ALTO** | Visão estratégica | Alto |
| 6 | Ficha do Funcionário | **ALTO** | Drill-down universal | Médio |
| 7 | Alocação em Projetos | **MÉDIO** | Específico construção | Médio |
| 8 | Diversidade | **MÉDIO** | Compliance + ESG | Baixo |

---

## Comparativo: Relatórios Existentes vs Sugeridos

### Cobertura de Entidades

| Entidade | Power BI | Sugeridos | Total |
|----------|----------|-----------|-------|
| employees | ✅ Parcial | ✅ Completo | ✅ |
| terminations | ✅ | - | ✅ |
| absences | ✅ | - | ✅ |
| medical_certificates | ✅ | - | ✅ |
| accidents | ✅ | - | ✅ |
| warnings | ✅ | - | ✅ |
| vacations | ⚠️ Parcial | ✅ Completo | ✅ |
| ppe_deliveries | ✅ | - | ✅ |
| **promotions** | ❌ | ✅ | ✅ |
| **labor_lawsuits** | ❌ | ✅ | ✅ |
| **cpf_analyses** | ❌ | ✅ | ✅ |
| **projects** | ❌ | ✅ | ✅ |

### Cobertura por Área

| Área | Power BI | Sugeridos |
|------|----------|-----------|
| Operacional (dia-a-dia) | ✅ Excelente | - |
| Compliance Legal | ❌ Ausente | ✅ Adicionado |
| Gestão de Risco | ❌ Ausente | ✅ Adicionado |
| Carreira/Retenção | ❌ Ausente | ✅ Adicionado |
| Visão Executiva | ❌ Ausente | ✅ Adicionado |

---

## Conclusão

Os relatórios existentes do Power BI cobrem bem as **operações do dia-a-dia** (ocorrências, folha, EPI), mas deixam lacunas significativas em:

1. **Compliance Legal**: Exames ocupacionais (NR-7), férias vencidas
2. **Gestão de Risco**: Processos trabalhistas e provisionamento
3. **Carreira e Retenção**: Promoções, plano de carreira
4. **Visão Estratégica**: Dashboard consolidado para C-Level

A implementação dos relatórios sugeridos, especialmente **Compliance**, **Processos Trabalhistas** e **Gestão de Férias**, agregaria valor significativo e diferenciaria a plataforma de soluções concorrentes que focam apenas em operacional.

### Dados 100% Disponíveis

Todos os relatórios sugeridos utilizam **dados já existentes** no schema atual. Não há necessidade de alterações de schema para implementá-los.
