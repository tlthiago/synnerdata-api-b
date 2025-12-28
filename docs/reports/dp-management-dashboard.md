# DP Management Dashboard - Plano de Implementação

> **Relatório**: Dashboard de Gestão de Departamento Pessoal
> **Referência**: Relatório Power BI do cliente
> **Status**: Planejado

## Visão Geral

Este documento detalha a implementação do Dashboard de Gestão DP, replicando as funcionalidades do relatório Power BI atual do cliente.

### Objetivo

Fornecer um dashboard completo com KPIs, gráficos e tabelas que permitam análise de:
- Quadro de funcionários (admissões, demissões, ativos)
- Ocorrências (advertências, acidentes, faltas)
- Despesas com pessoal
- Perfil demográfico da força de trabalho

---

## Mapeamento: Power BI → API

### KPIs (Cards do Topo)

| Power BI | Campo API | Fonte de Dados |
|----------|-----------|----------------|
| Func. Contratados | `kpis.activeEmployees` | `employees` WHERE status = 'ACTIVE' |
| Qtd. Func. Demitidos | `kpis.terminatedEmployees` | `terminations` no período |
| % Índice Trabalhista | `kpis.turnoverRate` | (demitidos / total) * 100 |
| Advertências | `kpis.warnings` | `warnings` no período |
| Dias sem Acidentes | `kpis.daysSinceLastAccident` | Dias desde último `accidents.date` |

### Gráficos

| Power BI | Campo API | Tipo de Gráfico | Fonte |
|----------|-----------|-----------------|-------|
| Histórico | `employeeHistory` | Linha/Barra | `employees.hireDate` + `terminations.terminationDate` |
| Faltas por Setor | `absencesBySector` | Barra Empilhada | `absences` JOIN `employees.sectorId` |
| Despesas com Pessoal | `monthlyExpenses` | Tabela | `employees` (salary + benefits) |
| % Categoria | `expenseBreakdown` | Pizza | salary, transportAllowance, mealAllowance |
| Composição por Gênero | `genderDistribution` | Pizza | `employees.gender` |
| Acidentes | `accidents` | Barra | `accidents` GROUP BY month |
| Regime de Contratação | `contractTypes` | Pizza | `employees.contractType` |
| Estado Civil | `maritalStatus` | Barra Horizontal | `employees.maritalStatus` |
| Grau de Escolaridade | `educationLevels` | Barra Horizontal | `employees.educationLevel` |
| Média de Idade por Função | `ageByPosition` | Tabela | `employees.birthDate` + `jobPositions.name` |

---

## Estrutura de Arquivos

```text
src/modules/reports/
├── index.ts                              # Controller agregador
├── errors.ts                             # Erros do domínio
│
├── dp-dashboard/
│   ├── index.ts                          # Controller do dashboard
│   ├── dp-dashboard.model.ts             # Schemas Zod
│   ├── dp-dashboard.service.ts           # Orquestração
│   └── queries/
│       ├── kpis.query.ts                 # KPIs principais
│       ├── employee-history.query.ts     # Série temporal admissões/demissões
│       ├── absences-by-sector.query.ts   # Faltas agrupadas por setor
│       ├── expenses.query.ts             # Despesas mensais e breakdown
│       ├── demographics.query.ts         # Gênero, estado civil, escolaridade
│       ├── accidents.query.ts            # Acidentes por mês
│       └── age-by-position.query.ts      # Idade média por função
│
└── shared/
    ├── filters.model.ts                  # Schema de filtros comum
    └── date-utils.ts                     # Utilitários de data
```

---

## Implementação Detalhada

### Fase 1: Estrutura Base

#### 1.1 Criar Diretórios

```bash
mkdir -p src/modules/reports/dp-dashboard/queries
mkdir -p src/modules/reports/shared
```

#### 1.2 Erros do Domínio

**Arquivo:** `src/modules/reports/errors.ts`

