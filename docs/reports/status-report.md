# Relatório de Status (STATUS)

## Visão Geral

Relatório consolidado que apresenta uma visão em tempo real do status de todos os funcionários da organização, combinando dados de férias, atestados médicos e afastamentos INSS para determinar a situação atual de cada colaborador.

## Análise de Disponibilidade de Dados

### KPIs

| KPI | Campo/Cálculo Necessário | Status | Observação |
|-----|-------------------------|--------|------------|
| Total Func. | `COUNT(employees.id)` | ✅ Disponível | Funcionários ativos |
| Em Férias | Férias ativa no período | ✅ Disponível | `vacations` com `status = 'in_progress'` |
| Afastado INSS | Atestado INSS ativo | ⚠️ Parcial | Falta campo `type` ou `isInss` |
| Trabalhando | Total - Férias - INSS | ✅ Disponível | Cálculo derivado |

### Galeria de Fotos

| Componente | Campo Necessário | Status |
|------------|------------------|--------|
| Foto funcionário | `employees.photoUrl` | ❌ Ausente |

### Tabela STATUS

| Coluna | Campo Necessário | Status |
|--------|------------------|--------|
| ID | `employees.code` | ✅ Disponível |
| Funcionários | `employees.name` | ✅ Disponível |
| Inicio Atestado | `medical_certificates.startDate` | ✅ Disponível |
| Fim Atestado | `medical_certificates.endDate` | ✅ Disponível |
| Início Férias | `vacations.startDate` | ✅ Disponível |
| Fim Férias | `vacations.endDate` | ✅ Disponível |
| Status | Calculado | ⚠️ Parcial |

### Resumo de Disponibilidade

| Status | Quantidade | Percentual |
|--------|------------|------------|
| ✅ Disponível | 8 | 67% |
| ⚠️ Parcial | 2 | 17% |
| ❌ Ausente | 2 | 17% |

## Alterações de Schema Necessárias

### 1. Adicionar campo `photoUrl` em employees

```typescript
// src/db/schema/employees.ts
photoUrl: text("photo_url"),
```

### 2. Adicionar tipo de atestado médico

```typescript
// src/db/schema/medical-certificates.ts
export const medicalCertificateTypeEnum = pgEnum("medical_certificate_type", [
  "REGULAR",      // Atestado comum (até 15 dias)
  "INSS",         // Afastamento INSS (> 15 dias)
]);

// Adicionar campo na tabela
type: medicalCertificateTypeEnum("type").default("REGULAR").notNull(),
```

**Alternativa**: Calcular automaticamente baseado em `daysOff > 15`.

## Lógica de Cálculo de Status

O status de cada funcionário é determinado pela seguinte hierarquia:

```typescript
function calculateEmployeeStatus(
  employee: Employee,
  activeVacation: Vacation | null,
  activeMedicalCertificate: MedicalCertificate | null
): EmployeeStatus {
  const today = new Date();

  // Prioridade 1: Afastamento INSS
  if (activeMedicalCertificate) {
    const isInss = activeMedicalCertificate.type === 'INSS'
      || activeMedicalCertificate.daysOff > 15;
    if (isInss) {
      return 'AFASTADO_INSS';
    }
  }

  // Prioridade 2: Férias
  if (activeVacation && activeVacation.status === 'in_progress') {
    return 'EM_FERIAS';
  }

  // Prioridade 3: Atestado comum (opcional, não mostrado no Power BI)
  if (activeMedicalCertificate) {
    return 'AFASTADO_ATESTADO';
  }

  // Default
  return 'TRABALHANDO';
}
```

## Estrutura do Endpoint

### Rota

```
GET /api/v1/reports/status
```

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| referenceDate | string (ISO) | Não | Data de referência (default: hoje) |
| sector | string | Não | Filtrar por setor |
| manager | string | Não | Filtrar por gestor |

### Response Schema

```typescript
interface StatusReportResponse {
  success: true;
  data: {
    kpis: {
      totalEmployees: number;
      onVacation: number;
      onInssLeave: number;
      working: number;
    };
    employees: Array<{
      id: string;
      code: string;
      name: string;
      photoUrl: string | null;
      status: 'TRABALHANDO' | 'EM_FERIAS' | 'AFASTADO_INSS' | 'AFASTADO_ATESTADO';
      medicalCertificate: {
        startDate: string;
        endDate: string;
      } | null;
      vacation: {
        startDate: string;
        endDate: string;
      } | null;
    }>;
    metadata: {
      referenceDate: string;
      generatedAt: string;
      totalRecords: number;
    };
  };
}
```

## Queries Necessárias

### 1. Funcionários Ativos com Status

```typescript
const today = new Date().toISOString().split('T')[0];

// Query principal: todos os funcionários ativos
const employeesData = await db
  .select({
    id: employees.id,
    code: employees.code,
    name: employees.name,
    photoUrl: employees.photoUrl,
  })
  .from(employees)
  .where(
    and(
      eq(employees.organizationId, organizationId),
      eq(employees.status, 'active'),
      isNull(employees.deletedAt)
    )
  );
```

### 2. Férias Ativas

```typescript
const activeVacations = await db
  .select({
    employeeId: vacations.employeeId,
    startDate: vacations.startDate,
    endDate: vacations.endDate,
  })
  .from(vacations)
  .where(
    and(
      eq(vacations.organizationId, organizationId),
      eq(vacations.status, 'in_progress'),
      lte(vacations.startDate, today),
      gte(vacations.endDate, today),
      isNull(vacations.deletedAt)
    )
  );
```

### 3. Atestados Ativos

