# Absences Report - Plano de Implementação

> **Relatório**: Relatório de Faltas
> **Referência**: Relatório Power BI "FALTAS"
> **Status**: Planejado
> **Pré-requisitos**: Alterações no schema (ver seção "Alterações Necessárias")

## Visão Geral

Relatório analítico focado em ausências/faltas de funcionários, permitindo análise de frequência, motivos, impacto por gestor/função e controle de benefícios condicionais (cesta básica).

### Objetivo

Fornecer insights sobre:
- Volume total de dias de faltas e funcionários faltantes
- Motivos mais frequentes de ausência
- Distribuição de faltas por gestor e função
- Ranking de funcionários com mais faltas
- Controle de benefícios condicionais (direito a cesta básica)
- Análise detalhada por funcionário e período

---

## Mapeamento: Power BI → API

### KPIs (Cards do Topo)

| Power BI | Campo API | Fonte de Dados | Status |
|----------|-----------|----------------|--------|
| Dias de Faltas | `kpis.totalAbsenceDays` | `SUM(endDate - startDate + 1)` | ✅ Disponível |
| Func. Faltantes | `kpis.employeesWithAbsences` | `COUNT DISTINCT(employeeId)` | ✅ Disponível |
| Qtd Cestas | `kpis.basketAllowanceCount` | `COUNT WHERE hasBasketAllowance = true` | ❌ Campo não existe |

### Galeria e Filtros

| Power BI | Campo API | Fonte | Status |
|----------|-----------|-------|--------|
| Fotos funcionários | `employees[].photoUrl` | `employees.photoUrl` | ❌ Campo não existe |
| Filtro funcionários | `employeeFilter` | Lista de employees com absences | ✅ Disponível |

### Gráficos

| Power BI | Campo API | Tipo | Fonte | Status |
|----------|-----------|------|-------|--------|
| Faltas por Gestor | `byManager` | Barra Horizontal | `employees.manager` | ⚠️ Texto, não FK |
| Motivos - Dias de Faltas | `byReasonCategory` | Barra Horizontal | `absences.reasonCategory` | ❌ Campo não existe |
| Faltas por Função (por mês) | `byPositionAndMonth` | Barra Empilhada | `jobPositions` + `absences.startDate` | ✅ Disponível |

### Tabelas

| Power BI | Campo API | Fonte | Status |
|----------|-----------|-------|--------|
| Rank | `ranking` | `employees` + `COUNT(absences)` | ✅ Disponível |
| Direito a Cestas | `basketAllowanceList` | `employees.hasBasketAllowance` | ❌ Campo não existe |
| Análise por Funcionários | `absenceDetails` | `absences` + `employees` | ⚠️ Parcial |

---

## Status dos Dados

### Resumo de Disponibilidade

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Disponível | 7 campos | ~54% |
| ⚠️ Parcial | 3 campos | ~23% |
| ❌ Faltando | 3 campos | ~23% |

### Dados Disponíveis

- Total de dias de faltas (calculável)
- Contagem de funcionários faltantes
- Dados do funcionário (nome, cargo, setor, gestor)
- Datas das faltas (início e fim)
- Distribuição por função e mês
- Ranking de faltantes

### Dados Parcialmente Disponíveis

1. **Motivo da falta** (`absences.reason`)
   - Existe como texto livre
   - Power BI usa categorias estruturadas (Problemas pessoais, Saúde, Atraso, etc.)

2. **Tipo da falta** (`absences.type`)
   - Existe como texto livre
   - Deveria ser enum: JUSTIFIED / UNJUSTIFIED

3. **Gestor** (`employees.manager`)
   - Existe como texto
   - Ideal seria FK para `employees`

### Dados Faltantes

1. **Foto do funcionário** (`employees.photoUrl`)
   - Necessário para galeria visual

2. **Direito a cesta básica** (`employees.hasBasketAllowance`)
   - Benefício condicional baseado em faltas

3. **Categoria do motivo** (`absences.reasonCategory`)
   - Enum estruturado para análise de motivos

---

## Alterações Necessárias no Schema

### 1. Adicionar campos em `employees`

**Arquivo:** `src/db/schema/employees.ts`

