# Terminated Employees Report - Plano de Implementação

> **Relatório**: Relatório de Funcionários Demitidos
> **Referência**: Relatório Power BI "DEMITIDOS"
> **Status**: Planejado
> **Pré-requisitos**: Alterações no schema (ver seção "Alterações Necessárias")

## Visão Geral

Relatório analítico focado em funcionários demitidos, permitindo análise de motivos, tempo de permanência, perfil dos desligados e indicadores de ocorrências antes da demissão.

### Objetivo

Fornecer insights sobre:
- Volume e tendência de demissões
- Motivos mais frequentes de desligamento
- Perfil dos funcionários demitidos (cargo, gestor, estado civil)
- Histórico de ocorrências dos demitidos (faltas, atestados, advertências, acidentes)
- Tempo médio de permanência na empresa

---

## Mapeamento: Power BI → API

### KPIs (Cards do Topo)

| Power BI | Campo API | Fonte de Dados | Status |
|----------|-----------|----------------|--------|
| Qtd. Func. Demitidos | `kpis.terminatedCount` | `COUNT(terminations)` no período | ✅ Disponível |
| Dias de Faltas | `kpis.absenceDays` | `SUM(absences)` dos demitidos | ✅ Disponível |
| Atestados | `kpis.medicalCertificates` | `COUNT(medical_certificates)` | ✅ Disponível |
| Dias de Atestados | `kpis.medicalCertificateDays` | `SUM(medical_certificates.daysOff)` | ✅ Disponível |
| Qtd. Acidentes | `kpis.accidents` | `COUNT(accidents)` | ✅ Disponível |

### Gráficos e Componentes

| Power BI | Campo API | Tipo | Fonte | Status |
|----------|-----------|------|-------|--------|
| Fotos funcionários | `employees[].photoUrl` | Galeria | `employees.photoUrl` | ❌ Campo não existe |
| Motivos | `reasonCategories` | Pizza/Barra | `terminations.reasonCategory` | ❌ Campo não existe |
| Função | `byPosition` | Barra Horizontal | `employees.jobPositionId` | ✅ Disponível |
| Tempo de Permanência | `tenureDistribution` | Pizza | `terminationDate - hireDate` | ✅ Calculável |
| Demitidos por mês | `byMonth` | Barra | `GROUP BY month(terminationDate)` | ✅ Disponível |
| Gestor | `byManager` | Pizza | `employees.manager` | ⚠️ Texto, não FK |
| Estado Civil | `byMaritalStatus` | Pizza | `employees.maritalStatus` | ✅ Disponível |
| Filhos < 21 anos | `hasChildrenUnder21` | Barra | `employees.hasChildrenUnder21` | ✅ Disponível |

### Tabela Analítica

| Coluna Power BI | Campo API | Fonte | Status |
|-----------------|-----------|-------|--------|
| Funcionário | `name` | `employees.name` | ✅ Disponível |
| Foto | `photoUrl` | `employees.photoUrl` | ❌ Campo não existe |
| Permanência | `tenure` | `terminationDate - hireDate` | ✅ Calculável |
| Dias de Falt. | `absenceDays` | `SUM(absences)` | ✅ Disponível |
| Atest. | `medicalCertificates` | `COUNT(medical_certificates)` | ✅ Disponível |
| Dias Ates. | `medicalCertificateDays` | `SUM(daysOff)` | ✅ Disponível |
| Adv. | `warnings` | `COUNT(warnings)` | ✅ Disponível |
| Acid. | `accidents` | `COUNT(accidents)` | ✅ Disponível |
| Função | `position` | `jobPositions.name` | ✅ Disponível |
| Tipo | `type` | `terminations.type` | ✅ Disponível (mapear labels) |
| Mot. Trabalhista | `laborReason` | `terminations.laborReason` | ❌ Campo não existe |
| Motivo | `reason` | `terminations.reason` | ⚠️ Texto livre |
| Categoria Motivo | `reasonCategory` | `terminations.reasonCategory` | ❌ Campo não existe |

---

## Status dos Dados

