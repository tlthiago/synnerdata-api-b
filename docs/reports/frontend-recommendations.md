# Recomendações de Frontend para Relatórios

## Visão Geral

Este documento apresenta recomendações de layout, design e estrutura para a implementação dos relatórios na plataforma web, baseado na análise dos 10 relatórios existentes no Power BI.

---

## Padrões Identificados nos Relatórios Atuais

A maioria dos relatórios do Power BI segue uma estrutura comum:

```
┌─────────────────────────────────────────────────────────────────┐
│  TÍTULO DO RELATÓRIO                    [Dropdown Funcionários] │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │  KPI 1  │  │  KPI 2  │  │  KPI 3  │  │  KPI 4  │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐                                            │
│  │  Galeria Fotos  │                                            │
│  └─────────────────┘                                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────┐ │
│  │  Gráfico Pizza    │  │  Gráfico Barras   │  │  Ranking    │ │
│  └───────────────────┘  └───────────────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Tabela Detalhada                                           ││
│  │  COD | Funcionário | Data | Motivo | ...                    ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  [Período: ___/___] [Setor ▼] [Status ▼]              [FILTRAR] │
└─────────────────────────────────────────────────────────────────┘
```

### Relatórios que seguem este padrão:
- Demitidos
- Faltas
- Atestados
- Acidentes
- Advertências
- Gestão EPI

---

## Proposta de Consolidação

### Estrutura de Navegação Recomendada

```
📊 Dashboard (Home)
   └─ Visão geral em tempo real + Alertas + KPIs principais

👥 Pessoas
   ├─ Gestão de Pessoas (Gestão DP)
   └─ Demitidos

📋 Ocorrências
   └─ Faltas | Atestados | Acidentes | Advertências (abas)

💰 Financeiro
   └─ Folha de Pagamento

🦺 Segurança
   └─ Gestão de EPI
```

---

## 1. Dashboard Principal (Home)

### Objetivo
Consolidar informações de **Status**, **Aniversariantes** e KPIs principais em uma única página inicial que oferece visão geral da organização.

### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  BOM DIA, [NOME]!                              [Org: ACME Inc]  │
│  Última atualização: 28/12/2025 às 14:30                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    STATUS EM TEMPO REAL                  │   │
│  ├─────────────┬─────────────┬─────────────┬───────────────┤   │
│  │ 👥 TOTAL    │ ✅ TRABALH. │ 🏖️ FÉRIAS   │ 🏥 AFASTADOS  │   │
│  │    156      │    148      │     5       │      3        │   │
│  └─────────────┴─────────────┴─────────────┴───────────────┘   │
│                                                                 │
├──────────────────────────────┬──────────────────────────────────┤
│                              │                                  │
│  📅 ANIVERSARIANTES          │  🔔 ALERTAS                      │
│  ┌────────────────────────┐  │  ┌────────────────────────────┐  │
│  │ Hoje (2)               │  │  │ ⚠️ 3 EPIs vencendo em 7d   │  │
│  │ • João Silva      15/12│  │  │ ⚠️ 5 exames ASO pendentes  │  │
│  │ • Maria Santos    15/12│  │  │ ⚠️ 2 experiências vencendo │  │
│  │                        │  │  │ ℹ️ 8 aniversários este mês │  │
│  │ Esta semana (4)        │  │  └────────────────────────────┘  │
│  │ • Pedro Lima      17/12│  │                                  │
│  │ • Ana Costa       18/12│  │  📈 RESUMO DO MÊS               │
│  │ • ...                  │  │  ┌────────────────────────────┐  │
│  └────────────────────────┘  │  │ Admissões:      +12        │  │
│                              │  │ Demissões:       -3        │  │
│                              │  │ Turnover:       2.1%       │  │
│                              │  │ Absenteísmo:    3.5%       │  │
│                              │  └────────────────────────────┘  │
│                              │                                  │
├──────────────────────────────┴──────────────────────────────────┤
│                                                                 │
│  🔗 ACESSO RÁPIDO                                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Gestão  │ │Ocorrênc.│ │  Folha  │ │   EPI   │ │Demitidos│   │
│  │   DP    │ │         │ │         │ │         │ │         │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Componentes

| Componente | Fonte de Dados | Atualização |
|------------|----------------|-------------|
| Status em Tempo Real | employees + vacations + medical_certificates | Tempo real |
| Aniversariantes | employees.birthDate | Diária |
| Alertas | Múltiplas fontes | Tempo real |
| Resumo do Mês | employees + terminations | Diária |

---

## 2. Dashboard de Ocorrências (Consolidado)

### Objetivo
Unificar **Faltas**, **Atestados**, **Acidentes** e **Advertências** em uma única interface com abas, aproveitando a estrutura idêntica desses relatórios.

### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  OCORRÊNCIAS                                   [Exportar ▼]     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐      │
│  │   FALTAS    │  ATESTADOS  │  ACIDENTES  │ADVERTÊNCIAS │      │
│  │    (12)     │    (8)      │    (2)      │    (5)      │      │
│  └─────────────┴─────────────┴─────────────┴─────────────┘      │
│        ▲ aba ativa                                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Total   │  │ Func.   │  │  Dias   │  │ Este    │            │
│  │   12    │  │   8     │  │   45    │  │  Mês: 3 │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ 📊 Por Gestor   │  │ 📊 Por Motivo   │  │ 🏆 Ranking      │  │
│  │                 │  │                 │  │                 │  │
│  │  [Gráfico]      │  │  [Gráfico]      │  │  1. João    5   │  │
│  │                 │  │                 │  │  2. Maria   3   │  │
│  │                 │  │                 │  │  3. Pedro   2   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 📋 Detalhes                                    [🔍 Buscar]  ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ COD    │ Funcionário    │ Data     │ Motivo    │ Ações     ││
│  │ EMP001 │ João Silva     │ 15/12/25 │ Médico    │ [👁️] [📄] ││
│  │ EMP002 │ Maria Santos   │ 14/12/25 │ Pessoal   │ [👁️] [📄] ││
│  │ ...    │ ...            │ ...      │ ...       │ ...       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Período: [01/12/2025] até [31/12/2025]  Setor: [Todos ▼]      │
│  Gestor: [Todos ▼]  Status: [● Ativo ○ Demitido ○ Todos]       │
└─────────────────────────────────────────────────────────────────┘
```

### Vantagens da Consolidação

1. **Código reutilizável**: Um componente base para todos os tipos de ocorrência
2. **UX consistente**: Usuário aprende uma vez, usa em todas
3. **Comparação facilitada**: Números nas abas permitem comparação rápida
4. **Filtros compartilhados**: Mesmo período/setor para todas as ocorrências
5. **Manutenção simplificada**: Alterações refletem em todos os tipos

### Estrutura de Componentes React/Vue

```
OccurrencesPage/
├── OccurrencesTabs.tsx          # Abas: Faltas|Atestados|...
├── OccurrenceKPIs.tsx           # KPIs (reutilizável)
├── OccurrenceCharts.tsx         # Gráficos (reutilizável)
├── OccurrenceRanking.tsx        # Ranking (reutilizável)
├── OccurrenceTable.tsx          # Tabela detalhada (reutilizável)
├── OccurrenceFilters.tsx        # Filtros (compartilhados)
└── hooks/
    ├── useAbsences.ts
    ├── useMedicalCertificates.ts
    ├── useAccidents.ts
    └── useWarnings.ts
```

---

## 3. Relatórios Independentes

Os seguintes relatórios devem permanecer como páginas independentes por terem contextos e estruturas distintas:

### 3.1 Gestão de Pessoas (Gestão DP)

```
┌─────────────────────────────────────────────────────────────────┐
│  GESTÃO DE PESSOAS                             [Exportar ▼]     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Total   │  │ Admiss. │  │ Demiss. │  │Turnover │            │
│  │  156    │  │  +12    │  │   -3    │  │  2.1%   │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Por Setor     │  │ Por Gênero    │  │ Por Educação  │       │
│  │ [Gráfico]     │  │ [Gráfico]     │  │ [Gráfico]     │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Por Faixa     │  │ Por Tempo     │  │ Evolução      │       │
│  │ Etária        │  │ de Casa       │  │ Headcount     │       │
│  │ [Gráfico]     │  │ [Gráfico]     │  │ [Gráfico]     │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Demitidos

Mantém estrutura similar ao Power BI, com adição de drill-down para detalhes.

### 3.3 Folha de Pagamento

```
┌─────────────────────────────────────────────────────────────────┐
│  FOLHA DE PAGAMENTO                            [Exportar ▼]     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Total   │  │Salários │  │  V.A.   │  │  V.T.   │            │
│  │R$67.096 │  │R$54.550 │  │R$8.450  │  │R$4.096  │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📈 Evolução Mensal                                       │   │
│  │ [Gráfico de linha/área com evolução ao longo do ano]     │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────┐  ┌───────────────────────────────┐  │
│  │ 🥧 % Por Categoria    │  │ 📊 Por Setor                  │  │
│  │ [Donut chart]         │  │ [Tabela com valores]          │  │
│  └───────────────────────┘  └───────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🏆 Ranking Funcionários (Stacked Bar)                    │   │
│  │ [Gráfico de barras empilhadas]                           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Gestão de EPI

Mantém estrutura similar ao Power BI, focado em entregas e conformidade.

---

## 4. Funcionalidades Adicionais (Web vs Power BI)

### 4.1 Drill-Down

Permitir clicar em qualquer elemento para ver detalhes:

```
Gráfico "Por Setor"
    └─ Clique em "Engenharia"
        └─ Modal/Página com funcionários do setor
            └─ Clique em "João Silva"
                └─ Ficha completa do funcionário
