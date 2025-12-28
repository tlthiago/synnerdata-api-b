# Relatório de Folha de Pagamento (FOLHA)

## Visão Geral

Relatório financeiro que apresenta a evolução da folha de pagamento da organização, incluindo análise por setor, gestor e funcionário, com detalhamento de salários e benefícios.

## Análise de Disponibilidade de Dados

### KPIs

| KPI | Campo/Cálculo Necessário | Status | Observação |
|-----|-------------------------|--------|------------|
| Total | `SUM(salary + mealAllowance + transportAllowance)` | ✅ Disponível | Soma total da folha |
| Salários | `SUM(employees.salary)` | ✅ Disponível | Total de salários |
| Alimentação | `SUM(employees.mealAllowance)` | ✅ Disponível | Total de VA/VR |
| Combustível | `SUM(employees.transportAllowance)` | ✅ Disponível | Total de VT |

### Tabela - Evolução Folha (Mensal)

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| Mês | Agrupamento por período | ✅ Disponível |
| Salár. | `SUM(employees.salary)` | ✅ Disponível |
| Alim. | `SUM(employees.mealAllowance)` | ✅ Disponível |
| Transp. | `SUM(employees.transportAllowance)` | ✅ Disponível |
| Total | Soma das colunas | ✅ Disponível |

### Tabela - Analítico por Setor

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| Setor | `sectors.name` | ✅ Disponível |
| Salár. | `SUM(employees.salary)` | ✅ Disponível |
| Alim. | `SUM(employees.mealAllowance)` | ✅ Disponível |
| Transp. | `SUM(employees.transportAllowance)` | ✅ Disponível |
| Total | Soma das colunas | ✅ Disponível |

### Gráficos

| Gráfico | Campos Necessários | Status |
|---------|-------------------|--------|
| % Categoria | salary, mealAllowance, transportAllowance | ✅ Disponível |
| % Gestor | `employees.manager`, valores agregados | ⚠️ Parcial |

### Rank Funcionários (Stacked Bar Chart)

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| Nome | `employees.name` | ✅ Disponível |
| Salário | `employees.salary` | ✅ Disponível |
| Transporte | `employees.transportAllowance` | ✅ Disponível |
| Alimentação | `employees.mealAllowance` | ✅ Disponível |
| Total | Soma | ✅ Disponível |

### Filtros

| Filtro | Campo Necessário | Status |
|--------|------------------|--------|
| Admissão (período) | `employees.hireDate` | ✅ Disponível |
| Setor | `sectors.name` | ✅ Disponível |
| Status | `employees.status` | ✅ Disponível |
| Funcionário | `employees.name` | ✅ Disponível |

### Resumo de Disponibilidade

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Disponível | 14 | 93% |
| ⚠️ Parcial | 1 | 7% |
| ❌ Ausente | 0 | 0% |

## Alterações de Schema Recomendadas

### 1. (Recomendado) Alterar `manager` para FK

```typescript
// src/db/schema/employees.ts
managerId: text("manager_id").references(() => employees.id),
```

### 2. (Opcional) Separar combustível de transporte

Se a organização diferencia vale-transporte de auxílio combustível:

```typescript
// src/db/schema/employees.ts
transportAllowance: decimal("transport_allowance", { precision: 10, scale: 2 }),
fuelAllowance: decimal("fuel_allowance", { precision: 10, scale: 2 }),
```

## Estrutura do Endpoint

### Rota

```
GET /api/v1/reports/payroll
```

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| startDate | string (ISO) | Sim | Data inicial do período |
| endDate | string (ISO) | Sim | Data final do período |
| sector | string | Não | Filtrar por setor |
| status | string | Não | Filtrar por status (ACTIVE, TERMINATED) |
| employeeId | string | Não | Filtrar por funcionário específico |

### Response Schema

```typescript
interface PayrollReportResponse {
  success: true;
  data: {
    kpis: {
      total: number;
      salaries: number;
      mealAllowance: number;
      transportAllowance: number;
      employeeCount: number;
    };
    evolution: Array<{
      month: string;          // "JAN/25"
      monthNumber: number;    // 1-12
      year: number;
      salary: number;
      mealAllowance: number;
      transportAllowance: number;
      total: number;
    }>;
    bySector: Array<{
      sectorId: string;
      sectorName: string;
      salary: number;
      mealAllowance: number;
      transportAllowance: number;
      total: number;
      employeeCount: number;
    }>;
    byManager: Array<{
      manager: string;
      total: number;
      percentage: number;
    }>;
    byCategory: {
      salary: { value: number; percentage: number };
      mealAllowance: { value: number; percentage: number };
      transportAllowance: { value: number; percentage: number };
    };
    employeeRanking: Array<{
      id: string;
      name: string;
      salary: number;
      mealAllowance: number;
      transportAllowance: number;
      total: number;
    }>;
    metadata: {
      period: {
        start: string;
        end: string;
      };
      generatedAt: string;
      totalRecords: number;
    };
  };
}
```