```typescript
import { AppError } from "@/lib/errors/base-error";

export class ReportError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "REPORT_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class InvalidDateRangeError extends ReportError {
  constructor() {
    super(
      "Data inicial deve ser anterior à data final",
      "INVALID_DATE_RANGE"
    );
  }
}

export class PeriodTooLongError extends ReportError {
  constructor(maxDays: number) {
    super(
      `Período máximo permitido: ${maxDays} dias`,
      "PERIOD_TOO_LONG",
      { maxDays }
    );
  }
}

export class InvalidExportFormatError extends ReportError {
  constructor(format: string) {
    super(
      `Formato de exportação inválido: ${format}`,
      "INVALID_EXPORT_FORMAT",
      { format, validFormats: ["excel", "csv", "pdf"] }
    );
  }
}
```

#### 1.3 Filtros Compartilhados

**Arquivo:** `src/modules/reports/shared/filters.model.ts`

```typescript
import { z } from "zod";

export const reportFiltersSchema = z.object({
  startDate: z.coerce.date().optional().describe("Data inicial do período"),
  endDate: z.coerce.date().optional().describe("Data final do período"),
  sectorIds: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional()
    .describe("IDs dos setores para filtrar"),
  branchIds: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional()
    .describe("IDs das filiais para filtrar"),
  status: z
    .enum(["ACTIVE", "TERMINATED", "ALL"])
    .default("ALL")
    .describe("Status dos funcionários"),
});

export type ReportFilters = z.input<typeof reportFiltersSchema>;
export type NormalizedFilters = {
  startDate: Date;
  endDate: Date;
  sectorIds: string[];
  branchIds: string[];
  status: "ACTIVE" | "TERMINATED" | "ALL";
};
```

#### 1.4 Utilitários de Data

**Arquivo:** `src/modules/reports/shared/date-utils.ts`

```typescript
export function generateMonthRange(start: Date, end: Date): string[] {
  const months: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    months.push(current.toISOString().slice(0, 7)); // YYYY-MM
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

export function getDefaultDateRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  return {
    startDate: startOfYear,
    endDate: now,
  };
}

export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}
```

---

### Fase 2: Model do Dashboard

**Arquivo:** `src/modules/reports/dp-dashboard/dp-dashboard.model.ts`

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// ===== Schemas de Componentes =====

const kpisSchema = z.object({
  activeEmployees: z.number().describe("Total de funcionários ativos"),
  terminatedEmployees: z.number().describe("Demitidos no período"),
  turnoverRate: z.number().describe("Índice de turnover (%)"),
  warnings: z.number().describe("Advertências no período"),
  daysSinceLastAccident: z.number().describe("Dias desde último acidente"),
});

const employeeHistoryItemSchema = z.object({
  month: z.string().describe("Mês (YYYY-MM)"),
  admitted: z.number().describe("Admitidos"),
  terminated: z.number().describe("Demitidos"),
  active: z.number().describe("Ativos ao final do mês"),
});

const absencesBySectorItemSchema = z.object({
  month: z.string().describe("Mês (YYYY-MM)"),
  data: z.record(z.string(), z.number()).describe("Faltas por setor"),
});

const monthlyExpenseItemSchema = z.object({
  month: z.string().describe("Mês (YYYY-MM)"),
  total: z.number().describe("Total de despesas (R$)"),
});

const distributionItemSchema = z.object({
  label: z.string().describe("Rótulo"),
  count: z.number().describe("Quantidade"),
  percentage: z.number().describe("Percentual"),
});

const expenseBreakdownSchema = z.object({
  salary: distributionItemSchema.describe("Salários"),
  transport: distributionItemSchema.describe("Vale transporte"),
  meal: distributionItemSchema.describe("Vale alimentação"),
});

const ageByPositionItemSchema = z.object({
  position: z.string().describe("Nome do cargo"),
  averageAge: z.number().describe("Idade média"),
});

const accidentItemSchema = z.object({
  month: z.string().describe("Mês (YYYY-MM)"),
  count: z.number().describe("Quantidade de acidentes"),
});

// ===== Schema de Filtros Aplicados =====

const appliedFiltersSchema = z.object({
  period: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }),
  sectors: z.array(z.string()),
  branches: z.array(z.string()),
  status: z.string(),
});

// ===== Schema Principal do Dashboard =====

