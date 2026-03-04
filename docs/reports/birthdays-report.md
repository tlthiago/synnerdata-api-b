# Relatório de Aniversariantes (ANIVERSARIANTES)

## Visão Geral

Relatório que apresenta os aniversariantes da organização, permitindo visualização mensal e listagem dos funcionários que fazem aniversário no mês atual e no próximo mês.

## Análise de Disponibilidade de Dados

### KPIs

| KPI | Campo/Cálculo Necessário | Status | Observação |
|-----|-------------------------|--------|------------|
| Neste Mês | `COUNT` onde `MONTH(birthDate) = atual` | ✅ Disponível | Filtro por mês atual |
| Próximo Mês | `COUNT` onde `MONTH(birthDate) = próximo` | ✅ Disponível | Filtro por próximo mês |

### Gráfico - Aniversários Mensais

| Componente | Campo Necessário | Status | Observação |
|------------|------------------|--------|------------|
| Quantidade por mês | `employees.birthDate` | ✅ Disponível | Agrupamento por `MONTH(birthDate)` |

### Tabelas (Neste Mês / Próximo Mês)

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| COD | `employees.code` | ❌ Ausente |
| Funcionário | `employees.name` | ✅ Disponível |
| Função | `job_positions.name` | ✅ Disponível |
| Data | `employees.birthDate` | ✅ Disponível |

### Resumo de Disponibilidade

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Disponível | 5 | 83% |
| ❌ Ausente | 1 | 17% |

## Alterações de Schema Necessárias

### 1. Adicionar campo `code` em employees (CRÍTICO)

```typescript
// src/db/schema/employees.ts
code: text("code").notNull(), // Matrícula do funcionário
```

**Nota**: Este campo é utilizado em TODOS os relatórios analisados e deve ser prioridade máxima.

### 2. (Opcional) Adicionar campo `photoUrl` em employees

```typescript
// src/db/schema/employees.ts
photoUrl: text("photo_url"),
```

## Estrutura do Endpoint

### Rota

```
GET /api/v1/reports/birthdays
```

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| year | number | Não | Ano de referência (default: ano atual) |
| sector | string | Não | Filtrar por setor |
| branch | string | Não | Filtrar por filial |

### Response Schema

```typescript
interface BirthdaysReportResponse {
  success: true;
  data: {
    kpis: {
      thisMonth: number;
      nextMonth: number;
    };
    chart: {
      monthlyBirthdays: Array<{
        month: number;        // 1-12
        monthLabel: string;   // "JAN", "FEV", etc.
        count: number;
      }>;
    };
    tables: {
      thisMonth: Array<{
        code: string;
        name: string;
        jobPosition: string;
        birthDate: string;
        day: number;          // Dia do aniversário
      }>;
      nextMonth: Array<{
        code: string;
        name: string;
        jobPosition: string;
        birthDate: string;
        day: number;
      }>;
    };
    metadata: {
      referenceYear: number;
      currentMonth: number;
      generatedAt: string;
      totalEmployees: number;
    };
  };
}
```

## Queries Necessárias

### 1. KPIs e Contagem Mensal

```typescript
const currentMonth = new Date().getMonth() + 1; // 1-12
const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

// Contagem por mês (para gráfico e KPIs)
const monthlyBirthdays = await db
  .select({
    month: sql<number>`EXTRACT(MONTH FROM ${employees.birthDate})`,
    count: count(),
  })
  .from(employees)
  .where(
    and(
      eq(employees.organizationId, organizationId),
      eq(employees.status, 'ACTIVE'),
      isNull(employees.deletedAt)
    )
  )
  .groupBy(sql`EXTRACT(MONTH FROM ${employees.birthDate})`)
  .orderBy(sql`EXTRACT(MONTH FROM ${employees.birthDate})`);
```

### 2. Aniversariantes do Mês Atual

```typescript
const thisMonthBirthdays = await db
  .select({
    code: employees.code,
    name: employees.name,
    jobPosition: jobPositions.name,
    birthDate: employees.birthDate,
    day: sql<number>`EXTRACT(DAY FROM ${employees.birthDate})`,
  })
  .from(employees)
  .innerJoin(jobPositions, eq(employees.jobPositionId, jobPositions.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      eq(employees.status, 'ACTIVE'),
      sql`EXTRACT(MONTH FROM ${employees.birthDate}) = ${currentMonth}`,
      isNull(employees.deletedAt)
    )
  )
  .orderBy(sql`EXTRACT(DAY FROM ${employees.birthDate})`);
```

### 3. Aniversariantes do Próximo Mês

