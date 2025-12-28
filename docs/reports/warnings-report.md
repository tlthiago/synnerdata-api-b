# Relatório de Advertências (ADVERTÊNCIAS)

## Visão Geral

Relatório que apresenta as advertências aplicadas aos funcionários da organização, permitindo análise por gestor, motivo, setor e funcionário, com histórico detalhado de ocorrências.

## Análise de Disponibilidade de Dados

### KPIs

| KPI | Campo/Cálculo Necessário | Status | Observação |
|-----|-------------------------|--------|------------|
| Advertências | `COUNT(warnings.id)` | ✅ Disponível | Total de advertências |
| Func. c/ Advertência | `COUNT(DISTINCT employeeId)` | ✅ Disponível | Funcionários únicos |

### Galeria de Fotos

| Componente | Campo Necessário | Status |
|------------|------------------|--------|
| Foto funcionário | `employees.photoUrl` | ❌ Ausente |

### Gráficos

| Gráfico | Campos Necessários | Status | Observação |
|---------|-------------------|--------|------------|
| Advertências por Gestor | `employees.manager`, `COUNT` | ⚠️ Parcial | `manager` é texto |
| Motivos - Advertências | `warnings.reason`, `COUNT` | ✅ Disponível | Agrupamento por motivo |
| Advertências por Função | `sectors.name`, `warnings.date` | ✅ Disponível | Stacked bar por mês |

### Tabela Rank

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| COD | `employees.code` | ❌ Ausente |
| Funcionário | `employees.name` | ✅ Disponível |
| Adv. | `COUNT(warnings.id)` | ✅ Disponível |

### Tabela Análise por Funcionários

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| CÓD | `employees.code` | ❌ Ausente |
| Funcionário | `employees.name` | ✅ Disponível |
| Data | `warnings.date` | ✅ Disponível |
| Motivo | `warnings.reason` | ✅ Disponível |
| Advertências | Contador sequencial | ✅ Disponível |

### Filtros

| Filtro | Campo Necessário | Status |
|--------|------------------|--------|
| Período | `warnings.date` | ✅ Disponível |
| Setor | `sectors.name` | ✅ Disponível |
| Status | `employees.status` | ✅ Disponível |
| Funcionário | `employees.name` | ✅ Disponível |

### Resumo de Disponibilidade

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Disponível | 10 | 71% |
| ⚠️ Parcial | 1 | 7% |
| ❌ Ausente | 3 | 21% |

## Alterações de Schema Necessárias

### 1. Adicionar campo `code` em employees (CRÍTICO)

```typescript
// src/db/schema/employees.ts
code: text("code").notNull(), // Matrícula do funcionário
```

### 2. Adicionar campo `photoUrl` em employees

```typescript
// src/db/schema/employees.ts
photoUrl: text("photo_url"),
```

### 3. (Recomendado) Alterar `manager` para FK

```typescript
// src/db/schema/employees.ts
managerId: text("manager_id").references(() => employees.id),
```

### 4. (Opcional) Adicionar enum para motivos padronizados

```typescript
// src/db/schema/warnings.ts
export const warningReasonEnum = pgEnum("warning_reason", [
  "INDISCIPLINA",
  "ATRASO",
  "FALTA_INJUSTIFICADA",
  "INSUBORDINACAO",
  "MAU_COMPORTAMENTO",
  "NEGLIGENCIA",
  "OTHER",
]);

// Adicionar campo
reasonCategory: warningReasonEnum("reason_category"),
```

## Estrutura do Endpoint

### Rota

```
GET /api/v1/reports/warnings
```

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| startDate | string (ISO) | Sim | Data inicial do período |
| endDate | string (ISO) | Sim | Data final do período |
| sector | string | Não | Filtrar por setor |
| manager | string | Não | Filtrar por gestor |
| status | string | Não | Filtrar por status do funcionário |
| employeeId | string | Não | Filtrar por funcionário específico |

### Response Schema

