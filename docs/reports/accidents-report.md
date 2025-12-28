# Relatório de Acidentes (ACIDENTES)

## Visão Geral

Relatório que apresenta dados sobre acidentes de trabalho, permitindo análise por gestor, setor e motivo, além de rastreamento individual de funcionários com histórico de acidentes.

## Análise de Disponibilidade de Dados

### KPIs

| KPI | Campo Necessário | Status | Observação |
|-----|------------------|--------|------------|
| Acidentes | `COUNT(accidents.id)` | ✅ Disponível | Contagem simples |
| Dias sem Acidentes | `MAX(accidents.date)` | ✅ Disponível | Cálculo: `hoje - última data de acidente` |

### Gráficos

| Gráfico | Campos Necessários | Status | Observação |
|---------|-------------------|--------|------------|
| Dias de Acidentes por Gestor | `employees.manager`, `accidents.date` | ⚠️ Parcial | `manager` é texto, deveria ser FK |
| Motivos - Dias de Acidentes | `accidents.nature` | ✅ Disponível | Agrupamento por natureza |
| Acidentes por Setor | `employees.sector`, `accidents.*` | ✅ Disponível | Join com employees |

### Tabelas

#### Tabela Rank

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| COD | `employees.code` | ✅ Disponível |
| Funcionários | `employees.name` | ✅ Disponível |
| Acid. | `COUNT(accidents.id)` | ✅ Disponível |

#### Tabela Análise por Funcionários

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| Foto | `employees.photoUrl` | ❌ Ausente |
| ID | `employees.code` | ✅ Disponível |
| Funcionários | `employees.name` | ✅ Disponível |
| Data | `accidents.date` | ✅ Disponível |
| Motivo | `accidents.nature` | ✅ Disponível |
| Descrição | `accidents.description` | ✅ Disponível |
| Acid. | Contador sequencial | ✅ Disponível |
| CAT | `accidents.cat` | ✅ Disponível |

### Resumo de Disponibilidade

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Disponível | 10 | 77% |
| ⚠️ Parcial | 1 | 8% |
| ❌ Ausente | 2 | 15% |

## Alterações de Schema Necessárias

### 1. Adicionar campo `photoUrl` em employees

```typescript
// src/db/schema/employees.ts
photoUrl: text("photo_url"),
```

### 2. (Opcional) Adicionar enum para categorização de natureza

```typescript
// src/db/schema/accidents.ts
export const accidentNatureEnum = pgEnum("accident_nature", [
  "TYPICAL",           // Acidente típico
  "COMMUTE",           // Acidente de trajeto
  "OCCUPATIONAL",      // Doença ocupacional
  "OTHER",             // Outro
]);

// Adicionar campo
natureCategory: accidentNatureEnum("nature_category"),
```

### 3. (Recomendado) Alterar `manager` para FK

```typescript
// src/db/schema/employees.ts
managerId: text("manager_id").references(() => employees.id),
```

## Estrutura do Endpoint

### Rota

```
GET /api/v1/reports/accidents
```

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| startDate | string (ISO) | Sim | Data inicial do período |
| endDate | string (ISO) | Sim | Data final do período |
| sector | string | Não | Filtrar por setor |
| manager | string | Não | Filtrar por gestor |

### Response Schema

```typescript
interface AccidentsReportResponse {
  success: true;
  data: {
    kpis: {
      totalAccidents: number;
      daysSinceLastAccident: number;
      lastAccidentDate: string | null;
    };
    charts: {
      accidentsByManager: Array<{
        manager: string;
        count: number;
        days: number;
      }>;
      accidentsByNature: Array<{
        nature: string;
        count: number;
        days: number;
      }>;
      accidentsBySector: Array<{
        sector: string;
        count: number;
      }>;
    };
    tables: {
      ranking: Array<{
        code: string;
        name: string;
        accidentCount: number;
      }>;
      details: Array<{
        photoUrl: string | null;
        code: string;
        name: string;
        date: string;
        nature: string;
        description: string;
        sequenceNumber: number;
        cat: string | null;
      }>;
    };
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

### 1. KPIs

```typescript
// Total de acidentes no período
const totalAccidents = await db
  .select({ count: count() })
  .from(accidents)
  .innerJoin(employees, eq(accidents.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(accidents.date, startDate),
      lte(accidents.date, endDate),
      isNull(accidents.deletedAt)
    )
  );

// Dias desde último acidente
const lastAccident = await db
  .select({ date: max(accidents.date) })
  .from(accidents)
  .innerJoin(employees, eq(accidents.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      isNull(accidents.deletedAt)
    )
  );
```

### 2. Acidentes por Gestor

```typescript
const accidentsByManager = await db
  .select({
    manager: employees.manager,
    count: count(),
  })
  .from(accidents)
  .innerJoin(employees, eq(accidents.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(accidents.date, startDate),
      lte(accidents.date, endDate),
      isNull(accidents.deletedAt)
    )
  )
  .groupBy(employees.manager)
  .orderBy(desc(count()));