const dpDashboardDataSchema = z.object({
  filters: appliedFiltersSchema.describe("Filtros aplicados"),

  kpis: kpisSchema.describe("KPIs principais"),

  employeeHistory: z
    .array(employeeHistoryItemSchema)
    .describe("Histórico de admissões/demissões"),

  absencesBySector: z
    .array(absencesBySectorItemSchema)
    .describe("Faltas por setor ao longo do tempo"),

  monthlyExpenses: z
    .array(monthlyExpenseItemSchema)
    .describe("Despesas mensais"),

  expenseBreakdown: expenseBreakdownSchema.describe("Breakdown de despesas"),

  genderDistribution: z
    .array(distributionItemSchema)
    .describe("Distribuição por gênero"),

  contractTypes: z
    .array(distributionItemSchema)
    .describe("Distribuição por tipo de contrato"),

  maritalStatus: z
    .array(distributionItemSchema)
    .describe("Distribuição por estado civil"),

  educationLevels: z
    .array(distributionItemSchema)
    .describe("Distribuição por escolaridade"),

  ageByPosition: z
    .array(ageByPositionItemSchema)
    .describe("Idade média por cargo"),

  accidents: z
    .array(accidentItemSchema)
    .describe("Acidentes por mês"),
});

// ===== Response Schema =====

export const dpDashboardResponseSchema = successResponseSchema(dpDashboardDataSchema);

// ===== Types =====

export type DpDashboardData = z.infer<typeof dpDashboardDataSchema>;
export type Kpis = z.infer<typeof kpisSchema>;
export type EmployeeHistoryItem = z.infer<typeof employeeHistoryItemSchema>;
export type AbsencesBySectorItem = z.infer<typeof absencesBySectorItemSchema>;
export type MonthlyExpenseItem = z.infer<typeof monthlyExpenseItemSchema>;
export type DistributionItem = z.infer<typeof distributionItemSchema>;
export type ExpenseBreakdown = z.infer<typeof expenseBreakdownSchema>;
export type AgeByPositionItem = z.infer<typeof ageByPositionItemSchema>;
export type AccidentItem = z.infer<typeof accidentItemSchema>;
```

---

### Fase 3: Queries de Agregação

#### 3.1 KPIs

**Arquivo:** `src/modules/reports/dp-dashboard/queries/kpis.query.ts`

```typescript
import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";
import type { Kpis } from "../dp-dashboard.model";

export abstract class KpisQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<Kpis> {
    const { startDate, endDate, sectorIds } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    // Funcionários ativos
    const [{ value: activeEmployees }] = await db
      .select({ value: count() })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          eq(schema.employees.status, "ACTIVE"),
          isNull(schema.employees.deletedAt),
          sectorFilter
        )
      );

    // Demissões no período
    const [{ value: terminatedEmployees }] = await db
      .select({ value: count() })
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
          isNull(schema.terminations.deletedAt),
          sectorFilter
        )
      );

    // Advertências no período
    const [{ value: warnings }] = await db
      .select({ value: count() })
      .from(schema.warnings)
      .innerJoin(
        schema.employees,
        eq(schema.warnings.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.warnings.organizationId, organizationId),
          gte(schema.warnings.date, startDate),
          lte(schema.warnings.date, endDate),
          isNull(schema.warnings.deletedAt),
          sectorFilter
        )
      );

    // Último acidente
    const [lastAccident] = await db
      .select({ date: schema.accidents.date })
      .from(schema.accidents)
      .where(
        and(
          eq(schema.accidents.organizationId, organizationId),
          isNull(schema.accidents.deletedAt)
        )
      )
      .orderBy(sql`${schema.accidents.date} DESC`)
      .limit(1);

    const daysSinceLastAccident = lastAccident
      ? Math.floor(
          (Date.now() - lastAccident.date.getTime()) / (1000 * 60 * 60 * 24)
        )
      : 999;

    // Calcular turnover
    const total = activeEmployees + terminatedEmployees;
    const turnoverRate = total > 0
      ? Math.round((terminatedEmployees / total) * 10000) / 100
      : 0;

    return {
      activeEmployees,
      terminatedEmployees,
      turnoverRate,
      warnings,
      daysSinceLastAccident,
    };
  }
}
```

#### 3.2 Histórico de Funcionários

**Arquivo:** `src/modules/reports/dp-dashboard/queries/employee-history.query.ts`

```typescript
import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { generateMonthRange } from "../../shared/date-utils";
import type { NormalizedFilters } from "../../shared/filters.model";
import type { EmployeeHistoryItem } from "../dp-dashboard.model";