```typescript
// Adicionar após os campos existentes
photoUrl: text("photo_url"),
hasBasketAllowance: boolean("has_basket_allowance").default(false).notNull(),
```

**Impacto:** Baixo - campos opcionais/com default, não quebra API existente

### 2. Melhorar tipagem em `absences`

**Arquivo:** `src/db/schema/absences.ts`

```typescript
// Novos enums
export const absenceTypeEnum = pgEnum("absence_type", [
  "JUSTIFIED",      // Justificada
  "UNJUSTIFIED",    // Injustificada
]);

export const absenceReasonCategoryEnum = pgEnum("absence_reason_category", [
  "PERSONAL_ISSUES",    // Problemas pessoais
  "HEALTH",             // Saúde (dor, doença geral)
  "MEDICAL_PROCEDURE",  // Procedimento médico (extração, cirurgia)
  "LATE_ARRIVAL",       // Atraso
  "FAMILY_EMERGENCY",   // Emergência familiar
  "TRANSPORT_ISSUES",   // Problemas de transporte
  "WEATHER",            // Condições climáticas
  "UNJUSTIFIED",        // Falta injustificada
  "OTHER",              // Outro
]);

// Alterar/adicionar campos na tabela absences
type: absenceTypeEnum("type").notNull(),  // Alterar de text para enum
reasonCategory: absenceReasonCategoryEnum("reason_category"),  // Novo campo
reason: text("reason"),  // Manter para detalhes adicionais
```

**Impacto:** Médio - `type` precisa de migração de dados (text → enum)

### Migração de Dados para `type`

```sql
-- Migração do campo type de text para enum
-- 1. Criar enum
CREATE TYPE absence_type AS ENUM ('JUSTIFIED', 'UNJUSTIFIED');

-- 2. Adicionar coluna temporária
ALTER TABLE absences ADD COLUMN type_new absence_type;

-- 3. Migrar dados (ajustar conforme valores existentes)
UPDATE absences SET type_new =
  CASE
    WHEN LOWER(type) IN ('justified', 'justificada', 'j') THEN 'JUSTIFIED'::absence_type
    ELSE 'UNJUSTIFIED'::absence_type
  END;

-- 4. Remover coluna antiga e renomear
ALTER TABLE absences DROP COLUMN type;
ALTER TABLE absences RENAME COLUMN type_new TO type;
ALTER TABLE absences ALTER COLUMN type SET NOT NULL;
```

---

## Estrutura de Arquivos

```text
src/modules/reports/
├── absences/
│   ├── index.ts                      # Controller
│   ├── absences-report.model.ts      # Schemas Zod
│   ├── absences-report.service.ts    # Orquestração
│   └── queries/
│       ├── kpis.query.ts             # KPIs principais
│       ├── by-manager.query.ts       # Faltas por gestor
│       ├── by-reason.query.ts        # Por motivo/categoria
│       ├── by-position-month.query.ts # Por função e mês
│       ├── ranking.query.ts          # Ranking de faltantes
│       ├── basket-allowance.query.ts # Direito a cestas
│       └── absence-details.query.ts  # Tabela analítica
```

---

## Endpoint

```
GET /v1/reports/absences
```

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `startDate` | date | Não | Data inicial do período |
| `endDate` | date | Não | Data final do período |
| `sectorIds` | string[] | Não | Filtrar por setores |
| `branchIds` | string[] | Não | Filtrar por filiais |
| `employeeIds` | string[] | Não | Filtrar por funcionários específicos |
| `status` | string | Não | Status do funcionário (ACTIVE, TERMINATED, ALL) |
| `types` | string[] | Não | Tipos de falta (JUSTIFIED, UNJUSTIFIED) |

### Response Schema

