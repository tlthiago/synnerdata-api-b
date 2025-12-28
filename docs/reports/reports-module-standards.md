# Reports Module Standards

> **OBRIGATÓRIO para Agentes de IA**: Leia ANTES de criar/modificar relatórios. Siga EXATAMENTE os padrões abaixo.

## Visão Geral

O módulo de reports é responsável por gerar relatórios analíticos e dashboards a partir dos dados cadastrados na plataforma. Diferente dos módulos CRUD, os reports **agregam dados** de múltiplas entidades para fornecer insights.

### Diferenças entre Módulos CRUD e Reports

| Aspecto | Módulo CRUD | Módulo Reports |
|---------|-------------|----------------|
| Objetivo | Gerenciar entidades | Agregar e analisar dados |
| Operações | Create, Read, Update, Delete | Read only (consultas) |
| Controle de acesso | `permissions` (RBAC por papel) | `requireFeature` (por plano) |
| Response | Entidade única ou lista | Dados agregados estruturados |
| Performance | Queries simples | Queries complexas com agregações |

---

## Estrutura do Módulo

```text
src/modules/reports/
├── index.ts                      # Controller principal (agrupa sub-controllers)
├── errors.ts                     # Erros do domínio reports
│
├── dp-dashboard/                 # Dashboard de Gestão DP
│   ├── index.ts                  # Controller do dashboard
│   ├── dp-dashboard.model.ts     # Schemas de response
│   ├── dp-dashboard.service.ts   # Orquestração das queries
│   └── queries/                  # Queries de agregação
│       ├── kpis.query.ts
│       ├── employee-history.query.ts
│       ├── expenses.query.ts
│       └── demographics.query.ts
│
├── {outro-report}/               # Outros relatórios seguem o mesmo padrão
│   └── ...
│
├── shared/                       # Utilitários compartilhados entre reports
│   ├── filters.model.ts          # Schemas de filtros comuns
│   ├── date-utils.ts             # Funções de manipulação de datas
│   └── aggregation-utils.ts      # Funções auxiliares de agregação
│
└── exporters/                    # Exportação de relatórios
    ├── pdf.exporter.ts
    ├── excel.exporter.ts
    └── csv.exporter.ts
```

---

## Estrutura de Rotas

### Padrão de Rotas para Reports

```text
GET /v1/reports/{report-name}                    # Relatório completo
GET /v1/reports/{report-name}/kpis               # Apenas KPIs (opcional)
GET /v1/reports/{report-name}/export/{format}    # Exportação
```

**Exemplos:**
```text
GET /v1/reports/dp-dashboard                     # Dashboard completo
GET /v1/reports/dp-dashboard?startDate=2025-01-01&endDate=2025-11-30
GET /v1/reports/dp-dashboard/export/pdf
GET /v1/reports/dp-dashboard/export/excel
```

### Tags OpenAPI

```typescript
export const dpDashboardController = new Elysia({
  name: "dp-dashboard",
  prefix: "/v1/reports/dp-dashboard",
  detail: { tags: ["Reports - DP Dashboard"] },
})
```

---

## Controle de Acesso

Reports usam **`requireFeature`** para controle por plano, diferente de módulos CRUD que usam `permissions`.

```typescript
// Controller de report
.get(
  "/",
  async ({ session }) => /* ... */,
  {
    auth: {
      requireFeature: "dp_dashboard",  // Feature do plano
      requireOrganization: true,
    },
    // ...
  }
)
```

### Combinando com Permissões (opcional)

Se necessário restringir por papel também:

```typescript
auth: {
  requireFeature: "dp_dashboard",
  permissions: { reports: ["read"] },  // Apenas leitura
  requireOrganization: true,
}
```

---

## Model (`{report}.model.ts`)

### Schema de Filtros

```typescript
import { z } from "zod";

// Filtros comuns para reports
export const reportFiltersSchema = z.object({
  startDate: z.coerce.date().optional().describe("Data inicial do período"),
  endDate: z.coerce.date().optional().describe("Data final do período"),
  sectorIds: z.array(z.string()).optional().describe("Filtrar por setores"),
  branchIds: z.array(z.string()).optional().describe("Filtrar por filiais"),
  status: z.enum(["ACTIVE", "TERMINATED", "ALL"]).default("ALL").describe("Status dos funcionários"),
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;
```

