# Medical Certificates Report - Plano de Implementação

> **Relatório**: Relatório de Atestados Médicos
> **Referência**: Relatório Power BI "ATESTADOS"
> **Status**: Planejado
> **Pré-requisitos**: Alterações no schema (ver seção "Alterações Necessárias")

## Visão Geral

Relatório analítico focado em atestados médicos dos funcionários, permitindo análise de frequência, diagnósticos, dias de afastamento por gestor/função e acompanhamento individual.

### Objetivo

Fornecer insights sobre:
- Volume de atestados e dias de afastamento
- Diagnósticos/motivos mais frequentes
- Distribuição por gestor e setor/função
- Ranking de funcionários com mais dias de atestado
- Análise detalhada por funcionário e período

---

## Mapeamento: Power BI → API

### KPIs (Cards do Topo)

| Power BI | Campo API | Fonte de Dados | Status |
|----------|-----------|----------------|--------|
| Atestados | `kpis.certificateCount` | `COUNT(medical_certificates)` | ✅ Disponível |
| Dias de Atestados | `kpis.totalDaysOff` | `SUM(daysOff)` | ✅ Disponível |
| Func. Atestados | `kpis.employeesWithCertificates` | `COUNT DISTINCT(employeeId)` | ✅ Disponível |

### Galeria e Filtros

| Power BI | Campo API | Fonte | Status |
|----------|-----------|-------|--------|
| Fotos funcionários | `employees[].photoUrl` | `employees.photoUrl` | ❌ Campo não existe |
| Filtro funcionários | `employeeFilter` | Lista de employees | ✅ Disponível |

### Gráficos

| Power BI | Campo API | Tipo | Fonte | Status |
|----------|-----------|------|-------|--------|
| Dias por Gestor | `byManager` | Barra Horizontal | `employees.manager` | ⚠️ Texto, não FK |
| Motivos - Dias | `byDiagnosisCategory` | Barra | `diagnosisCategory` | ❌ Campo não existe |
| Atestados por Função/Setor | `bySectorAndMonth` | Barra Empilhada | `employees.sectorId` + `startDate` | ✅ Disponível |

### Tabelas

| Power BI | Campo API | Fonte | Status |
|----------|-----------|-------|--------|
| Rank (COD, Nome, Dias) | `ranking` | `employees` + `SUM(daysOff)` | ✅ Disponível |
| Análise - ID, Nome | ✅ | `employees` | ✅ Disponível |
| Análise - Início, Fim | ✅ | `startDate`, `endDate` | ✅ Disponível |
| Análise - Motivo | ❌ | `diagnosis` / `diagnosisCategory` | ❌ Campo não existe |
| Análise - Dias, Atest. | ✅ | `daysOff`, `COUNT` | ✅ Disponível |

---

## Status dos Dados

### Resumo de Disponibilidade

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Disponível | 8 campos | ~67% |
| ⚠️ Parcial | 1 campo | ~8% |
| ❌ Faltando | 3 campos | ~25% |

### Dados Disponíveis

- Contagem de atestados
- Total de dias de afastamento (`daysOff` já existe!)
- Contagem de funcionários com atestados
- Datas de início e fim do afastamento
- Código CID (técnico)
- Dados do médico (nome, CRM)
- Distribuição por setor e mês

### Dados Parcialmente Disponíveis

1. **Gestor** (`employees.manager`)
   - Existe como texto
   - Ideal seria FK para `employees`

### Dados Faltantes

1. **Foto do funcionário** (`employees.photoUrl`)
   - Necessário para galeria visual

2. **Categoria do diagnóstico** (`medical_certificates.diagnosisCategory`)
   - Enum estruturado para análise (COVID, Cirurgia, etc.)

3. **Diagnóstico legível** (`medical_certificates.diagnosis`)
   - Descrição user-friendly do motivo

---

## Campos Existentes vs Necessários

### Campo `cid` (existente)