```typescript
{
  success: true,
  data: {
    filters: {
      period: { start: Date, end: Date },
      sectors: string[],
      branches: string[],
      employeeIds: string[],
      status: string,
      types: string[]
    },

    kpis: {
      totalAbsenceDays: number,
      employeesWithAbsences: number,
      basketAllowanceCount: number,
      justifiedCount: number,
      unjustifiedCount: number
    },

    byManager: [
      {
        manager: "Carla Augusta",
        absenceDays: 6,
        percentage: 42.86
      }
    ],

    byReasonCategory: [
      {
        category: "PERSONAL_ISSUES",
        label: "Problemas pessoais",
        absenceDays: 7,
        percentage: 50
      }
    ],

    byPositionAndMonth: [
      {
        month: "2025-02",
        positions: [
          { position: "Adm. de Obras", absenceDays: 1 },
          { position: "Aux. de DP", absenceDays: 0 }
        ],
        total: 1
      }
    ],

    ranking: [
      {
        id: "emp-123",
        name: "John Brock Mendes",
        absenceDays: 4,
        absenceCount: 2
      }
    ],

    basketAllowanceList: [
      {
        id: "emp-123",
        name: "John Brock Mendes",
        hasBasketAllowance: false,
        absenceDays: 4
      }
    ],

    absenceDetails: [
      {
        id: "abs-123",
        employeeId: "emp-123",
        employeeName: "John Brock Mendes",
        employeePhoto: "https://...",
        date: "2025-07-16",
        startDate: "2025-07-16",
        endDate: "2025-07-16",
        days: 1,
        type: "UNJUSTIFIED",
        typeLabel: "Injustificada",
        reasonCategory: "LATE_ARRIVAL",
        reasonCategoryLabel: "Atraso",
        reason: "Atraso devido ao trânsito"
      }
    ],

    employees: [
      {
        id: "emp-123",
        name: "John Brock Mendes",
        photoUrl: "https://...",
        position: "Adm. de Obras",
        manager: "Carlos Maia",
        totalAbsenceDays: 4,
        hasBasketAllowance: false
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
import { and, count, countDistinct, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

interface AbsencesKpis {
  totalAbsenceDays: number;
  employeesWithAbsences: number;
  basketAllowanceCount: number;
  justifiedCount: number;
  unjustifiedCount: number;
}

export abstract class KpisQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<AbsencesKpis> {
    const { startDate, endDate, sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    // Total de dias de faltas e funcionários distintos
    const [absenceStats] = await db
      .select({
        totalDays: sql<number>`COALESCE(SUM(
          ${schema.absences.endDate}::date - ${schema.absences.startDate}::date + 1
        ), 0)`,
        employeeCount: countDistinct(schema.absences.employeeId),
        justifiedCount: sql<number>`COUNT(*) FILTER (WHERE ${schema.absences.type} = 'JUSTIFIED')`,
        unjustifiedCount: sql<number>`COUNT(*) FILTER (WHERE ${schema.absences.type} = 'UNJUSTIFIED')`,
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
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      );

    // Contagem de funcionários com direito a cesta básica
    const [basketStats] = await db
      .select({ count: count() })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          eq(schema.employees.hasBasketAllowance, true),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      );

    return {
      totalAbsenceDays: absenceStats?.totalDays ?? 0,
      employeesWithAbsences: absenceStats?.employeeCount ?? 0,
      basketAllowanceCount: basketStats?.count ?? 0,
      justifiedCount: absenceStats?.justifiedCount ?? 0,
      unjustifiedCount: absenceStats?.unjustifiedCount ?? 0,
    };
  }
}
```

### By Manager Query

```typescript
// queries/by-manager.query.ts
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

interface ByManagerItem {
  manager: string;
  absenceDays: number;
  percentage: number;
}

export abstract class ByManagerQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<ByManagerItem[]> {
    const { startDate, endDate, sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    const results = await db
      .select({
        manager: sql<string>`COALESCE(${schema.employees.manager}, 'Sem gestor')`,
        absenceDays: sql<number>`SUM(
          ${schema.absences.endDate}::date - ${schema.absences.startDate}::date + 1
        )`,
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
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(schema.employees.manager)
      .orderBy(sql`2 DESC`);

    const total = results.reduce((sum, r) => sum + r.absenceDays, 0);

    return results.map(r => ({
      manager: r.manager,
      absenceDays: r.absenceDays,
      percentage: total > 0
        ? Math.round((r.absenceDays / total) * 10000) / 100
        : 0,
    }));
  }
}
```

### By Reason Category Query