### Resumo de Disponibilidade

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Disponível | 13 campos | ~68% |
| ⚠️ Parcial | 2 campos | ~11% |
| ❌ Faltando | 4 campos | ~21% |

### Dados Disponíveis

- Contagem de demissões
- Dados do funcionário (nome, cargo, setor, estado civil, filhos)
- Tipo de demissão (enum existente)
- Data de demissão e admissão (tempo de permanência)
- Ocorrências relacionadas (faltas, atestados, advertências, acidentes)

### Dados Parcialmente Disponíveis

1. **Motivo da demissão** (`terminations.reason`)
   - Existe como texto livre
   - Power BI usa categorias estruturadas

2. **Gestor** (`employees.manager`)
   - Existe como texto
   - Power BI agrupa por gestor (ideal seria FK)

### Dados Faltantes

1. **Foto do funcionário** (`employees.photoUrl`)
   - Necessário para galeria visual

2. **Categoria do motivo** (`terminations.reasonCategory`)
   - Enum estruturado para análise

3. **Motivo trabalhista** (`terminations.laborReason`)
   - Campo específico (Redução de quadro, etc.)

---

## Alterações Necessárias no Schema

### 1. Adicionar foto em `employees`

**Arquivo:** `src/db/schema/employees.ts`

```typescript
// Adicionar após os campos de documentos
photoUrl: text("photo_url"),
```

**Impacto:** Baixo - campo opcional, não quebra API existente

### 2. Adicionar campos em `terminations`

**Arquivo:** `src/db/schema/terminations.ts`

```typescript
// Novos enums
export const terminationReasonCategoryEnum = pgEnum("termination_reason_category", [
  "LOW_PRODUCTIVITY",       // Baixa produtividade
  "LOW_PERFORMANCE",        // Baixa performance
  "INSUBORDINATION",        // Insubordinação
  "MISCONDUCT",             // Má conduta
  "ABSENTEEISM",            // Absenteísmo
  "POLICY_VIOLATION",       // Violação de políticas
  "CONFLICT",               // Conflitos
  "ADAPTATION_FAILURE",     // Falha de adaptação
  "OTHER",                  // Outro
]);

export const laborReasonEnum = pgEnum("labor_reason", [
  "WORKFORCE_REDUCTION",    // Redução de quadro
  "RESTRUCTURING",          // Reestruturação
  "BUDGET_CUT",             // Corte de orçamento
  "POSITION_ELIMINATION",   // Extinção do cargo
  "CONTRACT_EXPIRATION",    // Fim de contrato
  "VOLUNTARY_RESIGNATION",  // Pedido de demissão
  "RETIREMENT",             // Aposentadoria
  "TRANSFER",               // Transferência
  "OTHER",                  // Outro
]);

// Adicionar campos na tabela terminations
reasonCategory: terminationReasonCategoryEnum("reason_category"),
laborReason: laborReasonEnum("labor_reason"),
```

**Impacto:** Baixo - campos opcionais, não quebra API existente

### 3. (Opcional) Alterar gestor para FK

**Arquivo:** `src/db/schema/employees.ts`

```typescript
// Opção A: Manter texto E adicionar FK (retrocompatível)
manager: text("manager"),  // Manter para retrocompatibilidade
managerId: text("manager_id").references(() => employees.id),

// Opção B: Migrar para apenas FK (breaking change)
// Requer migração de dados
managerId: text("manager_id").references(() => employees.id),
```

**Impacto:** Médio - Opção A não quebra, Opção B requer migração

---

## Estrutura de Arquivos

```text
src/modules/reports/
├── terminated-employees/
│   ├── index.ts                          # Controller
│   ├── terminated-employees.model.ts     # Schemas Zod
│   ├── terminated-employees.service.ts   # Orquestração
│   └── queries/
│       ├── kpis.query.ts                 # KPIs principais
│       ├── by-month.query.ts             # Demissões por mês
│       ├── by-position.query.ts          # Por cargo
│       ├── by-manager.query.ts           # Por gestor
│       ├── by-reason.query.ts            # Por motivo
│       ├── tenure-distribution.query.ts  # Tempo de permanência
│       ├── demographics.query.ts         # Estado civil, filhos
│       └── employee-details.query.ts     # Tabela analítica
```