O campo `cid` armazena o código CID (Classificação Internacional de Doenças):
- Exemplo: `U07.1` = COVID-19
- Uso: Integração com sistemas de saúde, relatórios oficiais
- Limitação: Não é user-friendly para exibição em dashboards

### Campos Novos (necessários)

| Campo | Propósito | Exemplo |
|-------|-----------|---------|
| `diagnosisCategory` | Categoria para gráficos | `COVID`, `SURGERY` |
| `diagnosis` | Descrição legível | "COVID-19", "Cirurgia de apendicite" |

**Relação**: O `cid` continua sendo útil para relatórios técnicos, enquanto `diagnosisCategory` e `diagnosis` são para visualização.

---

## Alterações Necessárias no Schema

### 1. Adicionar campo em `employees` (já planejado)

**Arquivo:** `src/db/schema/employees.ts`

```typescript
photoUrl: text("photo_url"),
```

### 2. Adicionar campos em `medical_certificates`

**Arquivo:** `src/db/schema/medical-certificates.ts`

```typescript
// Novo enum para categorias de diagnóstico
export const medicalDiagnosisCategoryEnum = pgEnum("medical_diagnosis_category", [
  "COVID",                  // COVID-19 e variantes
  "FLU",                    // Gripe/Influenza
  "DENGUE",                 // Dengue e arboviroses
  "SURGERY",                // Cirurgia (qualquer tipo)
  "ORTHOPEDIC",             // Ortopédico (fraturas, entorses, lombalgia)
  "DENTAL",                 // Odontológico
  "GASTRIC",                // Gastrointestinal
  "RESPIRATORY",            // Respiratório (exceto COVID/gripe)
  "CARDIOVASCULAR",         // Cardiovascular
  "MENTAL_HEALTH",          // Saúde mental (ansiedade, depressão)
  "MATERNITY",              // Maternidade/Gestação
  "OCCUPATIONAL_ACCIDENT",  // Acidente de trabalho
  "ROUTINE_EXAM",           // Exames de rotina
  "OTHER",                  // Outro
]);

// Adicionar campos na tabela
diagnosisCategory: medicalDiagnosisCategoryEnum("diagnosis_category"),
diagnosis: text("diagnosis"),  // Descrição legível do diagnóstico
```

**Impacto:** Baixo - campos opcionais, não quebra API existente

---

## Estrutura de Arquivos

```text
src/modules/reports/
├── medical-certificates/
│   ├── index.ts                              # Controller
│   ├── medical-certificates-report.model.ts  # Schemas Zod
│   ├── medical-certificates-report.service.ts # Orquestração
│   └── queries/
│       ├── kpis.query.ts                     # KPIs principais
│       ├── by-manager.query.ts               # Dias por gestor
│       ├── by-diagnosis.query.ts             # Por diagnóstico/motivo
│       ├── by-sector-month.query.ts          # Por setor e mês
│       ├── ranking.query.ts                  # Ranking de dias
│       └── certificate-details.query.ts      # Tabela analítica
```

---

## Endpoint

