# Relatório de Gestão de EPI (GESTÃO EPI)

## Visão Geral

Relatório que apresenta a gestão de Equipamentos de Proteção Individual (EPI) da organização, incluindo distribuição por tipo de EPI, por função, e histórico detalhado de entregas.

## Análise de Disponibilidade de Dados

### Galeria de Fotos

| Componente | Campo Necessário | Status |
|------------|------------------|--------|
| Foto funcionário | `employees.photoUrl` | ❌ Ausente |

### Gráficos

| Gráfico | Campos Necessários | Status | Observação |
|---------|-------------------|--------|------------|
| % de EPI | `ppeItems.name`, `COUNT` | ✅ Disponível | Donut chart |
| % de EPI por Função | `jobPositions.name`, `COUNT` | ✅ Disponível | Bar chart horizontal |

### Tabela GESTÃO

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| Data | `ppeDeliveries.deliveryDate` | ✅ Disponível |
| Entregue Por | `ppeDeliveries.deliveredBy` | ✅ Disponível |
| Funcionário | `employees.name` | ✅ Disponível |
| Equipamentos | `ppeItems.equipment` | ✅ Disponível |
| EPI's | `ppeItems.name` | ✅ Disponível |
| Motivo | `ppeDeliveries.reason` | ✅ Disponível |

### Filtros

| Filtro | Campo Necessário | Status |
|--------|------------------|--------|
| Período Entrega | `ppeDeliveries.deliveryDate` | ✅ Disponível |
| Setor | `sectors.name` | ✅ Disponível |
| Status | `employees.status` | ✅ Disponível |
| Funcionário | `employees.name` | ✅ Disponível |

### Resumo de Disponibilidade

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Disponível | 10 | 91% |
| ❌ Ausente | 1 | 9% |

## Estrutura do Schema

O módulo de EPI possui uma estrutura bem modelada:

```
ppeDeliveries (entrega principal)
├── id
├── organizationId
├── employeeId → employees
├── deliveryDate
├── deliveredBy
└── reason
     │
     └── ppeDeliveryItems (itens da entrega - N:N)
              ├── ppeDeliveryId → ppeDeliveries
              └── ppeItemId → ppeItems
                               ├── name (nome do EPI)
                               ├── description
                               └── equipment (categoria/equipamento)
```

## Alterações de Schema Necessárias

### 1. Adicionar campo `photoUrl` em employees

```typescript
// src/db/schema/employees.ts
photoUrl: text("photo_url"),
```

### 2. (Opcional) Adicionar enum para motivos de entrega

```typescript
// src/db/schema/ppe-deliveries.ts
export const ppeDeliveryReasonEnum = pgEnum("ppe_delivery_reason", [
  "ADMISSAO",
  "SUBSTITUICAO",
  "PERDA",
  "DANO",
  "VENCIMENTO",
  "TROCA_FUNCAO",
]);

// Adicionar campo
reasonCategory: ppeDeliveryReasonEnum("reason_category"),
```

## Estrutura do Endpoint

### Rota

```
GET /api/v1/reports/ppe-management
```

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| startDate | string (ISO) | Sim | Data inicial do período |
| endDate | string (ISO) | Sim | Data final do período |
| sector | string | Não | Filtrar por setor |
| jobPosition | string | Não | Filtrar por função |
| status | string | Não | Filtrar por status do funcionário |
| employeeId | string | Não | Filtrar por funcionário específico |

### Response Schema

```typescript
interface PpeManagementReportResponse {
  success: true;
  data: {
    charts: {
      byPpeItem: Array<{
        ppeItemId: string;
        ppeItemName: string;
        count: number;
        percentage: number;
      }>;
      byJobPosition: Array<{
        jobPositionId: string;
        jobPositionName: string;
        count: number;
        percentage: number;
      }>;
    };
    deliveries: Array<{
      id: string;
      date: string;
      deliveredBy: string;
      employee: {
        id: string;
        name: string;
        photoUrl: string | null;
      };
      equipment: string;
      ppeItemName: string;
      reason: string;
    }>;
    employees: Array<{
      id: string;
      name: string;
      photoUrl: string | null;
      deliveryCount: number;
    }>;
    metadata: {
      period: {
        start: string;
        end: string;
      };
      generatedAt: string;
      totalDeliveries: number;
      totalEmployees: number;
    };
  };
}
```

## Queries Necessárias

### 1. Distribuição por EPI (% de EPI)