```

### 3. Acidentes por Natureza

```typescript
const accidentsByNature = await db
  .select({
    nature: accidents.nature,
    count: count(),
  })
  .from(accidents)
  .innerJoin(employees, eq(accidents.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(accidents.date, startDate),
      lte(accidents.date, endDate),
      isNull(accidents.deletedAt)
    )
  )
  .groupBy(accidents.nature)
  .orderBy(desc(count()));
```

### 4. Acidentes por Setor

```typescript
const accidentsBySector = await db
  .select({
    sector: employees.sector,
    count: count(),
  })
  .from(accidents)
  .innerJoin(employees, eq(accidents.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(accidents.date, startDate),
      lte(accidents.date, endDate),
      isNull(accidents.deletedAt)
    )
  )
  .groupBy(employees.sector)
  .orderBy(desc(count()));
```

### 5. Ranking de Funcionários

```typescript
const ranking = await db
  .select({
    code: employees.code,
    name: employees.name,
    accidentCount: count(),
  })
  .from(accidents)
  .innerJoin(employees, eq(accidents.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(accidents.date, startDate),
      lte(accidents.date, endDate),
      isNull(accidents.deletedAt)
    )
  )
  .groupBy(employees.id, employees.code, employees.name)
  .orderBy(desc(count()))
  .limit(10);
```

### 6. Detalhes dos Acidentes

```typescript
const details = await db
  .select({
    photoUrl: employees.photoUrl,
    code: employees.code,
    name: employees.name,
    date: accidents.date,
    nature: accidents.nature,
    description: accidents.description,
    cat: accidents.cat,
  })
  .from(accidents)
  .innerJoin(employees, eq(accidents.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(accidents.date, startDate),
      lte(accidents.date, endDate),
      isNull(accidents.deletedAt)
    )
  )
  .orderBy(desc(accidents.date));
```

## Implementação

### Estrutura de Arquivos

```
src/modules/reports/accidents/
├── accidents-report.controller.ts
├── accidents-report.service.ts
├── accidents-report.model.ts
├── accidents-report.schemas.ts
└── accidents-report.test.ts
```

### Controller

```typescript
// src/modules/reports/accidents/accidents-report.controller.ts
import Elysia from "elysia";
import { authPlugin } from "@/modules/auth/auth.plugin";
import { accidentsReportQuerySchema } from "./accidents-report.schemas";
import { getAccidentsReport } from "./accidents-report.service";

export const accidentsReportController = new Elysia({
  prefix: "/accidents",
  detail: { tags: ["Reports - Accidents"] },
})
  .use(authPlugin)
  .get(
    "/",
    async ({ query, organization }) => {
      const data = await getAccidentsReport({
        organizationId: organization.id,
        ...query,
      });

      return { success: true, data };
    },
    {
      query: accidentsReportQuerySchema,
      detail: {
        summary: "Get accidents report",
        description: "Returns accidents report data for the specified period",
      },
      requireFeature: "reports:accidents",
    }
  );
```

### Schemas

```typescript
// src/modules/reports/accidents/accidents-report.schemas.ts
import { z } from "zod";

export const accidentsReportQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sector: z.string().optional(),
  manager: z.string().optional(),
});

export type AccidentsReportQuery = z.infer<typeof accidentsReportQuerySchema>;
```

## Considerações de Performance

1. **Índices Recomendados**:
   ```sql
   CREATE INDEX idx_accidents_date ON accidents(date);
   CREATE INDEX idx_accidents_employee_id ON accidents(employee_id);
   CREATE INDEX idx_accidents_org_date ON accidents(organization_id, date)
     WHERE deleted_at IS NULL;
   ```

2. **Execução Paralela**: Todas as queries de gráficos e tabelas podem ser executadas em paralelo com `Promise.all`.

3. **Cache**: Considerar cache de 5-15 minutos para relatórios com mesmo período.

## Filtros Disponíveis

- **Período**: Obrigatório (startDate, endDate)
- **Setor**: Opcional
- **Gestor**: Opcional
- **Funcionário**: Opcional (para drill-down)

## Formato de Exportação

### PDF
- Layout paisagem
- KPIs em cards no topo
- Gráficos em grid 2x2
- Tabela de detalhes paginada

### Excel
- Aba "Resumo": KPIs
- Aba "Por Gestor": Dados do gráfico
- Aba "Por Natureza": Dados do gráfico
- Aba "Por Setor": Dados do gráfico
- Aba "Ranking": Tabela de ranking
- Aba "Detalhes": Lista completa de acidentes

## Observações

1. **CAT (Comunicação de Acidente de Trabalho)**: Campo opcional que indica se foi emitida CAT para o acidente.

2. **Dias sem Acidentes**: KPI importante para cultura de segurança, calculado como diferença entre hoje e a data do último acidente registrado.

3. **Natureza vs Categoria**: O campo `nature` é texto livre. Recomenda-se adicionar `natureCategory` como enum para padronizar agrupamentos.

4. **Medidas Tomadas**: Campo `measuresTaken` disponível no schema mas não exibido no relatório Power BI. Pode ser incluído na versão web para maior detalhamento.