```typescript
// queries/by-reason.query.ts
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

const REASON_CATEGORY_LABELS: Record<string, string> = {
  PERSONAL_ISSUES: "Problemas pessoais",
  HEALTH: "Saúde",
  MEDICAL_PROCEDURE: "Procedimento médico",
  LATE_ARRIVAL: "Atraso",
  FAMILY_EMERGENCY: "Emergência familiar",
  TRANSPORT_ISSUES: "Problemas de transporte",
  WEATHER: "Condições climáticas",
  UNJUSTIFIED: "Falta injustificada",
  OTHER: "Outro",
};

interface ByReasonItem {
  category: string;
  label: string;
  absenceDays: number;
  percentage: number;
}

export abstract class ByReasonQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<ByReasonItem[]> {
    const { startDate, endDate, sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    const results = await db
      .select({
        category: sql<string>`COALESCE(${schema.absences.reasonCategory}, 'OTHER')`,
        absenceDays: sql<number>`SUM(
          ${schema.absences.endDate}::date - ${schema.absences.startDate}::date + 1
        )`,
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
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(schema.absences.reasonCategory)
      .orderBy(sql`2 DESC`);

    const total = results.reduce((sum, r) => sum + r.absenceDays, 0);

    return results.map(r => ({
      category: r.category,
      label: REASON_CATEGORY_LABELS[r.category] ?? r.category,
      absenceDays: r.absenceDays,
      percentage: total > 0
        ? Math.round((r.absenceDays / total) * 10000) / 100
        : 0,
    }));
  }
}
```

### By Position and Month Query

```typescript
// queries/by-position-month.query.ts
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { generateMonthRange } from "../../shared/date-utils";
import type { NormalizedFilters } from "../../shared/filters.model";

interface PositionData {
  position: string;
  absenceDays: number;
}

interface ByPositionMonthItem {
  month: string;
  positions: PositionData[];
  total: number;
}

export abstract class ByPositionMonthQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<ByPositionMonthItem[]> {
    const { startDate, endDate, sectorIds, status } = filters;
    const months = generateMonthRange(startDate, endDate);

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    // Buscar todas as posições da organização
    const positions = await db
      .select({ id: schema.jobPositions.id, name: schema.jobPositions.name })
      .from(schema.jobPositions)
      .where(
        and(
          eq(schema.jobPositions.organizationId, organizationId),
          isNull(schema.jobPositions.deletedAt)
        )
      );

    // Buscar faltas agrupadas por mês e posição
    const absences = await db
      .select({
        month: sql<string>`TO_CHAR(${schema.absences.startDate}, 'YYYY-MM')`,
        positionId: schema.employees.jobPositionId,
        absenceDays: sql<number>`SUM(
          ${schema.absences.endDate}::date - ${schema.absences.startDate}::date + 1
        )`,
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
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(
        sql`TO_CHAR(${schema.absences.startDate}, 'YYYY-MM')`,
        schema.employees.jobPositionId
      );

    // Mapear resultados
    const absencesMap = new Map<string, Map<string, number>>();
    for (const a of absences) {
      if (!absencesMap.has(a.month)) {
        absencesMap.set(a.month, new Map());
      }
      absencesMap.get(a.month)!.set(a.positionId, a.absenceDays);
    }

    const positionMap = new Map(positions.map(p => [p.id, p.name]));

    return months.map(month => {
      const monthData = absencesMap.get(month) ?? new Map();
      const positionsData: PositionData[] = positions.map(p => ({
        position: p.name,
        absenceDays: monthData.get(p.id) ?? 0,
      }));

      const total = positionsData.reduce((sum, p) => sum + p.absenceDays, 0);

      return {
        month,
        positions: positionsData.filter(p => p.absenceDays > 0),
        total,
      };
    }).filter(m => m.total > 0);
  }
}
```

### Ranking Query