```typescript
interface WarningsReportResponse {
  success: true;
  data: {
    kpis: {
      totalWarnings: number;
      employeesWithWarnings: number;
    };
    charts: {
      byManager: Array<{
        manager: string;
        count: number;
        percentage: number;
      }>;
      byReason: Array<{
        reason: string;
        count: number;
        percentage: number;
      }>;
      bySectorMonthly: Array<{
        month: string;
        sectors: Array<{
          sectorName: string;
          count: number;
        }>;
        total: number;
      }>;
    };
    tables: {
      ranking: Array<{
        code: string;
        name: string;
        warningCount: number;
      }>;
      details: Array<{
        code: string;
        name: string;
        photoUrl: string | null;
        date: string;
        reason: string;
        type: 'verbal' | 'written' | 'suspension';
        sequenceNumber: number;
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
const kpis = await db
  .select({
    totalWarnings: count(),
    employeesWithWarnings: countDistinct(warnings.employeeId),
  })
  .from(warnings)
  .innerJoin(employees, eq(warnings.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(warnings.date, startDate),
      lte(warnings.date, endDate),
      isNull(warnings.deletedAt)
    )
  );
```

### 2. Advertências por Gestor

```typescript
const byManager = await db
  .select({
    manager: employees.manager,
    count: count(),
  })
  .from(warnings)
  .innerJoin(employees, eq(warnings.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(warnings.date, startDate),
      lte(warnings.date, endDate),
      isNull(warnings.deletedAt)
    )
  )
  .groupBy(employees.manager)
  .orderBy(desc(count()));
```

### 3. Advertências por Motivo

```typescript
const byReason = await db
  .select({
    reason: warnings.reason,
    count: count(),
  })
  .from(warnings)
  .innerJoin(employees, eq(warnings.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(warnings.date, startDate),
      lte(warnings.date, endDate),
      isNull(warnings.deletedAt)
    )
  )
  .groupBy(warnings.reason)
  .orderBy(desc(count()));
```

### 4. Advertências por Setor/Mês

```typescript
const bySectorMonthly = await db
  .select({
    month: sql<string>`TO_CHAR(${warnings.date}, 'MON/YY')`,
    monthOrder: sql<string>`TO_CHAR(${warnings.date}, 'YYYY-MM')`,
    sectorName: sectors.name,
    count: count(),
  })
  .from(warnings)
  .innerJoin(employees, eq(warnings.employeeId, employees.id))
  .innerJoin(sectors, eq(employees.sectorId, sectors.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(warnings.date, startDate),
      lte(warnings.date, endDate),
      isNull(warnings.deletedAt)
    )
  )
  .groupBy(
    sql`TO_CHAR(${warnings.date}, 'MON/YY')`,
    sql`TO_CHAR(${warnings.date}, 'YYYY-MM')`,
    sectors.name
  )
  .orderBy(sql`TO_CHAR(${warnings.date}, 'YYYY-MM')`);
```

### 5. Ranking de Funcionários

```typescript
const ranking = await db
  .select({
    code: employees.code,
    name: employees.name,
    warningCount: count(),
  })
  .from(warnings)
  .innerJoin(employees, eq(warnings.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(warnings.date, startDate),
      lte(warnings.date, endDate),
      isNull(warnings.deletedAt)
    )
  )
  .groupBy(employees.id, employees.code, employees.name)
  .orderBy(desc(count()))
  .limit(10);
```

### 6. Detalhes das Advertências

```typescript
const details = await db
  .select({
    code: employees.code,
    name: employees.name,
    photoUrl: employees.photoUrl,
    date: warnings.date,
    reason: warnings.reason,
    type: warnings.type,
  })
  .from(warnings)
  .innerJoin(employees, eq(warnings.employeeId, employees.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      gte(warnings.date, startDate),
      lte(warnings.date, endDate),
      isNull(warnings.deletedAt)
    )
  )
  .orderBy(desc(warnings.date));
```

## Implementação

### Estrutura de Arquivos