```typescript
const byPpeItem = await db
  .select({
    ppeItemId: ppeItems.id,
    ppeItemName: ppeItems.name,
    count: count(),
  })
  .from(ppeDeliveryItems)
  .innerJoin(ppeDeliveries, eq(ppeDeliveryItems.ppeDeliveryId, ppeDeliveries.id))
  .innerJoin(ppeItems, eq(ppeDeliveryItems.ppeItemId, ppeItems.id))
  .innerJoin(employees, eq(ppeDeliveries.employeeId, employees.id))
  .where(
    and(
      eq(ppeDeliveries.organizationId, organizationId),
      gte(ppeDeliveries.deliveryDate, startDate),
      lte(ppeDeliveries.deliveryDate, endDate),
      isNull(ppeDeliveries.deletedAt),
      isNull(ppeDeliveryItems.deletedAt)
    )
  )
  .groupBy(ppeItems.id, ppeItems.name)
  .orderBy(desc(count()));
```

### 2. Distribuição por Função (% de EPI por Função)

```typescript
const byJobPosition = await db
  .select({
    jobPositionId: jobPositions.id,
    jobPositionName: jobPositions.name,
    count: count(),
  })
  .from(ppeDeliveryItems)
  .innerJoin(ppeDeliveries, eq(ppeDeliveryItems.ppeDeliveryId, ppeDeliveries.id))
  .innerJoin(employees, eq(ppeDeliveries.employeeId, employees.id))
  .innerJoin(jobPositions, eq(employees.jobPositionId, jobPositions.id))
  .where(
    and(
      eq(ppeDeliveries.organizationId, organizationId),
      gte(ppeDeliveries.deliveryDate, startDate),
      lte(ppeDeliveries.deliveryDate, endDate),
      isNull(ppeDeliveries.deletedAt),
      isNull(ppeDeliveryItems.deletedAt)
    )
  )
  .groupBy(jobPositions.id, jobPositions.name)
  .orderBy(desc(count()));
```

### 3. Lista de Entregas (Tabela GESTÃO)

```typescript
const deliveries = await db
  .select({
    id: ppeDeliveries.id,
    date: ppeDeliveries.deliveryDate,
    deliveredBy: ppeDeliveries.deliveredBy,
    employeeId: employees.id,
    employeeName: employees.name,
    employeePhotoUrl: employees.photoUrl,
    equipment: ppeItems.equipment,
    ppeItemName: ppeItems.name,
    reason: ppeDeliveries.reason,
  })
  .from(ppeDeliveryItems)
  .innerJoin(ppeDeliveries, eq(ppeDeliveryItems.ppeDeliveryId, ppeDeliveries.id))
  .innerJoin(ppeItems, eq(ppeDeliveryItems.ppeItemId, ppeItems.id))
  .innerJoin(employees, eq(ppeDeliveries.employeeId, employees.id))
  .where(
    and(
      eq(ppeDeliveries.organizationId, organizationId),
      gte(ppeDeliveries.deliveryDate, startDate),
      lte(ppeDeliveries.deliveryDate, endDate),
      isNull(ppeDeliveries.deletedAt),
      isNull(ppeDeliveryItems.deletedAt)
    )
  )
  .orderBy(desc(ppeDeliveries.deliveryDate));
```

### 4. Funcionários com Entregas (para galeria)

```typescript
const employeesWithDeliveries = await db
  .select({
    id: employees.id,
    name: employees.name,
    photoUrl: employees.photoUrl,
    deliveryCount: count(),
  })
  .from(ppeDeliveries)
  .innerJoin(employees, eq(ppeDeliveries.employeeId, employees.id))
  .where(
    and(
      eq(ppeDeliveries.organizationId, organizationId),
      gte(ppeDeliveries.deliveryDate, startDate),
      lte(ppeDeliveries.deliveryDate, endDate),
      isNull(ppeDeliveries.deletedAt)
    )
  )
  .groupBy(employees.id, employees.name, employees.photoUrl)
  .orderBy(desc(count()));
```

## Implementação

### Estrutura de Arquivos

```
src/modules/reports/ppe-management/
├── ppe-management-report.controller.ts
├── ppe-management-report.service.ts
├── ppe-management-report.model.ts
├── ppe-management-report.schemas.ts
└── ppe-management-report.test.ts
```

### Controller