```
GET /v1/reports/medical-certificates
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
| `diagnosisCategories` | string[] | Não | Filtrar por categorias de diagnóstico |

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
      diagnosisCategories: string[]
    },

    kpis: {
      certificateCount: number,
      totalDaysOff: number,
      employeesWithCertificates: number,
      averageDaysPerCertificate: number
    },

    byManager: [
      {
        manager: "Carlos Maia",
        daysOff: 15,
        certificateCount: 1,
        percentage: 51.72
      }
    ],

    byDiagnosisCategory: [
      {
        category: "COVID",
        label: "COVID-19",
        daysOff: 15,
        certificateCount: 1,
        percentage: 51.72
      }
    ],

    bySectorAndMonth: [
      {
        month: "2025-06",
        sectors: [
          { sector: "Arquitetura", daysOff: 0 },
          { sector: "Engenharia", daysOff: 7 },
          { sector: "Recursos Humanos", daysOff: 0 }
        ],
        total: 7
      }
    ],

    ranking: [
      {
        id: "emp-123",
        name: "Justin Orizabal",
        daysOff: 15,
        certificateCount: 1
      }
    ],

    certificateDetails: [
      {
        id: "cert-123",
        employeeId: "emp-123",
        employeeName: "Justin Orizabal",
        employeePhoto: "https://...",
        startDate: "2025-07-02",
        endDate: "2025-07-17",
        daysOff: 15,
        diagnosisCategory: "COVID",
        diagnosisCategoryLabel: "COVID-19",
        diagnosis: "COVID-19 com sintomas moderados",
        cid: "U07.1",
        doctorName: "Dr. João Silva",
        doctorCrm: "12345-SP"
      }
    ],

    employees: [
      {
        id: "emp-123",
        name: "Justin Orizabal",
        photoUrl: "https://...",
        sector: "Engenharia",
        manager: "Carlos Maia",
        totalDaysOff: 15,
        certificateCount: 1
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
import { and, avg, count, countDistinct, eq, gte, isNull, lte, sum } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

interface MedicalCertificatesKpis {
  certificateCount: number;
  totalDaysOff: number;
  employeesWithCertificates: number;
  averageDaysPerCertificate: number;
}

export abstract class KpisQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<MedicalCertificatesKpis> {
    const { startDate, endDate, sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    const [stats] = await db
      .select({
        certificateCount: count(),
        totalDaysOff: sum(schema.medicalCertificates.daysOff),
        employeesWithCertificates: countDistinct(schema.medicalCertificates.employeeId),
        averageDaysPerCertificate: avg(schema.medicalCertificates.daysOff),
      })
      .from(schema.medicalCertificates)
      .innerJoin(
        schema.employees,
        eq(schema.medicalCertificates.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.medicalCertificates.organizationId, organizationId),
          gte(schema.medicalCertificates.startDate, startDate),
          lte(schema.medicalCertificates.startDate, endDate),
          isNull(schema.medicalCertificates.deletedAt),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      );

    return {
      certificateCount: stats?.certificateCount ?? 0,
      totalDaysOff: Number(stats?.totalDaysOff ?? 0),
      employeesWithCertificates: stats?.employeesWithCertificates ?? 0,
      averageDaysPerCertificate: Math.round(Number(stats?.averageDaysPerCertificate ?? 0) * 100) / 100,
    };
  }
}
```

### By Manager Query

```typescript
// queries/by-manager.query.ts
import { and, count, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

interface ByManagerItem {
  manager: string;
  daysOff: number;
  certificateCount: number;
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
        daysOff: sum(schema.medicalCertificates.daysOff),
        certificateCount: count(),
      })
      .from(schema.medicalCertificates)
      .innerJoin(
        schema.employees,
        eq(schema.medicalCertificates.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.medicalCertificates.organizationId, organizationId),
          gte(schema.medicalCertificates.startDate, startDate),
          lte(schema.medicalCertificates.startDate, endDate),
          isNull(schema.medicalCertificates.deletedAt),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(schema.employees.manager)
      .orderBy(sql`2 DESC`);

    const totalDays = results.reduce((sum, r) => sum + Number(r.daysOff), 0);

    return results.map(r => ({
      manager: r.manager,
      daysOff: Number(r.daysOff),
      certificateCount: r.certificateCount,
      percentage: totalDays > 0
        ? Math.round((Number(r.daysOff) / totalDays) * 10000) / 100
        : 0,
    }));
  }
}
```

### By Diagnosis Category Query