---

## Endpoint

```
GET /v1/reports/terminated-employees
```

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `startDate` | date | Não | Data inicial do período de demissão |
| `endDate` | date | Não | Data final do período de demissão |
| `sectorIds` | string[] | Não | Filtrar por setores |
| `branchIds` | string[] | Não | Filtrar por filiais |
| `types` | string[] | Não | Tipos de demissão |
| `reasonCategories` | string[] | Não | Categorias de motivo |

### Response Schema

```typescript
{
  success: true,
  data: {
    filters: {
      period: { start: Date, end: Date },
      sectors: string[],
      branches: string[],
      types: string[],
      reasonCategories: string[]
    },

    kpis: {
      terminatedCount: number,
      absenceDays: number,
      medicalCertificates: number,
      medicalCertificateDays: number,
      accidents: number
    },

    byMonth: [
      { month: "2025-07", count: 3 }
    ],

    byPosition: [
      { position: "Adm. de Obras", count: 1, percentage: 33.33 }
    ],

    byManager: [
      { manager: "Carlos Maia", count: 1, percentage: 33.33 }
    ],

    reasonCategories: [
      { category: "LOW_PRODUCTIVITY", label: "Baixa produtividade", count: 2, percentage: 66.67 }
    ],

    laborReasons: [
      { reason: "WORKFORCE_REDUCTION", label: "Redução de quadro", count: 3, percentage: 100 }
    ],

    tenureDistribution: [
      { range: "LESS_THAN_3M", label: "Menos de 3 meses", count: 2, percentage: 66.67 },
      { range: "3M_TO_6M", label: "3 a 6 meses", count: 1, percentage: 33.33 }
    ],

    byMaritalStatus: [
      { status: "WIDOWED", label: "Viúvo(a)", count: 2, percentage: 66.67 }
    ],

    childrenUnder21: {
      yes: { count: 3, percentage: 100 },
      no: { count: 0, percentage: 0 }
    },

    employees: [
      {
        id: "emp-123",
        name: "Miguel Fonseca Ramos",
        photoUrl: "https://...",
        position: "Adm. de Obras",
        manager: "Carlos Maia",
        hireDate: "2025-07-09",
        terminationDate: "2025-07-28",
        tenure: { days: 19, label: "19 dias" },
        type: "DISMISSAL_WITHOUT_CAUSE",
        typeLabel: "Sem justa causa",
        reasonCategory: "LOW_PRODUCTIVITY",
        reasonCategoryLabel: "Baixa produtividade",
        laborReason: "WORKFORCE_REDUCTION",
        laborReasonLabel: "Redução de quadro",
        reason: "Baixa produtividade no período",
        occurrences: {
          absenceDays: 4,
          medicalCertificates: 0,
          medicalCertificateDays: 0,
          warnings: 0,
          accidents: 0
        }
      }
    ]
  }
}
```

---

## Implementação das Queries

### KPIs Query

```typescript
// queries/kpis.query.ts
export abstract class KpisQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<TerminatedKpis> {
    const { startDate, endDate, sectorIds, types } = filters;

    // IDs dos funcionários demitidos no período
    const terminatedEmployeeIds = await db
      .select({ id: schema.terminations.employeeId })
      .from(schema.terminations)
      .where(
        and(
          eq(schema.terminations.organizationId, organizationId),
          gte(schema.terminations.terminationDate, startDate),
          lte(schema.terminations.terminationDate, endDate),
          isNull(schema.terminations.deletedAt),
          types.length > 0 ? sql`${schema.terminations.type} = ANY(${types})` : undefined
        )
      );

    const employeeIds = terminatedEmployeeIds.map(e => e.id);

    if (employeeIds.length === 0) {
      return {
        terminatedCount: 0,
        absenceDays: 0,
        medicalCertificates: 0,
        medicalCertificateDays: 0,
        accidents: 0
      };
    }

    // Queries em paralelo para ocorrências
    const [absences, certificates, accidents] = await Promise.all([
      // Dias de faltas
      db.select({ total: sum(/* calcular dias */) })
        .from(schema.absences)
        .where(sql`${schema.absences.employeeId} = ANY(${employeeIds})`),

      // Atestados
      db.select({
        count: count(),
        totalDays: sum(schema.medicalCertificates.daysOff)
      })
        .from(schema.medicalCertificates)
        .where(sql`${schema.medicalCertificates.employeeId} = ANY(${employeeIds})`),

      // Acidentes
      db.select({ count: count() })
        .from(schema.accidents)
        .where(sql`${schema.accidents.employeeId} = ANY(${employeeIds})`),
    ]);

    return {
      terminatedCount: employeeIds.length,
      absenceDays: Number(absences[0]?.total ?? 0),
      medicalCertificates: certificates[0]?.count ?? 0,
      medicalCertificateDays: Number(certificates[0]?.totalDays ?? 0),
      accidents: accidents[0]?.count ?? 0
    };
  }
}
```