export abstract class EmployeeHistoryQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<EmployeeHistoryItem[]> {
    const { startDate, endDate, sectorIds } = filters;
    const months = generateMonthRange(startDate, endDate);

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    // Admissões por mês
    const admissions = await db
      .select({
        month: sql<string>`TO_CHAR(${schema.employees.hireDate}, 'YYYY-MM')`,
        count: count(),
      })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          gte(schema.employees.hireDate, startDate),
          lte(schema.employees.hireDate, endDate),
          isNull(schema.employees.deletedAt),
          sectorFilter
        )
      )
      .groupBy(sql`TO_CHAR(${schema.employees.hireDate}, 'YYYY-MM')`);

    // Demissões por mês
    const terminations = await db
      .select({
        month: sql<string>`TO_CHAR(${schema.terminations.terminationDate}, 'YYYY-MM')`,
        count: count(),
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
          isNull(schema.terminations.deletedAt),
          sectorFilter
        )
      )
      .groupBy(sql`TO_CHAR(${schema.terminations.terminationDate}, 'YYYY-MM')`);

    // Count inicial (antes do período)
    const [{ value: initialCount }] = await db
      .select({ value: count() })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          sql`${schema.employees.hireDate} < ${startDate}`,
          isNull(schema.employees.deletedAt),
          sectorFilter
        )
      );

    // Mapear resultados
    const admissionsMap = new Map(admissions.map((a) => [a.month, a.count]));
    const terminationsMap = new Map(terminations.map((t) => [t.month, t.count]));

    let runningActive = initialCount;

    return months.map((month) => {
      const admitted = admissionsMap.get(month) ?? 0;
      const terminated = terminationsMap.get(month) ?? 0;
      runningActive = runningActive + admitted - terminated;

      return {
        month,
        admitted,
        terminated,
        active: runningActive,
      };
    });
  }
}
```

#### 3.3 Demographics (Gênero, Estado Civil, Escolaridade, Contrato)

**Arquivo:** `src/modules/reports/dp-dashboard/queries/demographics.query.ts`

```typescript
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";
import type { DistributionItem } from "../dp-dashboard.model";

const GENDER_LABELS: Record<string, string> = {
  MALE: "Masculino",
  FEMALE: "Feminino",
  NOT_DECLARED: "Não declarado",
  OTHER: "Outro",
};

const MARITAL_STATUS_LABELS: Record<string, string> = {
  SINGLE: "Solteiro(a)",
  MARRIED: "Casado(a)",
  DIVORCED: "Divorciado(a)",
  WIDOWED: "Viúvo(a)",
  STABLE_UNION: "União estável",
  SEPARATED: "Separado(a)",
};

const EDUCATION_LABELS: Record<string, string> = {
  ELEMENTARY: "Fundamental",
  HIGH_SCHOOL: "Médio",
  BACHELOR: "Superior",
  POST_GRADUATE: "Pós-graduação",
  MASTER: "Mestrado",
  DOCTORATE: "Doutorado",
};

const CONTRACT_LABELS: Record<string, string> = {
  CLT: "CLT",
  PJ: "PJ",
};