```typescript
// queries/by-diagnosis.query.ts
import { and, count, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

const DIAGNOSIS_CATEGORY_LABELS: Record<string, string> = {
  COVID: "COVID-19",
  FLU: "Gripe/Influenza",
  DENGUE: "Dengue",
  SURGERY: "Cirurgia",
  ORTHOPEDIC: "Ortopédico",
  DENTAL: "Odontológico",
  GASTRIC: "Gastrointestinal",
  RESPIRATORY: "Respiratório",
  CARDIOVASCULAR: "Cardiovascular",
  MENTAL_HEALTH: "Saúde Mental",
  MATERNITY: "Maternidade",
  OCCUPATIONAL_ACCIDENT: "Acidente de Trabalho",
  ROUTINE_EXAM: "Exames de Rotina",
  OTHER: "Outro",
};

interface ByDiagnosisItem {
  category: string;
  label: string;
  daysOff: number;
  certificateCount: number;
  percentage: number;
}

export abstract class ByDiagnosisQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<ByDiagnosisItem[]> {
    const { startDate, endDate, sectorIds, status } = filters;

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    const results = await db
      .select({
        category: sql<string>`COALESCE(${schema.medicalCertificates.diagnosisCategory}, 'OTHER')`,
        daysOff: sum(schema.medicalCertificates.daysOff),
        certificateCount: count(),
      })
      .from(schema.medicalCertificates)
      .innerJoin(
        schema.employees,
        eq(schema.medicalCertificates.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.medicalCertificates.organizationId, organizationId),
          gte(schema.medicalCertificates.startDate, startDate),
          lte(schema.medicalCertificates.startDate, endDate),
          isNull(schema.medicalCertificates.deletedAt),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(schema.medicalCertificates.diagnosisCategory)
      .orderBy(sql`2 DESC`);

    const totalDays = results.reduce((sum, r) => sum + Number(r.daysOff), 0);

    return results.map(r => ({
      category: r.category,
      label: DIAGNOSIS_CATEGORY_LABELS[r.category] ?? r.category,
      daysOff: Number(r.daysOff),
      certificateCount: r.certificateCount,
      percentage: totalDays > 0
        ? Math.round((Number(r.daysOff) / totalDays) * 10000) / 100
        : 0,
    }));
  }
}
```

### By Sector and Month Query

```typescript
// queries/by-sector-month.query.ts
import { and, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { generateMonthRange } from "../../shared/date-utils";
import type { NormalizedFilters } from "../../shared/filters.model";

interface SectorData {
  sector: string;
  daysOff: number;
}

interface BySectorMonthItem {
  month: string;
  sectors: SectorData[];
  total: number;
}

export abstract class BySectorMonthQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<BySectorMonthItem[]> {
    const { startDate, endDate, sectorIds, status } = filters;
    const months = generateMonthRange(startDate, endDate);

    const sectorFilter = sectorIds.length > 0
      ? sql`${schema.employees.sectorId} = ANY(${sectorIds})`
      : undefined;

    const statusFilter = status !== "ALL"
      ? eq(schema.employees.status, status)
      : undefined;

    // Buscar setores
    const sectors = await db
      .select({ id: schema.sectors.id, name: schema.sectors.name })
      .from(schema.sectors)
      .where(
        and(
          eq(schema.sectors.organizationId, organizationId),
          isNull(schema.sectors.deletedAt)
        )
      );

    // Buscar atestados agrupados
    const certificates = await db
      .select({
        month: sql<string>`TO_CHAR(${schema.medicalCertificates.startDate}, 'YYYY-MM')`,
        sectorId: schema.employees.sectorId,
        daysOff: sum(schema.medicalCertificates.daysOff),
      })
      .from(schema.medicalCertificates)
      .innerJoin(
        schema.employees,
        eq(schema.medicalCertificates.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.medicalCertificates.organizationId, organizationId),
          gte(schema.medicalCertificates.startDate, startDate),
          lte(schema.medicalCertificates.startDate, endDate),
          isNull(schema.medicalCertificates.deletedAt),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter
        )
      )
      .groupBy(
        sql`TO_CHAR(${schema.medicalCertificates.startDate}, 'YYYY-MM')`,
        schema.employees.sectorId
      );

    // Mapear resultados
    const dataMap = new Map<string, Map<string, number>>();
    for (const c of certificates) {
      if (!dataMap.has(c.month)) {
        dataMap.set(c.month, new Map());
      }
      dataMap.get(c.month)!.set(c.sectorId, Number(c.daysOff));
    }

    return months.map(month => {
      const monthData = dataMap.get(month) ?? new Map();
      const sectorsData: SectorData[] = sectors.map(s => ({
        sector: s.name,
        daysOff: monthData.get(s.id) ?? 0,
      }));

      const total = sectorsData.reduce((sum, s) => sum + s.daysOff, 0);

      return {
        month,
        sectors: sectorsData.filter(s => s.daysOff > 0),
        total,
      };
    }).filter(m => m.total > 0);
  }
}
```