### Tenure Distribution Query

```typescript
// queries/tenure-distribution.query.ts
const TENURE_RANGES = [
  { key: "LESS_THAN_1M", label: "Menos de 1 mês", maxDays: 30 },
  { key: "1M_TO_3M", label: "1 a 3 meses", maxDays: 90 },
  { key: "3M_TO_6M", label: "3 a 6 meses", maxDays: 180 },
  { key: "6M_TO_1Y", label: "6 meses a 1 ano", maxDays: 365 },
  { key: "1Y_TO_2Y", label: "1 a 2 anos", maxDays: 730 },
  { key: "2Y_TO_5Y", label: "2 a 5 anos", maxDays: 1825 },
  { key: "MORE_THAN_5Y", label: "Mais de 5 anos", maxDays: Infinity },
];

export abstract class TenureDistributionQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<TenureDistributionItem[]> {
    const { startDate, endDate } = filters;

    const terminations = await db
      .select({
        terminationDate: schema.terminations.terminationDate,
        hireDate: schema.employees.hireDate,
      })
      .from(schema.terminations)
      .innerJoin(
        schema.employees,
        eq(schema.terminations.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.terminations.organizationId, organizationId),
          gte(schema.terminations.terminationDate, startDate),
          lte(schema.terminations.terminationDate, endDate),
          isNull(schema.terminations.deletedAt)
        )
      );

    // Calcular distribuição
    const distribution = new Map<string, number>();

    for (const t of terminations) {
      const days = Math.ceil(
        (new Date(t.terminationDate).getTime() - new Date(t.hireDate).getTime())
        / (1000 * 60 * 60 * 24)
      );

      const range = TENURE_RANGES.find(r => days <= r.maxDays);
      if (range) {
        distribution.set(range.key, (distribution.get(range.key) ?? 0) + 1);
      }
    }

    const total = terminations.length;

    return TENURE_RANGES
      .filter(r => distribution.has(r.key))
      .map(r => ({
        range: r.key,
        label: r.label,
        count: distribution.get(r.key) ?? 0,
        percentage: total > 0
          ? Math.round((distribution.get(r.key) ?? 0) / total * 10000) / 100
          : 0
      }));
  }
}
```

### Employee Details Query (Tabela Analítica)