## Queries Necessárias

### 1. KPIs Totais

```typescript
const kpis = await db
  .select({
    total: sql<number>`SUM(
      COALESCE(${employees.salary}, 0) +
      COALESCE(${employees.mealAllowance}, 0) +
      COALESCE(${employees.transportAllowance}, 0)
    )`,
    salaries: sql<number>`SUM(COALESCE(${employees.salary}, 0))`,
    mealAllowance: sql<number>`SUM(COALESCE(${employees.mealAllowance}, 0))`,
    transportAllowance: sql<number>`SUM(COALESCE(${employees.transportAllowance}, 0))`,
    employeeCount: count(),
  })
  .from(employees)
  .where(
    and(
      eq(employees.organizationId, organizationId),
      eq(employees.status, 'ACTIVE'),
      lte(employees.hireDate, endDate),
      isNull(employees.deletedAt)
    )
  );
```

### 2. Evolução Mensal

```typescript
// Para evolução mensal, precisamos calcular o headcount e custos em cada mês
// Isso requer uma lógica mais complexa considerando admissões e demissões

const monthlyEvolution = await db
  .select({
    month: sql<number>`EXTRACT(MONTH FROM ${employees.hireDate})`,
    year: sql<number>`EXTRACT(YEAR FROM ${employees.hireDate})`,
    salary: sql<number>`SUM(COALESCE(${employees.salary}, 0))`,
    mealAllowance: sql<number>`SUM(COALESCE(${employees.mealAllowance}, 0))`,
    transportAllowance: sql<number>`SUM(COALESCE(${employees.transportAllowance}, 0))`,
  })
  .from(employees)
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(employees.hireDate, startDate),
      lte(employees.hireDate, endDate),
      isNull(employees.deletedAt)
    )
  )
  .groupBy(
    sql`EXTRACT(YEAR FROM ${employees.hireDate})`,
    sql`EXTRACT(MONTH FROM ${employees.hireDate})`
  )
  .orderBy(
    sql`EXTRACT(YEAR FROM ${employees.hireDate})`,
    sql`EXTRACT(MONTH FROM ${employees.hireDate})`
  );
```

### 3. Analítico por Setor

```typescript
const bySector = await db
  .select({
    sectorId: sectors.id,
    sectorName: sectors.name,
    salary: sql<number>`SUM(COALESCE(${employees.salary}, 0))`,
    mealAllowance: sql<number>`SUM(COALESCE(${employees.mealAllowance}, 0))`,
    transportAllowance: sql<number>`SUM(COALESCE(${employees.transportAllowance}, 0))`,
    total: sql<number>`SUM(
      COALESCE(${employees.salary}, 0) +
      COALESCE(${employees.mealAllowance}, 0) +
      COALESCE(${employees.transportAllowance}, 0)
    )`,
    employeeCount: count(),
  })
  .from(employees)
  .innerJoin(sectors, eq(employees.sectorId, sectors.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      eq(employees.status, 'ACTIVE'),
      isNull(employees.deletedAt)
    )
  )
  .groupBy(sectors.id, sectors.name)
  .orderBy(desc(sql`SUM(
    COALESCE(${employees.salary}, 0) +
    COALESCE(${employees.mealAllowance}, 0) +
    COALESCE(${employees.transportAllowance}, 0)
  )`));
```

### 4. Por Gestor

```typescript
const byManager = await db
  .select({
    manager: employees.manager,
    total: sql<number>`SUM(
      COALESCE(${employees.salary}, 0) +
      COALESCE(${employees.mealAllowance}, 0) +
      COALESCE(${employees.transportAllowance}, 0)
    )`,
  })
  .from(employees)
  .where(
    and(
      eq(employees.organizationId, organizationId),
      eq(employees.status, 'ACTIVE'),
      isNotNull(employees.manager),
      isNull(employees.deletedAt)
    )
  )
  .groupBy(employees.manager)
  .orderBy(desc(sql`SUM(
    COALESCE(${employees.salary}, 0) +
    COALESCE(${employees.mealAllowance}, 0) +
    COALESCE(${employees.transportAllowance}, 0)
  )`));
```

### 5. Ranking de Funcionários