### Ranking Query

```typescript
// queries/ranking.query.ts
import { and, count, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

interface RankingItem {
  id: string;
  name: string;
  daysOff: number;
  certificateCount: number;
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
        daysOff: sum(schema.medicalCertificates.daysOff),
        certificateCount: count(),
      })
      .from(schema.medicalCertificates)
      .innerJoin(
        schema.employees,
        eq(schema.medicalCertificates.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.medicalCertificates.organizationId, organizationId),
          gte(schema.medicalCertificates.startDate, startDate),
          lte(schema.medicalCertificates.startDate, endDate),
          isNull(schema.medicalCertificates.deletedAt),
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
      daysOff: Number(r.daysOff),
      certificateCount: r.certificateCount,
    }));
  }
}
```

### Certificate Details Query

```typescript
// queries/certificate-details.query.ts
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { NormalizedFilters } from "../../shared/filters.model";

const DIAGNOSIS_CATEGORY_LABELS: Record<string, string> = {
  COVID: "COVID-19",
  FLU: "Gripe/Influenza",
  DENGUE: "Dengue",
  SURGERY: "Cirurgia",
  ORTHOPEDIC: "Ortopédico",
  DENTAL: "Odontológico",
  GASTRIC: "Gastrointestinal",
  RESPIRATORY: "Respiratório",
  CARDIOVASCULAR: "Cardiovascular",
  MENTAL_HEALTH: "Saúde Mental",
  MATERNITY: "Maternidade",
  OCCUPATIONAL_ACCIDENT: "Acidente de Trabalho",
  ROUTINE_EXAM: "Exames de Rotina",
  OTHER: "Outro",
};

interface CertificateDetailItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhoto: string | null;
  startDate: string;
  endDate: string;
  daysOff: number;
  diagnosisCategory: string | null;
  diagnosisCategoryLabel: string | null;
  diagnosis: string | null;
  cid: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
}

export abstract class CertificateDetailsQuery {
  static async execute(
    organizationId: string,
    filters: NormalizedFilters
  ): Promise<CertificateDetailItem[]> {
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
        id: schema.medicalCertificates.id,
        employeeId: schema.employees.id,
        employeeName: schema.employees.name,
        employeePhoto: schema.employees.photoUrl,
        startDate: schema.medicalCertificates.startDate,
        endDate: schema.medicalCertificates.endDate,
        daysOff: schema.medicalCertificates.daysOff,
        diagnosisCategory: schema.medicalCertificates.diagnosisCategory,
        diagnosis: schema.medicalCertificates.diagnosis,
        cid: schema.medicalCertificates.cid,
        doctorName: schema.medicalCertificates.doctorName,
        doctorCrm: schema.medicalCertificates.doctorCrm,
      })
      .from(schema.medicalCertificates)
      .innerJoin(
        schema.employees,
        eq(schema.medicalCertificates.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.medicalCertificates.organizationId, organizationId),
          gte(schema.medicalCertificates.startDate, startDate),
          lte(schema.medicalCertificates.startDate, endDate),
          isNull(schema.medicalCertificates.deletedAt),
          isNull(schema.employees.deletedAt),
          sectorFilter,
          statusFilter,
          employeeFilter
        )
      )
      .orderBy(schema.medicalCertificates.startDate);

    return results.map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      employeePhoto: r.employeePhoto ?? null,
      startDate: r.startDate,
      endDate: r.endDate,
      daysOff: r.daysOff,
      diagnosisCategory: r.diagnosisCategory ?? null,
      diagnosisCategoryLabel: r.diagnosisCategory
        ? DIAGNOSIS_CATEGORY_LABELS[r.diagnosisCategory] ?? r.diagnosisCategory
        : null,
      diagnosis: r.diagnosis ?? null,
      cid: r.cid ?? null,
      doctorName: r.doctorName ?? null,
      doctorCrm: r.doctorCrm ?? null,
    }));
  }
}
```