```typescript
// queries/employee-details.query.ts
export abstract class EmployeeDetailsQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<TerminatedEmployeeDetail[]> {
    const { startDate, endDate, sectorIds, types } = filters;

    // Buscar demissões com dados do funcionário
    const terminations = await db
      .select({
        termination: schema.terminations,
        employee: schema.employees,
        position: schema.jobPositions,
      })
      .from(schema.terminations)
      .innerJoin(
        schema.employees,
        eq(schema.terminations.employeeId, schema.employees.id)
      )
      .innerJoin(
        schema.jobPositions,
        eq(schema.employees.jobPositionId, schema.jobPositions.id)
      )
      .where(
        and(
          eq(schema.terminations.organizationId, organizationId),
          gte(schema.terminations.terminationDate, startDate),
          lte(schema.terminations.terminationDate, endDate),
          isNull(schema.terminations.deletedAt),
          sectorIds.length > 0
            ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
            : undefined,
          types.length > 0
            ? sql`${schema.terminations.type} = ANY(${types})`
            : undefined
        )
      )
      .orderBy(schema.terminations.terminationDate);

    // Para cada funcionário, buscar ocorrências
    const employeeIds = terminations.map(t => t.employee.id);

    const [absences, certificates, warnings, accidents] = await Promise.all([
      EmployeeDetailsQuery.getAbsencesByEmployee(employeeIds),
      EmployeeDetailsQuery.getCertificatesByEmployee(employeeIds),
      EmployeeDetailsQuery.getWarningsByEmployee(employeeIds),
      EmployeeDetailsQuery.getAccidentsByEmployee(employeeIds),
    ]);

    return terminations.map(t => {
      const tenureDays = Math.ceil(
        (new Date(t.termination.terminationDate).getTime() -
         new Date(t.employee.hireDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: t.employee.id,
        name: t.employee.name,
        photoUrl: t.employee.photoUrl ?? null,
        position: t.position.name,
        manager: t.employee.manager ?? null,
        hireDate: t.employee.hireDate,
        terminationDate: t.termination.terminationDate,
        tenure: {
          days: tenureDays,
          label: EmployeeDetailsQuery.formatTenure(tenureDays),
        },
        type: t.termination.type,
        typeLabel: TYPE_LABELS[t.termination.type],
        reasonCategory: t.termination.reasonCategory ?? null,
        reasonCategoryLabel: t.termination.reasonCategory
          ? REASON_CATEGORY_LABELS[t.termination.reasonCategory]
          : null,
        laborReason: t.termination.laborReason ?? null,
        laborReasonLabel: t.termination.laborReason
          ? LABOR_REASON_LABELS[t.termination.laborReason]
          : null,
        reason: t.termination.reason ?? null,
        occurrences: {
          absenceDays: absences.get(t.employee.id) ?? 0,
          medicalCertificates: certificates.get(t.employee.id)?.count ?? 0,
          medicalCertificateDays: certificates.get(t.employee.id)?.days ?? 0,
          warnings: warnings.get(t.employee.id) ?? 0,
          accidents: accidents.get(t.employee.id) ?? 0,
        },
      };
    });
  }

  private static formatTenure(days: number): string {
    if (days < 30) return `${days} dias`;
    if (days < 365) return `${Math.floor(days / 30)} meses`;
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return months > 0 ? `${years} anos e ${months} meses` : `${years} anos`;
  }

  // ... métodos auxiliares para buscar ocorrências
}
```

---

## Labels e Mapeamentos

### Tipos de Demissão (Existentes)

```typescript
const TYPE_LABELS: Record<string, string> = {
  RESIGNATION: "Pedido de demissão",
  DISMISSAL_WITH_CAUSE: "Justa causa",
  DISMISSAL_WITHOUT_CAUSE: "Sem justa causa",
  MUTUAL_AGREEMENT: "Acordo mútuo",
  CONTRACT_END: "Fim de contrato",
};
```

### Categorias de Motivo (Novo Enum)

```typescript
const REASON_CATEGORY_LABELS: Record<string, string> = {
  LOW_PRODUCTIVITY: "Baixa produtividade",
  LOW_PERFORMANCE: "Baixa performance",
  INSUBORDINATION: "Insubordinação",
  MISCONDUCT: "Má conduta",
  ABSENTEEISM: "Absenteísmo",
  POLICY_VIOLATION: "Violação de políticas",
  CONFLICT: "Conflitos",
  ADAPTATION_FAILURE: "Falha de adaptação",
  OTHER: "Outro",
};
```

### Motivos Trabalhistas (Novo Enum)

```typescript
const LABOR_REASON_LABELS: Record<string, string> = {
  WORKFORCE_REDUCTION: "Redução de quadro",
  RESTRUCTURING: "Reestruturação",
  BUDGET_CUT: "Corte de orçamento",
  POSITION_ELIMINATION: "Extinção do cargo",
  CONTRACT_EXPIRATION: "Fim de contrato",
  VOLUNTARY_RESIGNATION: "Pedido de demissão",
  RETIREMENT: "Aposentadoria",
  TRANSFER: "Transferência",
  OTHER: "Outro",
};
```