```typescript
const employeeRanking = await db
  .select({
    id: employees.id,
    name: employees.name,
    salary: employees.salary,
    mealAllowance: employees.mealAllowance,
    transportAllowance: employees.transportAllowance,
    total: sql<number>`
      COALESCE(${employees.salary}, 0) +
      COALESCE(${employees.mealAllowance}, 0) +
      COALESCE(${employees.transportAllowance}, 0)
    `,
  })
  .from(employees)
  .where(
    and(
      eq(employees.organizationId, organizationId),
      eq(employees.status, 'ACTIVE'),
      isNull(employees.deletedAt)
    )
  )
  .orderBy(desc(sql`
    COALESCE(${employees.salary}, 0) +
    COALESCE(${employees.mealAllowance}, 0) +
    COALESCE(${employees.transportAllowance}, 0)
  `))
  .limit(10);
```

## Implementação

### Estrutura de Arquivos

```
src/modules/reports/payroll/
├── payroll-report.controller.ts
├── payroll-report.service.ts
├── payroll-report.model.ts
├── payroll-report.schemas.ts
└── payroll-report.test.ts
```

### Controller

```typescript
// src/modules/reports/payroll/payroll-report.controller.ts
import Elysia from "elysia";
import { authPlugin } from "@/modules/auth/auth.plugin";
import { payrollReportQuerySchema } from "./payroll-report.schemas";
import { getPayrollReport } from "./payroll-report.service";

export const payrollReportController = new Elysia({
  prefix: "/payroll",
  detail: { tags: ["Reports - Payroll"] },
})
  .use(authPlugin)
  .get(
    "/",
    async ({ query, organization }) => {
      const data = await getPayrollReport({
        organizationId: organization.id,
        ...query,
      });

      return { success: true, data };
    },
    {
      query: payrollReportQuerySchema,
      detail: {
        summary: "Get payroll report",
        description: "Returns payroll data with evolution, sector analysis, and employee ranking",
      },
      requireFeature: "reports:payroll",
    }
  );
```

### Schemas

```typescript
// src/modules/reports/payroll/payroll-report.schemas.ts
import { z } from "zod";

export const payrollReportQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sector: z.string().optional(),
  status: z.enum(['ACTIVE', 'TERMINATED']).optional(),
  employeeId: z.string().optional(),
});

export type PayrollReportQuery = z.infer<typeof payrollReportQuerySchema>;
```

## Considerações de Performance

1. **Índices Recomendados**:
   ```sql
   CREATE INDEX idx_employees_payroll ON employees(
     organization_id,
     status,
     sector_id,
     salary,
     meal_allowance,
     transport_allowance
   ) WHERE deleted_at IS NULL;
   ```

2. **Execução Paralela**: As queries por setor, por gestor e ranking podem ser executadas em paralelo com `Promise.all`.

3. **Cache**: Cache de 15-30 minutos é aceitável para relatórios de folha.

4. **Materialização**: Para organizações grandes, considerar view materializada para evolução mensal.

## Filtros Disponíveis

- **Período de Admissão**: Data inicial e final
- **Setor**: Filtrar por setor específico
- **Status**: Ativo ou Demitido
- **Funcionário**: Filtrar por funcionário específico (dropdown)

## Formato de Exportação

### PDF
- Layout paisagem
- KPIs em cards no topo
- Tabela de evolução mensal
- Gráficos de pizza lado a lado
- Tabela analítica por setor
- Gráfico de ranking (stacked bar)

### Excel
- Aba "Resumo": KPIs
- Aba "Evolução Mensal": Dados mensais completos
- Aba "Por Setor": Análise por setor
- Aba "Por Gestor": Análise por gestor
- Aba "Funcionários": Lista completa com valores

## Regras de Negócio

### 1. Cálculo de Evolução Mensal

A evolução mensal deve considerar:
- Funcionários ativos no mês de referência
- Admissões: entram no mês da admissão
- Demissões: saem no mês seguinte à demissão
- Valores proporcionais para admissões/demissões no meio do mês (opcional)

### 2. Valores Nulos

```typescript
// Sempre usar COALESCE para evitar NaN
COALESCE(salary, 0) + COALESCE(mealAllowance, 0) + COALESCE(transportAllowance, 0)
```

### 3. Percentuais

```typescript
// Calcular percentual de cada categoria
const total = salary + mealAllowance + transportAllowance;
const percentages = {
  salary: (salary / total) * 100,
  mealAllowance: (mealAllowance / total) * 100,
  transportAllowance: (transportAllowance / total) * 100,
};
```

## Observações

1. **Nomenclatura**: O Power BI usa "Combustível" para o campo `transportAllowance`. Verificar com cliente se são o mesmo benefício ou se precisam ser separados.

2. **Valores Sensíveis**: Este relatório contém dados salariais. Considerar permissões específicas:
   - `reports:payroll:view` - Ver totais agregados
   - `reports:payroll:details` - Ver valores individuais

3. **Moeda**: Todos os valores devem ser formatados em Real (R$) com 2 casas decimais.

4. **Funcionários Demitidos**: O filtro "DEMITIDO" permite análise histórica de custos com ex-funcionários.