---

## Service

```typescript
// medical-certificates-report.service.ts
import { InvalidDateRangeError, PeriodTooLongError } from "../errors";
import { getDefaultDateRange } from "../shared/date-utils";
import type { NormalizedFilters, ReportFilters } from "../shared/filters.model";
import type { MedicalCertificatesReportData } from "./medical-certificates-report.model";
import { ByDiagnosisQuery } from "./queries/by-diagnosis.query";
import { ByManagerQuery } from "./queries/by-manager.query";
import { BySectorMonthQuery } from "./queries/by-sector-month.query";
import { CertificateDetailsQuery } from "./queries/certificate-details.query";
import { KpisQuery } from "./queries/kpis.query";
import { RankingQuery } from "./queries/ranking.query";

const MAX_PERIOD_DAYS = 730;

export abstract class MedicalCertificatesReportService {
  static async getReport(
    organizationId: string,
    filters: ReportFilters
  ): Promise<MedicalCertificatesReportData> {
    const normalizedFilters = MedicalCertificatesReportService.normalizeFilters(filters);

    const [
      kpis,
      byManager,
      byDiagnosisCategory,
      bySectorAndMonth,
      ranking,
      certificateDetails,
    ] = await Promise.all([
      KpisQuery.execute(organizationId, normalizedFilters),
      ByManagerQuery.execute(organizationId, normalizedFilters),
      ByDiagnosisQuery.execute(organizationId, normalizedFilters),
      BySectorMonthQuery.execute(organizationId, normalizedFilters),
      RankingQuery.execute(organizationId, normalizedFilters),
      CertificateDetailsQuery.execute(organizationId, normalizedFilters),
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
      byDiagnosisCategory,
      bySectorAndMonth,
      ranking,
      certificateDetails,
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
      diagnosisCategories: filters.diagnosisCategories ?? [],
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
import { medicalCertificatesReportResponseSchema } from "./medical-certificates-report.model";
import { MedicalCertificatesReportService } from "./medical-certificates-report.service";

export const medicalCertificatesReportController = new Elysia({
  name: "medical-certificates-report",
  prefix: "/v1/reports/medical-certificates",
  detail: { tags: ["Reports - Medical Certificates"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async ({ session, query }) =>
      wrapSuccess(
        await MedicalCertificatesReportService.getReport(
          session.activeOrganizationId as string,
          query
        )
      ),
    {
      auth: {
        requireFeature: "medical_certificates_report",
        requireOrganization: true,
      },
      query: reportFiltersSchema,
      response: {
        200: medicalCertificatesReportResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "Get Medical Certificates Report",
        description:
          "Returns complete medical certificates report with KPIs, charts by manager/diagnosis/sector, " +
          "ranking and detailed certificate records.",
      },
    }
  );
```

---

## Labels e Mapeamentos

### Categorias de Diagnóstico

```typescript
const DIAGNOSIS_CATEGORY_LABELS: Record<string, string> = {
  COVID: "COVID-19",
  FLU: "Gripe/Influenza",
  DENGUE: "Dengue",
  SURGERY: "Cirurgia",
  ORTHOPEDIC: "Ortopédico",
  DENTAL: "Odontológico",
  GASTRIC: "Gastrointestinal",
  RESPIRATORY: "Respiratório",
  CARDIOVASCULAR: "Cardiovascular",
  MENTAL_HEALTH: "Saúde Mental",
  MATERNITY: "Maternidade",
  OCCUPATIONAL_ACCIDENT: "Acidente de Trabalho",
  ROUTINE_EXAM: "Exames de Rotina",
  OTHER: "Outro",
};
```