```
src/modules/reports/warnings/
├── warnings-report.controller.ts
├── warnings-report.service.ts
├── warnings-report.model.ts
├── warnings-report.schemas.ts
└── warnings-report.test.ts
```

### Controller

```typescript
// src/modules/reports/warnings/warnings-report.controller.ts
import Elysia from "elysia";
import { authPlugin } from "@/modules/auth/auth.plugin";
import { warningsReportQuerySchema } from "./warnings-report.schemas";
import { getWarningsReport } from "./warnings-report.service";

export const warningsReportController = new Elysia({
  prefix: "/warnings",
  detail: { tags: ["Reports - Warnings"] },
})
  .use(authPlugin)
  .get(
    "/",
    async ({ query, organization }) => {
      const data = await getWarningsReport({
        organizationId: organization.id,
        ...query,
      });

      return { success: true, data };
    },
    {
      query: warningsReportQuerySchema,
      detail: {
        summary: "Get warnings report",
        description: "Returns employee warnings data with analysis by manager, reason, and sector",
      },
      requireFeature: "reports:warnings",
    }
  );
```

### Schemas

```typescript
// src/modules/reports/warnings/warnings-report.schemas.ts
import { z } from "zod";

export const warningsReportQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sector: z.string().optional(),
  manager: z.string().optional(),
  status: z.enum(['ACTIVE', 'TERMINATED']).optional(),
  employeeId: z.string().optional(),
});

export type WarningsReportQuery = z.infer<typeof warningsReportQuerySchema>;
```

## Considerações de Performance

1. **Índices Recomendados**:
   ```sql
   CREATE INDEX idx_warnings_date ON warnings(date);
   CREATE INDEX idx_warnings_org_date ON warnings(organization_id, date)
     WHERE deleted_at IS NULL;
   CREATE INDEX idx_warnings_employee_date ON warnings(employee_id, date)
     WHERE deleted_at IS NULL;
   ```

2. **Execução Paralela**: As queries de gráficos e tabelas podem ser executadas em paralelo com `Promise.all`.

3. **Cache**: Cache de 10-15 minutos é aceitável para este relatório.

## Filtros Disponíveis

- **Período**: Data inicial e final das advertências
- **Setor**: Filtrar por setor específico
- **Status**: Ativo ou Demitido
- **Funcionário**: Dropdown para selecionar funcionário específico

## Formato de Exportação

### PDF
- Layout paisagem
- KPIs em cards no topo
- Galeria de fotos dos funcionários com advertências
- Gráficos de barras lado a lado
- Tabela de ranking
- Tabela de detalhes paginada

### Excel
- Aba "Resumo": KPIs
- Aba "Por Gestor": Dados do gráfico
- Aba "Por Motivo": Dados do gráfico
- Aba "Por Setor": Dados mensais por setor
- Aba "Ranking": Top funcionários
- Aba "Detalhes": Lista completa de advertências

## Campos Adicionais do Schema

O schema de `warnings` possui campos úteis não exibidos no Power BI:

| Campo | Descrição | Uso Sugerido |
|-------|-----------|--------------|
| `type` | verbal, written, suspension | Adicionar filtro/coluna |
| `description` | Descrição detalhada | Exibir em modal de detalhes |
| `witnessName` | Nome da testemunha | Documentação legal |
| `acknowledged` | Se foi reconhecida | Indicador visual |
| `acknowledgedAt` | Data do reconhecimento | Auditoria |

## Observações

1. **Tipos de Advertência**: O schema tem enum `warningTypeEnum` (verbal, written, suspension) que pode ser usado para filtros adicionais e análise por gravidade.

2. **Motivos Padronizados**: O campo `reason` é texto livre. Considerar adicionar `reasonCategory` como enum para melhor agrupamento.

3. **Progressão Disciplinar**: Útil adicionar relatório de progressão (verbal → escrita → suspensão) por funcionário.

4. **Reconhecimento**: O campo `acknowledged` pode ser usado para alertas de advertências não assinadas.

5. **Testemunha**: Campo `witnessName` importante para documentação legal trabalhista.