export abstract class DemographicsQuery {
  private static async getDistribution(
    organizationId: string,
    filters: NormalizedFilters,
    column: typeof schema.employees.gender,
    labels: Record<string, string>
  ): Promise<DistributionItem[]> {
    const { sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    const results = await db
      .select({
        value: column,
        count: count(),
      })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(column);

    const total = results.reduce((sum, r) => sum + r.count, 0);

    return results.map((r) => ({
      label: labels[r.value as string] ?? r.value,
      count: r.count,
      percentage: total > 0 ? Math.round((r.count / total) * 10000) / 100 : 0,
    }));
  }

  static async getGenderDistribution(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<DistributionItem[]> {
    return DemographicsQuery.getDistribution(
      organizationId,
      filters,
      schema.employees.gender,
      GENDER_LABELS
    );
  }

  static async getMaritalStatus(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<DistributionItem[]> {
    return DemographicsQuery.getDistribution(
      organizationId,
      filters,
      schema.employees.maritalStatus,
      MARITAL_STATUS_LABELS
    );
  }

  static async getEducationLevels(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<DistributionItem[]> {
    return DemographicsQuery.getDistribution(
      organizationId,
      filters,
      schema.employees.educationLevel,
      EDUCATION_LABELS
    );
  }

  static async getContractTypes(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<DistributionItem[]> {
    return DemographicsQuery.getDistribution(
      organizationId,
      filters,
      schema.employees.contractType,
      CONTRACT_LABELS
    );
  }
}
```

#### 3.4 Despesas

**Arquivo:** `src/modules/reports/dp-dashboard/queries/expenses.query.ts`

```typescript
import { and, eq, isNull, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { generateMonthRange } from "../../shared/date-utils";
import type { NormalizedFilters } from "../../shared/filters.model";
import type { ExpenseBreakdown, MonthlyExpenseItem } from "../dp-dashboard.model";

export abstract class ExpensesQuery {
  static async getMonthly(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<MonthlyExpenseItem[]> {
    const { startDate, endDate, sectorIds, status } = filters;
    const months = generateMonthRange(startDate, endDate);

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    // Total de despesas por mês (baseado em quem estava ativo no mês)
    // Simplificação: considera o salário atual dos funcionários ativos
    const totals = await db
      .select({
        salary: sum(schema.employees.salary),
        transport: sum(schema.employees.transportAllowance),
        meal: sum(schema.employees.mealAllowance),
      })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      );

    const monthlyTotal = Number(totals[0]?.salary ?? 0) +
      Number(totals[0]?.transport ?? 0) +
      Number(totals[0]?.meal ?? 0);

    // Para cada mês, retornar o total (simplificado)
    // Em produção, considerar funcionários ativos em cada mês específico
    return months.map((month) => ({
      month,
      total: Math.round(monthlyTotal * 100) / 100,
    }));
  }

  static async getBreakdown(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<ExpenseBreakdown> {
    const { sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    const [totals] = await db
      .select({
        salary: sum(schema.employees.salary),
        transport: sum(schema.employees.transportAllowance),
        meal: sum(schema.employees.mealAllowance),
      })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      );

    const salary = Number(totals?.salary ?? 0);
    const transport = Number(totals?.transport ?? 0);
    const meal = Number(totals?.meal ?? 0);
    const total = salary + transport + meal;

    const calcPercentage = (value: number) =>
      total > 0 ? Math.round((value / total) * 10000) / 100 : 0;

    return {
      salary: {
        label: "Salário",
        count: salary,
        percentage: calcPercentage(salary),
      },
      transport: {
        label: "Transporte",
        count: transport,
        percentage: calcPercentage(transport),
      },
      meal: {
        label: "Alimentação",
        count: meal,
        percentage: calcPercentage(meal),
      },
    };
  }
}
```

#### 3.5 Idade por Cargo

**Arquivo:** `src/modules/reports/dp-dashboard/queries/age-by-position.query.ts`

```typescript
import { and, avg, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";
import type { AgeByPositionItem } from "../dp-dashboard.model";

export abstract class AgeByPositionQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<AgeByPositionItem[]> {
    const { sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    const results = await db
      .select({
        position: schema.jobPositions.name,
        averageAge: avg(
          sql`EXTRACT(YEAR FROM AGE(${schema.employees.birthDate}))`
        ),
      })
      .from(schema.employees)
      .innerJoin(
        schema.jobPositions,
        eq(schema.employees.jobPositionId, schema.jobPositions.id)
      )
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(schema.jobPositions.name)
      .orderBy(sql`2 DESC`); // Ordenar por idade média desc

    return results.map((r) => ({
      position: r.position,
      averageAge: Math.round(Number(r.averageAge ?? 0)),
    }));
  }
}
```

#### 3.6 Faltas por Setor

**Arquivo:** `src/modules/reports/dp-dashboard/queries/absences-by-sector.query.ts`

```typescript
import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { generateMonthRange } from "../../shared/date-utils";
import type { NormalizedFilters } from "../../shared/filters.model";
import type { AbsencesBySectorItem } from "../dp-dashboard.model";

export abstract class AbsencesBySectorQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<AbsencesBySectorItem[]> {
    const { startDate, endDate, sectorIds } = filters;
    const months = generateMonthRange(startDate, endDate);

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    // Buscar setores da organização
    const sectors = await db
      .select({ id: schema.sectors.id, name: schema.sectors.name })
      .from(schema.sectors)
      .where(
        and(
          eq(schema.sectors.organizationId, organizationId),
          isNull(schema.sectors.deletedAt)
        )
      );

    // Buscar faltas agrupadas por mês e setor
    const absences = await db
      .select({
        month: sql<string>`TO_CHAR(${schema.absences.startDate}, 'YYYY-MM')`,
        sectorId: schema.employees.sectorId,
        count: count(),
      })
      .from(schema.absences)
      .innerJoin(
        schema.employees,
        eq(schema.absences.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.absences.organizationId, organizationId),
          gte(schema.absences.startDate, startDate),
          lte(schema.absences.startDate, endDate),
          isNull(schema.absences.deletedAt),
          sectorFilter
        )
      )
      .groupBy(
        sql`TO_CHAR(${schema.absences.startDate}, 'YYYY-MM')`,
        schema.employees.sectorId
      );

    // Mapear resultados
    const absencesMap = new Map<string, Map<string, number>>();
    for (const a of absences) {
      if (!absencesMap.has(a.month)) {
        absencesMap.set(a.month, new Map());
      }
      absencesMap.get(a.month)!.set(a.sectorId as string, a.count);
    }

    // Construir resultado final
    return months.map((month) => {
      const monthData = absencesMap.get(month) ?? new Map();
      const data: Record<string, number> = {};

      for (const sector of sectors) {
        data[sector.name] = monthData.get(sector.id) ?? 0;
      }

      return { month, data };
    });
  }
}
```

#### 3.7 Acidentes

**Arquivo:** `src/modules/reports/dp-dashboard/queries/accidents.query.ts`

```typescript
import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { generateMonthRange } from "../../shared/date-utils";
import type { NormalizedFilters } from "../../shared/filters.model";
import type { AccidentItem } from "../dp-dashboard.model";

export abstract class AccidentsQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<AccidentItem[]> {
    const { startDate, endDate } = filters;
    const months = generateMonthRange(startDate, endDate);

    const accidents = await db
      .select({
        month: sql<string>`TO_CHAR(${schema.accidents.date}, 'YYYY-MM')`,
        count: count(),
      })
      .from(schema.accidents)
      .where(
        and(
          eq(schema.accidents.organizationId, organizationId),
          gte(schema.accidents.date, startDate),
          lte(schema.accidents.date, endDate),
          isNull(schema.accidents.deletedAt)
        )
      )
      .groupBy(sql`TO_CHAR(${schema.accidents.date}, 'YYYY-MM')`);

    const accidentsMap = new Map(accidents.map((a) => [a.month, a.count]));

    return months.map((month) => ({
      month,
      count: accidentsMap.get(month) ?? 0,
    }));
  }
}
```

---

### Fase 4: Service

**Arquivo:** `src/modules/reports/dp-dashboard/dp-dashboard.service.ts`

```typescript
import { InvalidDateRangeError, PeriodTooLongError } from "../errors";
import { getDefaultDateRange } from "../shared/date-utils";
import type { NormalizedFilters, ReportFilters } from "../shared/filters.model";
import type { DpDashboardData } from "./dp-dashboard.model";
import { AbsencesBySectorQuery } from "./queries/absences-by-sector.query";
import { AccidentsQuery } from "./queries/accidents.query";
import { AgeByPositionQuery } from "./queries/age-by-position.query";
import { DemographicsQuery } from "./queries/demographics.query";
import { EmployeeHistoryQuery } from "./queries/employee-history.query";
import { ExpensesQuery } from "./queries/expenses.query";
import { KpisQuery } from "./queries/kpis.query";

const MAX_PERIOD_DAYS = 730; // 2 anos

export abstract class DpDashboardService {
  static async getDashboard(
    organizationId: string,
    filters: ReportFilters
  ): Promise<DpDashboardData> {
    const normalizedFilters = DpDashboardService.normalizeFilters(filters);

    // Executar todas as queries em paralelo
    const [
      kpis,
      employeeHistory,
      absencesBySector,
      monthlyExpenses,
      expenseBreakdown,
      genderDistribution,
      contractTypes,
      maritalStatus,
      educationLevels,
      ageByPosition,
      accidents,
    ] = await Promise.all([
      KpisQuery.execute(organizationId, normalizedFilters),
      EmployeeHistoryQuery.execute(organizationId, normalizedFilters),
      AbsencesBySectorQuery.execute(organizationId, normalizedFilters),
      ExpensesQuery.getMonthly(organizationId, normalizedFilters),
      ExpensesQuery.getBreakdown(organizationId, normalizedFilters),
      DemographicsQuery.getGenderDistribution(organizationId, normalizedFilters),
      DemographicsQuery.getContractTypes(organizationId, normalizedFilters),
      DemographicsQuery.getMaritalStatus(organizationId, normalizedFilters),
      DemographicsQuery.getEducationLevels(organizationId, normalizedFilters),
      AgeByPositionQuery.execute(organizationId, normalizedFilters),
      AccidentsQuery.execute(organizationId, normalizedFilters),
    ]);

    return {
      filters: {
        period: {
          start: normalizedFilters.startDate,
          end: normalizedFilters.endDate,
        },
        sectors: normalizedFilters.sectorIds,
        branches: normalizedFilters.branchIds,
        status: normalizedFilters.status,
      },
      kpis,
      employeeHistory,
      absencesBySector,
      monthlyExpenses,
      expenseBreakdown,
      genderDistribution,
      contractTypes,
      maritalStatus,
      educationLevels,
      ageByPosition,
      accidents,
    };
  }

  private static normalizeFilters(filters: ReportFilters): NormalizedFilters {
    const defaults = getDefaultDateRange();

    const startDate = filters.startDate ?? defaults.startDate;
    const endDate = filters.endDate ?? defaults.endDate;

    // Validar range
    if (startDate > endDate) {
      throw new InvalidDateRangeError();
    }

    const diffDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays > MAX_PERIOD_DAYS) {
      throw new PeriodTooLongError(MAX_PERIOD_DAYS);
    }

    return {
      startDate,
      endDate,
      sectorIds: filters.sectorIds ?? [],
      branchIds: filters.branchIds ?? [],
      status: filters.status ?? "ALL",
    };
  }
}
```

---

### Fase 5: Controller

**Arquivo:** `src/modules/reports/dp-dashboard/index.ts`

```typescript
import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { reportFiltersSchema } from "../shared/filters.model";
import { dpDashboardResponseSchema } from "./dp-dashboard.model";
import { DpDashboardService } from "./dp-dashboard.service";

export const dpDashboardController = new Elysia({
  name: "dp-dashboard",
  prefix: "/v1/reports/dp-dashboard",
  detail: { tags: ["Reports - DP Dashboard"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async ({ session, query }) =>
      wrapSuccess(
        await DpDashboardService.getDashboard(
          session.activeOrganizationId as string,
          query
        )
      ),
    {
      auth: {
        requireFeature: "dp_dashboard",
        requireOrganization: true,
      },
      query: reportFiltersSchema,
      response: {
        200: dpDashboardResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "Get DP Dashboard",
        description:
          "Returns complete DP management dashboard with KPIs, charts and analytics. " +
          "Supports filtering by date range, sectors, branches and employee status.",
      },
    }
  );
```

**Arquivo:** `src/modules/reports/index.ts`

```typescript
import { Elysia } from "elysia";
import { dpDashboardController } from "./dp-dashboard";

export const reportsController = new Elysia({
  name: "reports",
})
  .use(dpDashboardController);
```

---

### Fase 6: Registro e Feature

#### 6.1 Registrar Controller

**Arquivo:** `src/index.ts`

```typescript
import { reportsController } from "./modules/reports";

const app = new Elysia()
  // ... outros controllers
  .use(reportsController);
```

#### 6.2 Adicionar Feature ao Sistema de Planos

Adicionar `dp_dashboard` às features disponíveis nos planos.

---

### Fase 7: Testes

#### 7.1 Arquivo de Teste E2E

**Arquivo:** `src/modules/reports/dp-dashboard/__tests__/get-dp-dashboard.test.ts`

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/reports/dp-dashboard", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/reports/dp-dashboard`)
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/reports/dp-dashboard`, { headers })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty dashboard for organization without data", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/reports/dp-dashboard`, { headers })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.kpis.activeEmployees).toBe(0);
    expect(body.data.kpis.terminatedEmployees).toBe(0);
    expect(body.data.employeeHistory).toBeArray();
    expect(body.data.genderDistribution).toBeArray();
  });

  test("should return correct KPIs for organization with employees", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({ emailVerified: true });

    // Criar funcionários
    await createTestEmployee({ organizationId, userId });
    await createTestEmployee({ organizationId, userId });
    await createTestEmployee({ organizationId, userId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/reports/dp-dashboard`, { headers })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.kpis.activeEmployees).toBe(3);
  });

  test("should filter by date range", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const startDate = "2025-01-01";
    const endDate = "2025-06-30";

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/reports/dp-dashboard?startDate=${startDate}&endDate=${endDate}`,
        { headers }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.filters.period.start).toContain("2025-01-01");
    expect(body.data.filters.period.end).toContain("2025-06-30");
  });

  test("should reject invalid date range", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/reports/dp-dashboard?startDate=2025-12-01&endDate=2025-01-01`,
        { headers }
      )
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_DATE_RANGE");
  });
});
```

---

## Índices Recomendados

```sql
-- Performance para queries de reports
CREATE INDEX IF NOT EXISTS idx_employees_org_status_deleted
  ON employees(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_org_hire_date_deleted
  ON employees(organization_id, hire_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_org_sector_deleted
  ON employees(organization_id, sector_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_terminations_org_date_deleted
  ON terminations(organization_id, termination_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warnings_org_date_deleted
  ON warnings(organization_id, date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accidents_org_date_deleted
  ON accidents(organization_id, date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_absences_org_dates_deleted
  ON absences(organization_id, start_date, end_date)
  WHERE deleted_at IS NULL;
```

---

## Uso no Frontend (shadcn/ui)

### Exemplo de Integração

```tsx
import { AreaChart, BarChart, PieChart } from "@/components/ui/charts";

export function DpDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dp-dashboard", filters],
    queryFn: () => api.get("/v1/reports/dp-dashboard", { params: filters }),
  });

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="grid gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard title="Funcionários" value={data.kpis.activeEmployees} />
        <KpiCard title="Demitidos" value={data.kpis.terminatedEmployees} />
        <KpiCard title="Turnover" value={`${data.kpis.turnoverRate}%`} />
        <KpiCard title="Advertências" value={data.kpis.warnings} />
        <KpiCard title="Dias s/ Acidente" value={data.kpis.daysSinceLastAccident} />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>Histórico</CardHeader>
          <AreaChart data={data.employeeHistory} />
        </Card>

        <Card>
          <CardHeader>Composição por Gênero</CardHeader>
          <PieChart data={data.genderDistribution} />
        </Card>
      </div>
    </div>
  );
}
```

---

## Checklist de Implementação

### Estrutura
- [ ] Criar diretório `src/modules/reports/dp-dashboard/queries/`
- [ ] Criar diretório `src/modules/reports/shared/`
- [ ] Criar `errors.ts`
- [ ] Criar `shared/filters.model.ts`
- [ ] Criar `shared/date-utils.ts`

### Model
- [ ] Criar `dp-dashboard.model.ts` com todos os schemas

### Queries
- [ ] Implementar `kpis.query.ts`
- [ ] Implementar `employee-history.query.ts`
- [ ] Implementar `absences-by-sector.query.ts`
- [ ] Implementar `expenses.query.ts`
- [ ] Implementar `demographics.query.ts`
- [ ] Implementar `age-by-position.query.ts`
- [ ] Implementar `accidents.query.ts`

### Service e Controller
- [ ] Implementar `dp-dashboard.service.ts`
- [ ] Implementar `dp-dashboard/index.ts` (controller)
- [ ] Criar `reports/index.ts` (agregador)
- [ ] Registrar em `src/index.ts`

### Feature e Permissões
- [ ] Adicionar feature `dp_dashboard` ao sistema de planos
- [ ] Configurar `requireFeature` no controller

### Banco de Dados
- [ ] Criar índices recomendados

### Testes
- [ ] Criar `__tests__/get-dp-dashboard.test.ts`
- [ ] Testar autenticação (401)
- [ ] Testar organização sem feature (403)
- [ ] Testar dashboard vazio
- [ ] Testar com dados
- [ ] Testar filtros

### Verificação
- [ ] `bun run check` sem erros
- [ ] Todos os testes passando
- [ ] Endpoint na documentação OpenAPI