### Schema de Response (Dashboard Completo)

```typescript
import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// KPIs
const kpisSchema = z.object({
  activeEmployees: z.number().describe("Total de funcionários ativos"),
  terminatedEmployees: z.number().describe("Total de funcionários demitidos no período"),
  turnoverRate: z.number().describe("Índice de turnover (%)"),
  warnings: z.number().describe("Total de advertências no período"),
  daysSinceLastAccident: z.number().describe("Dias sem acidentes"),
});

// Gráfico de série temporal
const timeSeriesItemSchema = z.object({
  month: z.string().describe("Mês no formato YYYY-MM"),
  admitted: z.number().describe("Admitidos no mês"),
  terminated: z.number().describe("Demitidos no mês"),
  active: z.number().describe("Ativos no final do mês"),
});

// Distribuição (para gráficos de pizza)
const distributionItemSchema = z.object({
  label: z.string().describe("Rótulo da categoria"),
  count: z.number().describe("Quantidade"),
  percentage: z.number().describe("Percentual"),
});

// Response completo do dashboard
const dpDashboardDataSchema = z.object({
  filters: z.object({
    period: z.object({
      start: z.coerce.date(),
      end: z.coerce.date(),
    }),
    sectors: z.array(z.string()),
    status: z.string(),
  }),

  kpis: kpisSchema,

  employeeHistory: z.array(timeSeriesItemSchema),
  absencesBySector: z.array(z.object({
    month: z.string(),
    data: z.record(z.string(), z.number()),
  })),
  monthlyExpenses: z.array(z.object({
    month: z.string(),
    total: z.number(),
  })),

  expenseBreakdown: z.object({
    salary: distributionItemSchema,
    transport: distributionItemSchema,
    meal: distributionItemSchema,
  }),

  genderDistribution: z.array(distributionItemSchema),
  contractTypes: z.array(distributionItemSchema),
  maritalStatus: z.array(distributionItemSchema),
  educationLevels: z.array(distributionItemSchema),

  ageByPosition: z.array(z.object({
    position: z.string(),
    averageAge: z.number(),
  })),

  accidents: z.array(z.object({
    month: z.string(),
    count: z.number(),
  })),
});

export const dpDashboardResponseSchema = successResponseSchema(dpDashboardDataSchema);
export type DpDashboardData = z.infer<typeof dpDashboardDataSchema>;
```

---

## Service (`{report}.service.ts`)

### Estrutura Recomendada

```typescript
import type { DpDashboardData, ReportFilters } from "./dp-dashboard.model";
import { KpisQuery } from "./queries/kpis.query";
import { EmployeeHistoryQuery } from "./queries/employee-history.query";
import { ExpensesQuery } from "./queries/expenses.query";
import { DemographicsQuery } from "./queries/demographics.query";

export abstract class DpDashboardService {
  static async getDashboard(
    organizationId: string,
    filters: ReportFilters
  ): Promise<DpDashboardData> {
    // Normalizar filtros com defaults
    const normalizedFilters = DpDashboardService.normalizeFilters(filters);

    // Executar queries em paralelo para melhor performance
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
      DemographicsQuery.getAgeByPosition(organizationId, normalizedFilters),
      AccidentsQuery.execute(organizationId, normalizedFilters),
    ]);

    return {
      filters: {
        period: { start: normalizedFilters.startDate, end: normalizedFilters.endDate },
        sectors: normalizedFilters.sectorIds ?? [],
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

  private static normalizeFilters(filters: ReportFilters): Required<ReportFilters> {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    return {
      startDate: filters.startDate ?? startOfYear,
      endDate: filters.endDate ?? now,
      sectorIds: filters.sectorIds ?? [],
      branchIds: filters.branchIds ?? [],
      status: filters.status ?? "ALL",
    };
  }
}
```

---

## Queries (`queries/*.query.ts`)

### Padrão de Query

Cada query é uma classe abstrata com método estático `execute`:

```typescript
// queries/kpis.query.ts
import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { ReportFilters } from "../dp-dashboard.model";

interface KpisResult {
  activeEmployees: number;
  terminatedEmployees: number;
  turnoverRate: number;
  warnings: number;
  daysSinceLastAccident: number;
}

export abstract class KpisQuery {
  static async execute(
    organizationId: string,
    filters: Required<ReportFilters>
  ): Promise<KpisResult> {
    const { startDate, endDate, sectorIds } = filters;

    // Query 1: Funcionários ativos
    const [{ count: activeCount }] = await db
      .select({ count: count() })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          eq(schema.employees.status, "ACTIVE"),
          isNull(schema.employees.deletedAt),
          sectorIds.length > 0
            ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
            : undefined
        )
      );

    // Query 2: Demissões no período
    const [{ count: terminatedCount }] = await db
      .select({ count: count() })
      .from(schema.terminations)
      .where(
        and(
          eq(schema.terminations.organizationId, organizationId),
          gte(schema.terminations.terminationDate, startDate),
          lte(schema.terminations.terminationDate, endDate)
        )
      );

    // Query 3: Advertências no período
    const [{ count: warningsCount }] = await db
      .select({ count: count() })
      .from(schema.warnings)
      .where(
        and(
          eq(schema.warnings.organizationId, organizationId),
          gte(schema.warnings.date, startDate),
          lte(schema.warnings.date, endDate),
          isNull(schema.warnings.deletedAt)
        )
      );

    // Query 4: Último acidente
    const [lastAccident] = await db
      .select({ date: schema.accidents.date })
      .from(schema.accidents)
      .where(eq(schema.accidents.organizationId, organizationId))
      .orderBy(sql`${schema.accidents.date} DESC`)
      .limit(1);

    const daysSinceLastAccident = lastAccident
      ? Math.floor((Date.now() - lastAccident.date.getTime()) / (1000 * 60 * 60 * 24))
      : 999; // Nenhum acidente registrado

    // Calcular turnover
    const totalEmployees = activeCount + terminatedCount;
    const turnoverRate = totalEmployees > 0
      ? (terminatedCount / totalEmployees) * 100
      : 0;

    return {
      activeEmployees: activeCount,
      terminatedEmployees: terminatedCount,
      turnoverRate: Math.round(turnoverRate * 100) / 100,
      warnings: warningsCount,
      daysSinceLastAccident,
    };
  }
}
```

### Query de Série Temporal

```typescript
// queries/employee-history.query.ts
import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

interface EmployeeHistoryItem {
  month: string;
  admitted: number;
  terminated: number;
  active: number;
}

export abstract class EmployeeHistoryQuery {
  static async execute(
    organizationId: string,
    filters: Required<ReportFilters>
  ): Promise<EmployeeHistoryItem[]> {
    const { startDate, endDate } = filters;

    // Gerar lista de meses no período
    const months = EmployeeHistoryQuery.generateMonths(startDate, endDate);

    // Query de admissões por mês
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
          isNull(schema.employees.deletedAt)
        )
      )
      .groupBy(sql`TO_CHAR(${schema.employees.hireDate}, 'YYYY-MM')`);

    // Query de demissões por mês
    const terminations = await db
      .select({
        month: sql<string>`TO_CHAR(${schema.terminations.terminationDate}, 'YYYY-MM')`,
        count: count(),
      })
      .from(schema.terminations)
      .where(
        and(
          eq(schema.terminations.organizationId, organizationId),
          gte(schema.terminations.terminationDate, startDate),
          lte(schema.terminations.terminationDate, endDate)
        )
      )
      .groupBy(sql`TO_CHAR(${schema.terminations.terminationDate}, 'YYYY-MM')`);

    // Montar resultado com acumulado
    const admissionsMap = new Map(admissions.map(a => [a.month, a.count]));
    const terminationsMap = new Map(terminations.map(t => [t.month, t.count]));

    let runningActive = 0; // Buscar count inicial antes do período

    return months.map(month => {
      const admitted = admissionsMap.get(month) ?? 0;
      const terminated = terminationsMap.get(month) ?? 0;
      runningActive += admitted - terminated;

      return {
        month,
        admitted,
        terminated,
        active: runningActive,
      };
    });
  }

  private static generateMonths(start: Date, end: Date): string[] {
    const months: string[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      months.push(current.toISOString().slice(0, 7)); // YYYY-MM
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }
}
```

---

## Controller (`index.ts`)