```typescript
// src/modules/reports/ppe-management/ppe-management-report.controller.ts
import Elysia from "elysia";
import { authPlugin } from "@/modules/auth/auth.plugin";
import { ppeManagementReportQuerySchema } from "./ppe-management-report.schemas";
import { getPpeManagementReport } from "./ppe-management-report.service";

export const ppeManagementReportController = new Elysia({
  prefix: "/ppe-management",
  detail: { tags: ["Reports - PPE Management"] },
})
  .use(authPlugin)
  .get(
    "/",
    async ({ query, organization }) => {
      const data = await getPpeManagementReport({
        organizationId: organization.id,
        ...query,
      });

      return { success: true, data };
    },
    {
      query: ppeManagementReportQuerySchema,
      detail: {
        summary: "Get PPE management report",
        description: "Returns PPE delivery data with distribution by item and job position",
      },
      requireFeature: "reports:ppe-management",
    }
  );
```

### Schemas

```typescript
// src/modules/reports/ppe-management/ppe-management-report.schemas.ts
import { z } from "zod";

export const ppeManagementReportQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sector: z.string().optional(),
  jobPosition: z.string().optional(),
  status: z.enum(['ACTIVE', 'TERMINATED']).optional(),
  employeeId: z.string().optional(),
});

export type PpeManagementReportQuery = z.infer<typeof ppeManagementReportQuerySchema>;
```

## Considerações de Performance

1. **Índices Recomendados**:
   ```sql
   CREATE INDEX idx_ppe_deliveries_date ON ppe_deliveries(delivery_date);
   CREATE INDEX idx_ppe_deliveries_org_date ON ppe_deliveries(organization_id, delivery_date)
     WHERE deleted_at IS NULL;
   CREATE INDEX idx_ppe_delivery_items_delivery ON ppe_delivery_items(ppe_delivery_id)
     WHERE deleted_at IS NULL;
   ```

2. **Execução Paralela**: As queries de gráficos podem ser executadas em paralelo com `Promise.all`.

3. **Cache**: Cache de 10-15 minutos é aceitável para este relatório.

## Filtros Disponíveis

- **Período de Entrega**: Data inicial e final
- **Setor**: Filtrar por setor específico
- **Função**: Filtrar por função/cargo
- **Status**: Ativo ou Demitido
- **Funcionário**: Dropdown para selecionar funcionário específico

## Formato de Exportação

### PDF
- Layout paisagem
- Galeria de fotos dos funcionários
- Gráficos de pizza/donut lado a lado
- Tabela de entregas paginada

### Excel
- Aba "Por EPI": Distribuição por tipo de EPI
- Aba "Por Função": Distribuição por função
- Aba "Entregas": Lista completa de entregas
- Aba "Funcionários": Lista de funcionários com contagem

## Tabelas Relacionadas

O módulo de EPI possui as seguintes tabelas:

| Tabela | Descrição |
|--------|-----------|
| `ppe_items` | Catálogo de EPIs disponíveis |
| `ppe_deliveries` | Registro de entregas |
| `ppe_delivery_items` | Itens de cada entrega (N:N) |
| `ppe_job_positions` | EPIs obrigatórios por função |
| `ppe_delivery_logs` | Log de alterações |

## Funcionalidades Adicionais Sugeridas

### 1. Controle de Vencimento

```typescript
// Adicionar campos para controle de validade
validUntil: date("valid_until"), // Data de validade do EPI entregue
nextReplacementDate: date("next_replacement_date"), // Próxima troca programada
```

### 2. Alertas de Conformidade

- EPIs obrigatórios não entregues por função
- EPIs próximos do vencimento
- Funcionários sem entrega recente

### 3. Assinatura Digital

```typescript
// Campo para confirmação de recebimento
acknowledgedAt: timestamp("acknowledged_at"),
signatureUrl: text("signature_url"), // Assinatura digitalizada
```

## Observações

1. **Estrutura N:N**: O schema está bem modelado com relacionamento many-to-many entre entregas e itens, permitindo múltiplos EPIs por entrega.

2. **Equipamento vs EPI**: O campo `equipment` em `ppeItems` representa a categoria (ex: "NENHUM", "PROTEÇÃO AURICULAR"), enquanto `name` é o EPI específico (ex: "ÓCULOS", "OURICULAR").

3. **Entregue Por**: O campo `deliveredBy` é texto livre. Considerar transformar em FK para `users` ou `employees` para melhor rastreabilidade.

4. **EPIs por Função**: A tabela `ppe_job_positions` pode ser usada para validar conformidade (EPIs obrigatórios por cargo).

5. **NR-6**: Este relatório auxilia no cumprimento da Norma Regulamentadora 6 (Equipamento de Proteção Individual).