---

## Testes

### Cobertura Obrigatória

- [ ] Rejeitar requisição sem autenticação (401)
- [ ] Rejeitar organização sem feature habilitada (403)
- [ ] Retornar relatório vazio para organização sem atestados
- [ ] Calcular total de dias de afastamento corretamente
- [ ] Calcular média de dias por atestado
- [ ] Contar funcionários com atestados distintos
- [ ] Agrupar por gestor corretamente
- [ ] Agrupar por categoria de diagnóstico
- [ ] Gerar ranking ordenado por dias de afastamento
- [ ] Respeitar filtros de período
- [ ] Respeitar filtros de setor
- [ ] Respeitar filtros de status (ACTIVE/TERMINATED)

---

## Índices Recomendados

```sql
-- Performance para queries de medical_certificates
CREATE INDEX IF NOT EXISTS idx_medical_certificates_org_dates_deleted
  ON medical_certificates(organization_id, start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_medical_certificates_employee_dates
  ON medical_certificates(employee_id, start_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_medical_certificates_diagnosis_category
  ON medical_certificates(diagnosis_category)
  WHERE deleted_at IS NULL;
```

---

## Uso no Frontend

```tsx
export function MedicalCertificatesReport() {
  const { data } = useQuery({
    queryKey: ["medical-certificates-report", filters],
    queryFn: () => api.get("/v1/reports/medical-certificates", { params: filters }),
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard title="Atestados" value={data.kpis.certificateCount} />
        <KpiCard title="Dias de Atestados" value={data.kpis.totalDaysOff} />
        <KpiCard title="Func. Atestados" value={data.kpis.employeesWithCertificates} />
      </div>

      {/* Galeria de Fotos */}
      <EmployeePhotoGallery employees={data.employees} />

      {/* Gráficos */}
      <div className="grid grid-cols-3 gap-4">
        <BarChart title="Dias por Gestor" data={data.byManager} horizontal />
        <BarChart title="Motivos" data={data.byDiagnosisCategory} />
        <StackedBarChart title="Por Setor" data={data.bySectorAndMonth} />
      </div>

      {/* Tabelas */}
      <div className="grid grid-cols-2 gap-4">
        <DataTable title="Rank" columns={rankColumns} data={data.ranking} />
        <DataTable title="Análise" columns={detailColumns} data={data.certificateDetails} />
      </div>
    </div>
  );
}
```

---

## Checklist de Implementação

### Pré-requisitos (Schema)
- [ ] Adicionar `photoUrl` em `employees` (já planejado)
- [ ] Criar enum `medicalDiagnosisCategoryEnum`
- [ ] Adicionar `diagnosisCategory` em `medical_certificates`
- [ ] Adicionar `diagnosis` em `medical_certificates`
- [ ] Gerar e aplicar migration

### Estrutura
- [ ] Criar diretório `src/modules/reports/medical-certificates/queries/`
- [ ] Criar `medical-certificates-report.model.ts`

### Queries
- [ ] Implementar `kpis.query.ts`
- [ ] Implementar `by-manager.query.ts`
- [ ] Implementar `by-diagnosis.query.ts`
- [ ] Implementar `by-sector-month.query.ts`
- [ ] Implementar `ranking.query.ts`
- [ ] Implementar `certificate-details.query.ts`

### Service e Controller
- [ ] Implementar `medical-certificates-report.service.ts`
- [ ] Implementar `medical-certificates/index.ts` (controller)
- [ ] Registrar no controller agregador de reports

### Testes
- [ ] Criar testes E2E
- [ ] Criar testes de integração do service

### Verificação
- [ ] `bun run check` sem erros
- [ ] Todos os testes passando
- [ ] Endpoint na documentação OpenAPI