```

### 4.2 Exportação Múltipla

```
┌─────────────────────┐
│ Exportar ▼          │
├─────────────────────┤
│ 📄 PDF              │
│ 📊 Excel (.xlsx)    │
│ 📋 CSV              │
│ 🖨️ Imprimir        │
│ 📧 Enviar por Email │
│ ⏰ Agendar Envio    │
└─────────────────────┘
```

### 4.3 Filtros em Tempo Real

- Filtros aplicam instantaneamente (sem recarregar página)
- Salvamento de filtros favoritos
- URL reflete filtros aplicados (compartilhável)

### 4.4 Responsividade

```
Desktop (1920px)          Tablet (768px)           Mobile (375px)
┌─────┬─────┬─────┐      ┌─────┬─────┐           ┌─────┐
│ KPI │ KPI │ KPI │      │ KPI │ KPI │           │ KPI │
├─────┴─────┴─────┤      ├─────┴─────┤           ├─────┤
│ Gráf │ Gráf│Rank│      │  Gráfico  │           │Gráf │
├─────┴─────┴─────┤      ├───────────┤           ├─────┤
│     Tabela      │      │   Rank    │           │Rank │
└─────────────────┘      ├───────────┤           ├─────┤
                         │  Tabela   │           │Tab  │
                         └───────────┘           └─────┘
```

### 4.5 Comparativo: Power BI vs Plataforma Web

| Funcionalidade | Power BI | Plataforma Web |
|----------------|----------|----------------|
| Filtros | Recarrega página | Tempo real |
| Layout | Fixo | Responsivo |
| Exportação | PDF básico | PDF, Excel, CSV |
| Drill-down | Limitado | Completo até CRUD |
| Atualização | Agendada | Tempo real |
| Compartilhamento | Link do dashboard | URL com filtros |
| Personalização | Limitada | Por organização |
| Mobile | App separado | PWA responsivo |
| Notificações | Não | Push/Email |
| Agendamento | Power Automate | Nativo |

---

## 5. Componentes Reutilizáveis

### Biblioteca de Componentes Sugerida

```
components/
├── reports/
│   ├── ReportLayout.tsx         # Layout base para todos os relatórios
│   ├── ReportHeader.tsx         # Título + botões de exportação
│   ├── ReportFilters.tsx        # Filtros padrão (período, setor, etc.)
│   │
│   ├── KPICard.tsx              # Card de KPI individual
│   ├── KPIGrid.tsx              # Grid de KPIs
│   │
│   ├── charts/
│   │   ├── DonutChart.tsx       # Gráfico de rosca
│   │   ├── BarChart.tsx         # Gráfico de barras
│   │   ├── StackedBarChart.tsx  # Barras empilhadas
│   │   ├── LineChart.tsx        # Gráfico de linha
│   │   └── ChartLegend.tsx      # Legenda compartilhada
│   │
│   ├── tables/
│   │   ├── DataTable.tsx        # Tabela com ordenação/paginação
│   │   ├── RankingTable.tsx     # Tabela de ranking
│   │   └── TableExport.tsx      # Botões de exportação
│   │
│   ├── PhotoGallery.tsx         # Galeria de fotos de funcionários
│   ├── EmployeeCard.tsx         # Card de funcionário (para drill-down)
│   │
│   └── export/
│       ├── ExportPDF.tsx
│       ├── ExportExcel.tsx
│       └── ScheduleReport.tsx
│
└── ui/                          # shadcn/ui components
    ├── button.tsx
    ├── card.tsx
    ├── tabs.tsx
    └── ...
```

---

## 6. Tecnologias Recomendadas

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **Gráficos**: Recharts ou Tremor
- **Tabelas**: TanStack Table
- **Estado**: Zustand ou React Query
- **Exportação**: jsPDF + xlsx

### Integrações
- **Autenticação**: Better Auth (já implementado)
- **API**: Elysia (já implementado)
- **Validação**: Zod (já implementado)

---

## 7. Priorização de Implementação

### Fase 1 - MVP
1. Dashboard Principal (Status + Alertas)
2. Dashboard de Ocorrências (4 em 1)
3. Gestão de Pessoas

### Fase 2 - Expansão
4. Folha de Pagamento
5. Demitidos
6. Gestão de EPI

### Fase 3 - Refinamento
7. Exportação avançada (PDF, Excel)
8. Agendamento de relatórios
9. Drill-down completo
10. Notificações e alertas

---

## Conclusão

A consolidação dos relatórios de ocorrências e a criação de um dashboard principal reduzem a complexidade de navegação e melhoram a experiência do usuário. A estrutura proposta permite:

- **Menos páginas**: De 10 para 6 páginas principais
- **Código reutilizável**: Componentes compartilhados entre relatórios
- **UX consistente**: Padrões de interação uniformes
- **Manutenção simplificada**: Alterações em um lugar refletem em múltiplos relatórios
- **Funcionalidades superiores ao Power BI**: Tempo real, responsivo, drill-down, exportação avançada