---

## Testes

### Cobertura Obrigatória

- [ ] Rejeitar requisição sem autenticação (401)
- [ ] Rejeitar organização sem feature habilitada (403)
- [ ] Retornar relatório vazio para organização sem demissões
- [ ] Retornar KPIs corretos com demissões
- [ ] Calcular tempo de permanência corretamente
- [ ] Agregar ocorrências por funcionário demitido
- [ ] Respeitar filtros de período
- [ ] Respeitar filtros de tipo de demissão
- [ ] Respeitar filtros de setor

---

## Checklist de Implementação

### Pré-requisitos (Schema)
- [ ] Adicionar `photoUrl` em `employees`
- [ ] Criar enum `terminationReasonCategoryEnum`
- [ ] Criar enum `laborReasonEnum`
- [ ] Adicionar `reasonCategory` em `terminations`
- [ ] Adicionar `laborReason` em `terminations`
- [ ] Gerar e aplicar migration

### Estrutura
- [ ] Criar diretório `src/modules/reports/terminated-employees/queries/`
- [ ] Criar `terminated-employees.model.ts`

### Queries
- [ ] Implementar `kpis.query.ts`
- [ ] Implementar `by-month.query.ts`
- [ ] Implementar `by-position.query.ts`
- [ ] Implementar `by-manager.query.ts`
- [ ] Implementar `by-reason.query.ts`
- [ ] Implementar `tenure-distribution.query.ts`
- [ ] Implementar `demographics.query.ts`
- [ ] Implementar `employee-details.query.ts`

### Service e Controller
- [ ] Implementar `terminated-employees.service.ts`
- [ ] Implementar `terminated-employees/index.ts` (controller)
- [ ] Registrar no controller agregador de reports

### Testes
- [ ] Criar testes E2E
- [ ] Criar testes de integração do service

### Verificação
- [ ] `bun run check` sem erros
- [ ] Todos os testes passando
- [ ] Endpoint na documentação OpenAPI

---

## Uso no Frontend

```tsx
// Exemplo com shadcn/ui
export function TerminatedEmployeesReport() {
  const { data } = useQuery({
    queryKey: ["terminated-employees", filters],
    queryFn: () => api.get("/v1/reports/terminated-employees", { params: filters }),
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard title="Demitidos" value={data.kpis.terminatedCount} />
        <KpiCard title="Dias de Faltas" value={data.kpis.absenceDays} />
        <KpiCard title="Atestados" value={data.kpis.medicalCertificates} />
        <KpiCard title="Dias de Atestados" value={data.kpis.medicalCertificateDays} />
        <KpiCard title="Acidentes" value={data.kpis.accidents} />
      </div>

      {/* Galeria de Fotos */}
      <Card>
        <CardHeader>Funcionários Demitidos</CardHeader>
        <div className="grid grid-cols-4 gap-2">
          {data.employees.map(emp => (
            <Avatar key={emp.id} src={emp.photoUrl} alt={emp.name} />
          ))}
        </div>
      </Card>

      {/* Gráficos */}
      <div className="grid grid-cols-3 gap-4">
        <PieChart title="Motivos" data={data.reasonCategories} />
        <BarChart title="Por Função" data={data.byPosition} />
        <PieChart title="Tempo de Permanência" data={data.tenureDistribution} />
      </div>

      {/* Tabela Analítica */}
      <DataTable
        columns={analyticalColumns}
        data={data.employees}
      />
    </div>
  );
}
```

---

## Considerações de Performance

1. **Queries em paralelo** para buscar ocorrências de cada funcionário
2. **Índices recomendados**:
   ```sql
   CREATE INDEX idx_terminations_org_date_deleted
     ON terminations(organization_id, termination_date)
     WHERE deleted_at IS NULL;

   CREATE INDEX idx_terminations_type
     ON terminations(type);

   CREATE INDEX idx_terminations_reason_category
     ON terminations(reason_category);
   ```
3. **Limitar período** máximo de consulta (ex: 2 anos)
4. **Paginação** na tabela analítica para grandes volumes