```typescript
const nextMonthBirthdays = await db
  .select({
    code: employees.code,
    name: employees.name,
    jobPosition: jobPositions.name,
    birthDate: employees.birthDate,
    day: sql<number>`EXTRACT(DAY FROM ${employees.birthDate})`,
  })
  .from(employees)
  .innerJoin(jobPositions, eq(employees.jobPositionId, jobPositions.id))
  .where(
    and(
      eq(employees.organizationId, organizationId),
      eq(employees.status, 'ACTIVE'),
      sql`EXTRACT(MONTH FROM ${employees.birthDate}) = ${nextMonth}`,
      isNull(employees.deletedAt)
    )
  )
  .orderBy(sql`EXTRACT(DAY FROM ${employees.birthDate})`);
```

## Implementação

### Estrutura de Arquivos

```
src/modules/reports/birthdays/
├── birthdays-report.controller.ts
├── birthdays-report.service.ts
├── birthdays-report.model.ts
├── birthdays-report.schemas.ts
└── birthdays-report.test.ts
```

### Controller

```typescript
// src/modules/reports/birthdays/birthdays-report.controller.ts
import Elysia from "elysia";
import { authPlugin } from "@/modules/auth/auth.plugin";
import { birthdaysReportQuerySchema } from "./birthdays-report.schemas";
import { getBirthdaysReport } from "./birthdays-report.service";

export const birthdaysReportController = new Elysia({
  prefix: "/birthdays",
  detail: { tags: ["Reports - Birthdays"] },
})
  .use(authPlugin)
  .get(
    "/",
    async ({ query, organization }) => {
      const data = await getBirthdaysReport({
        organizationId: organization.id,
        ...query,
      });

      return { success: true, data };
    },
    {
      query: birthdaysReportQuerySchema,
      detail: {
        summary: "Get birthdays report",
        description: "Returns employee birthdays data for the organization",
      },
      requireFeature: "reports:birthdays",
    }
  );
```

### Schemas

```typescript
// src/modules/reports/birthdays/birthdays-report.schemas.ts
import { z } from "zod";

export const birthdaysReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  sector: z.string().optional(),
  branch: z.string().optional(),
});

export type BirthdaysReportQuery = z.infer<typeof birthdaysReportQuerySchema>;
```

## Considerações de Performance

1. **Índices Recomendados**:
   ```sql
   CREATE INDEX idx_employees_birth_month ON employees(
     organization_id,
     EXTRACT(MONTH FROM birth_date)
   ) WHERE deleted_at IS NULL AND status = 'ACTIVE';
   ```

2. **Execução Paralela**: As queries de mês atual e próximo mês podem ser executadas em paralelo com `Promise.all`.

3. **Cache**: Cache de 1 hora é aceitável pois aniversários não mudam frequentemente.

## Filtros Disponíveis

- **Ano**: Ano de referência para exibição
- **Setor**: Filtrar por setor
- **Filial**: Filtrar por filial

## Formato de Exportação

### PDF
- Layout retrato
- KPIs em cards no topo
- Gráfico de barras com distribuição mensal
- Tabelas lado a lado (Neste Mês | Próximo Mês)

### Excel
- Aba "Resumo": KPIs e gráfico
- Aba "Neste Mês": Lista de aniversariantes
- Aba "Próximo Mês": Lista de aniversariantes
- Aba "Todos": Lista completa por mês

## Funcionalidades Adicionais Sugeridas

### 1. Notificações de Aniversário

```typescript
// Endpoint para listar aniversariantes da semana
GET /api/v1/reports/birthdays/this-week

// Pode ser usado para:
// - Envio de e-mails automáticos
// - Notificações no dashboard
// - Integração com calendário
```

### 2. Idade do Funcionário

```typescript
// Calcular idade no momento do aniversário
age: sql<number>`EXTRACT(YEAR FROM AGE(${employees.birthDate}))`,
```

### 3. Aniversário de Empresa

```typescript
// Calcular tempo de casa (anos completos)
yearsInCompany: sql<number>`EXTRACT(YEAR FROM AGE(${employees.hireDate}))`,
```

## Observações

1. **Data de Nascimento**: O campo `birthDate` já existe no schema e é obrigatório.

2. **Formato de Data**: No frontend, exibir apenas dia/mês (ex: "15/03") nas tabelas.

3. **Ordenação**: As tabelas devem ser ordenadas por dia do mês, não por data completa.

4. **Funcionários Ativos**: Apenas funcionários com `status = 'ACTIVE'` devem aparecer.

5. **Privacidade**: Considerar se a idade deve ser exibida ou apenas o dia do aniversário.