```typescript
import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  unauthorizedErrorSchema,
} from "@/lib/responses/response.types";
import {
  dpDashboardResponseSchema,
  reportFiltersSchema,
} from "./dp-dashboard.model";
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
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "Get DP Dashboard",
        description: "Returns complete DP management dashboard with KPIs, charts and analytics",
      },
    }
  );
```

---

## Exportação de Relatórios

### Formatos Suportados

| Formato | Biblioteca | Uso |
|---------|------------|-----|
| PDF | `@react-pdf/renderer` ou `puppeteer` | Relatórios formais para impressão |
| Excel | `exceljs` | Análises customizadas pelo usuário |
| CSV | Nativo | Integração com outros sistemas |

### Estrutura de Exportadores

```typescript
// exporters/excel.exporter.ts
import ExcelJS from "exceljs";
import type { DpDashboardData } from "../dp-dashboard/dp-dashboard.model";

export abstract class ExcelExporter {
  static async exportDpDashboard(data: DpDashboardData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Aba 1: KPIs
    const kpisSheet = workbook.addWorksheet("KPIs");
    kpisSheet.addRow(["Métrica", "Valor"]);
    kpisSheet.addRow(["Funcionários Ativos", data.kpis.activeEmployees]);
    kpisSheet.addRow(["Funcionários Demitidos", data.kpis.terminatedEmployees]);
    kpisSheet.addRow(["Índice de Turnover (%)", data.kpis.turnoverRate]);
    kpisSheet.addRow(["Advertências", data.kpis.warnings]);
    kpisSheet.addRow(["Dias sem Acidentes", data.kpis.daysSinceLastAccident]);

    // Aba 2: Histórico
    const historySheet = workbook.addWorksheet("Histórico");
    historySheet.addRow(["Mês", "Admitidos", "Demitidos", "Ativos"]);
    for (const item of data.employeeHistory) {
      historySheet.addRow([item.month, item.admitted, item.terminated, item.active]);
    }

    // Aba 3: Despesas
    const expensesSheet = workbook.addWorksheet("Despesas");
    expensesSheet.addRow(["Mês", "Total (R$)"]);
    for (const item of data.monthlyExpenses) {
      expensesSheet.addRow([item.month, item.total]);
    }

    // ... outras abas

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
```

### Endpoint de Exportação

```typescript
// Adicionar ao controller
.get(
  "/export/:format",
  async ({ session, query, params }) => {
    const data = await DpDashboardService.getDashboard(
      session.activeOrganizationId as string,
      query
    );

    switch (params.format) {
      case "excel":
        const excelBuffer = await ExcelExporter.exportDpDashboard(data);
        return new Response(excelBuffer, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="dp-dashboard-${Date.now()}.xlsx"`,
          },
        });

      case "csv":
        const csvContent = CsvExporter.exportDpDashboard(data);
        return new Response(csvContent, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="dp-dashboard-${Date.now()}.csv"`,
          },
        });

      case "pdf":
        const pdfBuffer = await PdfExporter.exportDpDashboard(data);
        return new Response(pdfBuffer, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="dp-dashboard-${Date.now()}.pdf"`,
          },
        });

      default:
        throw new InvalidExportFormatError(params.format);
    }
  },
  {
    auth: {
      requireFeature: "dp_dashboard",
      requireOrganization: true,
    },
    params: z.object({
      format: z.enum(["excel", "csv", "pdf"]).describe("Formato de exportação"),
    }),
    query: reportFiltersSchema,
    // ...
  }
)
```

---

## Considerações de Performance

### 1. Queries em Paralelo

**SEMPRE** executar queries independentes em paralelo:

```typescript
// ✅ Correto: queries em paralelo
const [kpis, history, expenses] = await Promise.all([
  KpisQuery.execute(orgId, filters),
  HistoryQuery.execute(orgId, filters),
  ExpensesQuery.execute(orgId, filters),
]);