```typescript
// queries/ranking.query.ts
import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

interface RankingItem {
  id: string;
  name: string;
  absenceDays: number;
  absenceCount: number;
}

export abstract class RankingQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters,
    limit = 20
  ): Promise<RankingItem[]> {
    const { startDate, endDate, sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    const results = await db
      .select({
        id: schema.employees.id,
        name: schema.employees.name,
        absenceDays: sql<number>`SUM(
          ${schema.absences.endDate}::date - ${schema.absences.startDate}::date + 1
        )`,
        absenceCount: count(schema.absences.id),
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
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(schema.employees.id, schema.employees.name)
      .orderBy(sql`3 DESC`)
      .limit(limit);

    return results.map(r => ({
      id: r.id,
      name: r.name,
      absenceDays: r.absenceDays,
      absenceCount: r.absenceCount,
    }));
  }
}
```

### Basket Allowance Query

```typescript
// queries/basket-allowance.query.ts
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

interface BasketAllowanceItem {
  id: string;
  name: string;
  hasBasketAllowance: boolean;
  absenceDays: number;
}

export abstract class BasketAllowanceQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<BasketAllowanceItem[]> {
    const { startDate, endDate, sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    // Buscar todos os funcionários com suas faltas
    const results = await db
      .select({
        id: schema.employees.id,
        name: schema.employees.name,
        hasBasketAllowance: schema.employees.hasBasketAllowance,
        absenceDays: sql<number>`COALESCE(SUM(
          ${schema.absences.endDate}::date - ${schema.absences.startDate}::date + 1
        ), 0)`,
      })
      .from(schema.employees)
      .leftJoin(
        schema.absences,
        and(
          eq(schema.absences.employeeId, schema.employees.id),
          gte(schema.absences.startDate, startDate),
          lte(schema.absences.startDate, endDate),
          isNull(schema.absences.deletedAt)
        )
      )
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(
        schema.employees.id,
        schema.employees.name,
        schema.employees.hasBasketAllowance
      )
      .orderBy(sql`4 DESC`);

    return results.map(r => ({
      id: r.id,
      name: r.name,
      hasBasketAllowance: r.hasBasketAllowance ?? false,
      absenceDays: r.absenceDays,
    }));
  }
}
```

### Absence Details Query

```typescript
// queries/absence-details.query.ts
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

const TYPE_LABELS: Record<string, string> = {
  JUSTIFIED: "Justificada",
  UNJUSTIFIED: "Injustificada",
};

const REASON_CATEGORY_LABELS: Record<string, string> = {
  PERSONAL_ISSUES: "Problemas pessoais",
  HEALTH: "Saúde",
  MEDICAL_PROCEDURE: "Procedimento médico",
  LATE_ARRIVAL: "Atraso",
  FAMILY_EMERGENCY: "Emergência familiar",
  TRANSPORT_ISSUES: "Problemas de transporte",
  WEATHER: "Condições climáticas",
  UNJUSTIFIED: "Falta injustificada",
  OTHER: "Outro",
};

interface AbsenceDetailItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhoto: string | null;
  date: string;
  startDate: string;
  endDate: string;
  days: number;
  type: string;
  typeLabel: string;
  reasonCategory: string | null;
  reasonCategoryLabel: string | null;
  reason: string | null;
}

export abstract class AbsenceDetailsQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<AbsenceDetailItem[]> {
    const { startDate, endDate, sectorIds, status, employeeIds } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    const employeeFilter = employeeIds && employeeIds.length > 0
      ? sql`${schema.employees.id} = ANY(${employeeIds})`
      : undefined;

    const results = await db
      .select({
        id: schema.absences.id,
        employeeId: schema.employees.id,
        employeeName: schema.employees.name,
        employeePhoto: schema.employees.photoUrl,
        startDate: schema.absences.startDate,
        endDate: schema.absences.endDate,
        type: schema.absences.type,
        reasonCategory: schema.absences.reasonCategory,
        reason: schema.absences.reason,
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
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter,
          employeeFilter
        )
      )
      .orderBy(schema.absences.startDate);

    return results.map(r => {
      const days = Math.ceil(
        (new Date(r.endDate).getTime() - new Date(r.startDate).getTime())
        / (1000 * 60 * 60 * 24)
      ) + 1;

      return {
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        employeePhoto: r.employeePhoto ?? null,
        date: r.startDate,
        startDate: r.startDate,
        endDate: r.endDate,
        days,
        type: r.type,
        typeLabel: TYPE_LABELS[r.type] ?? r.type,
        reasonCategory: r.reasonCategory ?? null,
        reasonCategoryLabel: r.reasonCategory
          ? REASON_CATEGORY_LABELS[r.reasonCategory] ?? r.reasonCategory
          : null,
        reason: r.reason ?? null,
      };
    });
  }
}
```