```typescript
const activeCertificates = await db
  .select({
    employeeId: medicalCertificates.employeeId,
    startDate: medicalCertificates.startDate,
    endDate: medicalCertificates.endDate,
    daysOff: medicalCertificates.daysOff,
    type: medicalCertificates.type, // se existir
  })
  .from(medicalCertificates)
  .where(
    and(
      eq(medicalCertificates.organizationId, organizationId),
      lte(medicalCertificates.startDate, today),
      gte(medicalCertificates.endDate, today),
      isNull(medicalCertificates.deletedAt)
    )
  );
```

### 4. Consolidação dos Dados

```typescript
// Criar maps para lookup rápido
const vacationMap = new Map(
  activeVacations.map(v => [v.employeeId, v])
);
const certificateMap = new Map(
  activeCertificates.map(c => [c.employeeId, c])
);

// Calcular status de cada funcionário
const employeesWithStatus = employeesData.map(emp => {
  const vacation = vacationMap.get(emp.id);
  const certificate = certificateMap.get(emp.id);

  let status: EmployeeStatus = 'TRABALHANDO';

  if (certificate && (certificate.type === 'INSS' || certificate.daysOff > 15)) {
    status = 'AFASTADO_INSS';
  } else if (vacation) {
    status = 'EM_FERIAS';
  } else if (certificate) {
    status = 'AFASTADO_ATESTADO';
  }

  return {
    ...emp,
    status,
    medicalCertificate: certificate ? {
      startDate: certificate.startDate,
      endDate: certificate.endDate,
    } : null,
    vacation: vacation ? {
      startDate: vacation.startDate,
      endDate: vacation.endDate,
    } : null,
  };
});

// Calcular KPIs
const kpis = {
  totalEmployees: employeesWithStatus.length,
  onVacation: employeesWithStatus.filter(e => e.status === 'EM_FERIAS').length,
  onInssLeave: employeesWithStatus.filter(e => e.status === 'AFASTADO_INSS').length,
  working: employeesWithStatus.filter(e => e.status === 'TRABALHANDO').length,
};
```

## Implementação

### Estrutura de Arquivos

```
src/modules/reports/status/
├── status-report.controller.ts
├── status-report.service.ts
├── status-report.model.ts
├── status-report.schemas.ts
└── status-report.test.ts
```

### Controller

```typescript
// src/modules/reports/status/status-report.controller.ts
import Elysia from "elysia";
import { authPlugin } from "@/modules/auth/auth.plugin";
import { statusReportQuerySchema } from "./status-report.schemas";
import { getStatusReport } from "./status-report.service";

export const statusReportController = new Elysia({
  prefix: "/status",
  detail: { tags: ["Reports - Status"] },
})
  .use(authPlugin)
  .get(
    "/",
    async ({ query, organization }) => {
      const data = await getStatusReport({
        organizationId: organization.id,
        ...query,
      });

      return { success: true, data };
    },
    {
      query: statusReportQuerySchema,
      detail: {
        summary: "Get employee status report",
        description: "Returns real-time status of all employees",
      },
      requireFeature: "reports:status",
    }
  );
```

### Schemas

```typescript
// src/modules/reports/status/status-report.schemas.ts
import { z } from "zod";

export const statusReportQuerySchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sector: z.string().optional(),
  manager: z.string().optional(),
});

export type StatusReportQuery = z.infer<typeof statusReportQuerySchema>;

export const employeeStatusEnum = z.enum([
  'TRABALHANDO',
  'EM_FERIAS',
  'AFASTADO_INSS',
  'AFASTADO_ATESTADO',
]);

export type EmployeeStatus = z.infer<typeof employeeStatusEnum>;
```

## Considerações de Performance

1. **Índices Recomendados**:
   ```sql
   -- Vacations
   CREATE INDEX idx_vacations_active ON vacations(organization_id, status, start_date, end_date)
     WHERE deleted_at IS NULL AND status = 'in_progress';

   -- Medical Certificates
   CREATE INDEX idx_medical_certificates_active ON medical_certificates(organization_id, start_date, end_date)
     WHERE deleted_at IS NULL;
   ```

2. **Execução Paralela**: As queries de funcionários, férias e atestados podem ser executadas em paralelo com `Promise.all`.

3. **Cache**: Cache curto (1-5 minutos) pois os dados mudam frequentemente.

## Filtros Disponíveis

- **Data de Referência**: Permite ver status em uma data específica (histórico)
- **Setor**: Filtrar por setor
- **Gestor**: Filtrar por gestor

## Formato de Exportação

### PDF
- Layout retrato
- KPIs em cards no topo
- Galeria de fotos dos funcionários
- Tabela com status detalhado

### Excel
- Aba "Resumo": KPIs
- Aba "Funcionários": Lista completa com status

## Regras de Negócio - INSS

No Brasil, a legislação trabalhista define:

1. **Atestado Comum (até 15 dias)**: Responsabilidade da empresa
2. **Afastamento INSS (> 15 dias)**: A partir do 16º dia, o INSS assume o pagamento

### Implementação Sugerida

```typescript
// Opção 1: Campo explícito (recomendado para controle manual)
type: medicalCertificateTypeEnum("type")

// Opção 2: Cálculo automático
function isInssLeave(certificate: MedicalCertificate): boolean {
  return certificate.daysOff > 15;
}

// Opção 3: Híbrido (campo com default calculado)
// O usuário pode override manualmente se necessário
```

## Observações

1. **Tempo Real**: Este relatório mostra dados em tempo real, não históricos. Para análise histórica, usar data de referência.

2. **Prioridade de Status**: A ordem de verificação é importante:
   - AFASTADO_INSS > EM_FERIAS > TRABALHANDO

3. **Funcionários Demitidos**: Não aparecem neste relatório (apenas `status = 'active'`).

4. **Múltiplas Ocorrências**: Se um funcionário tiver férias E atestado simultâneos, o status INSS tem prioridade.