// ❌ Errado: queries sequenciais
const kpis = await KpisQuery.execute(orgId, filters);
const history = await HistoryQuery.execute(orgId, filters);
const expenses = await ExpensesQuery.execute(orgId, filters);
```

### 2. Índices no Banco de Dados

Criar índices para as colunas mais filtradas:

```sql
-- Índices recomendados para reports
CREATE INDEX idx_employees_org_status ON employees(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_org_hire_date ON employees(organization_id, hire_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_terminations_org_date ON terminations(organization_id, termination_date);
CREATE INDEX idx_warnings_org_date ON warnings(organization_id, date) WHERE deleted_at IS NULL;
CREATE INDEX idx_accidents_org_date ON accidents(organization_id, date) WHERE deleted_at IS NULL;
CREATE INDEX idx_absences_org_dates ON absences(organization_id, start_date, end_date) WHERE deleted_at IS NULL;
```

### 3. Materialized Views (Futuro)

Para reports muito pesados, considerar materialized views:

```sql
-- Exemplo: view materializada para KPIs
CREATE MATERIALIZED VIEW mv_organization_kpis AS
SELECT
  organization_id,
  COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_employees,
  COUNT(*) FILTER (WHERE status = 'TERMINATED') as terminated_employees,
  -- ...
FROM employees
WHERE deleted_at IS NULL
GROUP BY organization_id;

-- Refresh periódico (via cron job)
REFRESH MATERIALIZED VIEW mv_organization_kpis;
```

### 4. Cache (Futuro)

Para dados que não mudam com frequência:

```typescript
// Exemplo com Redis
const CACHE_TTL = 60 * 5; // 5 minutos

static async getDashboard(orgId: string, filters: ReportFilters): Promise<DpDashboardData> {
  const cacheKey = `dp-dashboard:${orgId}:${JSON.stringify(filters)}`;

  // Tentar cache primeiro
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Executar queries
  const data = await DpDashboardService.executeQueries(orgId, filters);

  // Salvar no cache
  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));

  return data;
}
```

### 5. Limites e Paginação

Para relatórios com muitos dados:

```typescript
// Limitar período máximo
const MAX_PERIOD_DAYS = 365;

private static normalizeFilters(filters: ReportFilters): Required<ReportFilters> {
  const { startDate, endDate } = filters;

  if (startDate && endDate) {
    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_PERIOD_DAYS) {
      throw new PeriodTooLongError(MAX_PERIOD_DAYS);
    }
  }

  // ...
}
```

---

## Testes

### Estrutura de Testes

```text
src/modules/reports/dp-dashboard/__tests__/
├── get-dp-dashboard.test.ts        # Testes E2E do endpoint
└── dp-dashboard.service.test.ts    # Testes de integração do service
```

### Cobertura Obrigatória

- [ ] Rejeitar requisição sem autenticação (401)
- [ ] Rejeitar organização sem feature habilitada (403)
- [ ] Retornar dashboard vazio para organização sem dados
- [ ] Retornar KPIs corretos
- [ ] Respeitar filtros de período
- [ ] Respeitar filtros de setor
- [ ] Exportar para Excel/CSV/PDF

### Exemplo de Teste

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { createTestEmployee } from "@/test/helpers/employee";

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

  test("should return dashboard with correct KPIs", async () => {
    const { headers, organizationId, userId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Setup: criar funcionários
    await createTestEmployee({ organizationId, userId, status: "ACTIVE" });
    await createTestEmployee({ organizationId, userId, status: "ACTIVE" });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/reports/dp-dashboard`, { headers })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.kpis.activeEmployees).toBe(2);
    expect(body.data.kpis.terminatedEmployees).toBe(0);
  });
});
```

---

## Checklist Rápido

**Novo relatório:**
- [ ] Criar diretório `src/modules/reports/{report-name}/`
- [ ] Criar `{report}.model.ts` com schemas de filtros e response
- [ ] Criar `{report}.service.ts` com método principal
- [ ] Criar `queries/` com queries de agregação separadas
- [ ] Criar `index.ts` (controller) com `requireFeature`
- [ ] Registrar controller em `src/index.ts`
- [ ] Adicionar feature no sistema de planos (se necessário)
- [ ] Criar testes E2E e de integração

**Performance:**
- [ ] Executar queries em paralelo (`Promise.all`)
- [ ] Verificar índices necessários no banco
- [ ] Limitar período máximo de consulta
- [ ] Considerar cache para dados estáveis

**Exportação:**
- [ ] Implementar exportador Excel
- [ ] Implementar exportador CSV
- [ ] Implementar exportador PDF (se necessário)
- [ ] Adicionar endpoint `/export/:format`