---

## Service

```typescript
// absences-report.service.ts
import { InvalidDateRangeError, PeriodTooLongError } from "../errors";
import { getDefaultDateRange } from "../shared/date-utils";
import type { NormalizedFilters, ReportFilters } from "../shared/filters.model";
import type { AbsencesReportData } from "./absences-report.model";
import { AbsenceDetailsQuery } from "./queries/absence-details.query";
import { BasketAllowanceQuery } from "./queries/basket-allowance.query";
import { ByManagerQuery } from "./queries/by-manager.query";
import { ByPositionMonthQuery } from "./queries/by-position-month.query";
import { ByReasonQuery } from "./queries/by-reason.query";
import { KpisQuery } from "./queries/kpis.query";
import { RankingQuery } from "./queries/ranking.query";

const MAX_PERIOD_DAYS = 730;

export abstract class AbsencesReportService {
  static async getReport(
    organizationId: string,
    filters: ReportFilters
  ): Promise<AbsencesReportData> {
    const normalizedFilters = AbsencesReportService.normalizeFilters(filters);

    const [
      kpis,
      byManager,
      byReasonCategory,
      byPositionAndMonth,
      ranking,
      basketAllowanceList,
      absenceDetails,
    ] = await Promise.all([
      KpisQuery.execute(organizationId, normalizedFilters),
      ByManagerQuery.execute(organizationId, normalizedFilters),
      ByReasonQuery.execute(organizationId, normalizedFilters),
      ByPositionMonthQuery.execute(organizationId, normalizedFilters),
      RankingQuery.execute(organizationId, normalizedFilters),
      BasketAllowanceQuery.execute(organizationId, normalizedFilters),
      AbsenceDetailsQuery.execute(organizationId, normalizedFilters),
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
      byManager,
      byReasonCategory,
      byPositionAndMonth,
      ranking,
      basketAllowanceList,
      absenceDetails,
    };
  }

  private static normalizeFilters(filters: ReportFilters): NormalizedFilters {
    const defaults = getDefaultDateRange();

    const startDate = filters.startDate ?? defaults.startDate;
    const endDate = filters.endDate ?? defaults.endDate;

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
      employeeIds: filters.employeeIds ?? [],
      status: filters.status ?? "ALL",
      types: filters.types ?? [],
    };
  }
}
```

---

## Controller

```typescript
// index.ts
import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { reportFiltersSchema } from "../shared/filters.model";
import { absencesReportResponseSchema } from "./absences-report.model";
import { AbsencesReportService } from "./absences-report.service";

export const absencesReportController = new Elysia({
  name: "absences-report",
  prefix: "/v1/reports/absences",
  detail: { tags: ["Reports - Absences"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async ({ session, query }) =>
      wrapSuccess(
        await AbsencesReportService.getReport(
          session.activeOrganizationId as string,
          query
        )
      ),
    {
      auth: {
        requireFeature: "absences_report",
        requireOrganization: true,
      },
      query: reportFiltersSchema,
      response: {
        200: absencesReportResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "Get Absences Report",
        description:
          "Returns complete absences report with KPIs, charts by manager/reason/position, " +
          "ranking, basket allowance list and detailed absence records.",
      },
    }
  );
```

---

## Labels e Mapeamentos

### Tipos de Falta

```typescript
const TYPE_LABELS: Record<string, string> = {
  JUSTIFIED: "Justificada",
  UNJUSTIFIED: "Injustificada",
};
```

### Categorias de Motivo

```typescript
const REASON_CATEGORY_LABELS: Record<string, string> = {
  PERSONAL_ISSUES: "Problemas pessoais",
  HEALTH: "Saúde",
  MEDICAL_PROCEDURE: "Procedimento médico",
  LATE_ARRIVAL: "Atraso",
  FAMILY_EMERGENCY: "Emergência familiar",
  TRANSPORT_ISSUES: "Problemas de transporte",
  WEATHER: "Condições climáticas",
  UNJUSTIFIED: "Falta injustificada",
  OTHER: "Outro",
};
```

---

## Testes

### Cobertura Obrigatória

- [ ] Rejeitar requisição sem autenticação (401)
- [ ] Rejeitar organização sem feature habilitada (403)
- [ ] Retornar relatório vazio para organização sem faltas
- [ ] Calcular total de dias de faltas corretamente
- [ ] Contar funcionários faltantes distintos
- [ ] Agrupar por gestor corretamente
- [ ] Agrupar por categoria de motivo
- [ ] Gerar ranking ordenado por dias de falta
- [ ] Listar direito a cesta básica
- [ ] Respeitar filtros de período
- [ ] Respeitar filtros de setor
- [ ] Respeitar filtros de status (ACTIVE/TERMINATED)

---

## Índices Recomendados

```sql
-- Performance para queries de absences
CREATE INDEX IF NOT EXISTS idx_absences_org_dates_deleted
  ON absences(organization_id, start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_absences_employee_dates
  ON absences(employee_id, start_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_absences_reason_category
  ON absences(reason_category)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_basket_allowance
  ON employees(organization_id, has_basket_allowance)
  WHERE deleted_at IS NULL;
```

---

## Uso no Frontend

```tsx
export function AbsencesReport() {
  const { data } = useQuery({
    queryKey: ["absences-report", filters],
    queryFn: () => api.get("/v1/reports/absences", { params: filters }),
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard title="Dias de Faltas" value={data.kpis.totalAbsenceDays} />
        <KpiCard title="Func. Faltantes" value={data.kpis.employeesWithAbsences} />
        <KpiCard title="Qtd Cestas" value={data.kpis.basketAllowanceCount} />
      </div>

      {/* Galeria de Fotos */}
      <EmployeePhotoGallery employees={data.employees} />

      {/* Gráficos */}
      <div className="grid grid-cols-3 gap-4">
        <BarChart title="Faltas por Gestor" data={data.byManager} horizontal />
        <BarChart title="Motivos" data={data.byReasonCategory} horizontal />
        <StackedBarChart title="Por Função" data={data.byPositionAndMonth} />
      </div>

      {/* Tabelas */}
      <div className="grid grid-cols-3 gap-4">
        <DataTable title="Rank" columns={rankColumns} data={data.ranking} />
        <DataTable title="Direito a Cestas" columns={basketColumns} data={data.basketAllowanceList} />
        <DataTable title="Análise" columns={detailColumns} data={data.absenceDetails} />
      </div>
    </div>
  );
}
```

---

## Checklist de Implementação

### Pré-requisitos (Schema)
- [ ] Adicionar `photoUrl` em `employees`
- [ ] Adicionar `hasBasketAllowance` em `employees`
- [ ] Criar enum `absenceTypeEnum` (JUSTIFIED, UNJUSTIFIED)
- [ ] Criar enum `absenceReasonCategoryEnum`
- [ ] Migrar `absences.type` de text para enum
- [ ] Adicionar `reasonCategory` em `absences`
- [ ] Gerar e aplicar migration

### Estrutura
- [ ] Criar diretório `src/modules/reports/absences/queries/`
- [ ] Criar `absences-report.model.ts`

### Queries
- [ ] Implementar `kpis.query.ts`
- [ ] Implementar `by-manager.query.ts`
- [ ] Implementar `by-reason.query.ts`
- [ ] Implementar `by-position-month.query.ts`
- [ ] Implementar `ranking.query.ts`
- [ ] Implementar `basket-allowance.query.ts`
- [ ] Implementar `absence-details.query.ts`

### Service e Controller
- [ ] Implementar `absences-report.service.ts`
- [ ] Implementar `absences/index.ts` (controller)
- [ ] Registrar no controller agregador de reports

### Testes
- [ ] Criar testes E2E
- [ ] Criar testes de integração do service

### Verificação
- [ ] `bun run check` sem erros
- [ ] Todos os testes passando
- [ ] Endpoint na documentação OpenAPI
