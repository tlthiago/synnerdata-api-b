# Análise Consolidada - Alterações de Schema Necessárias

## Resumo Executivo

Após análise de **10 relatórios do Power BI**, identificamos as alterações necessárias no schema atual para reproduzir todos os relatórios na plataforma web.

### Cobertura Atual por Relatório

| Relatório | Disponível | Parcial | Ausente | Prioridade |
|-----------|------------|---------|---------|------------|
| Gestão DP | 100% | 0% | 0% | - |
| Folha | 93% | 7% | 0% | Baixa |
| Gestão EPI | 91% | 0% | 9% | Baixa |
| Aniversariantes | 83% | 0% | 17% | Média |
| Acidentes | 77% | 8% | 15% | Média |
| Advertências | 71% | 7% | 21% | Média |
| Demitidos | 68% | 11% | 21% | Alta |
| Atestados | 67% | 8% | 25% | Alta |
| Status | 67% | 17% | 17% | Alta |
| Faltas | 54% | 23% | 23% | **Crítica** |

**Média de cobertura: 77%**

---

## Alterações Críticas (Prioridade Máxima)

Campos ausentes que impactam **múltiplos relatórios** e são essenciais para a funcionalidade básica.

### 1. `employees.code` - Matrícula do Funcionário (Opcional)

**Impacto: 8/10 relatórios (80%)**

Campo **opcional** para matrícula/código do funcionário. Pode ser:
- **Auto-gerado** pelo sistema (ex: `EMP-0001`, `2024-0001`)
- **Inserido manualmente** pelo cliente (ex: matrícula do sistema legado)
- **Vazio** - nesse caso, usar `id` (UUID) nos relatórios

```typescript
// src/db/schema/employees.ts
code: text("code"), // Matrícula/código do funcionário (opcional)
```

**Relatórios afetados:**
- Demitidos (COD)
- Faltas (COD)
- Atestados (COD)
- Acidentes (COD)
- Aniversariantes (COD)
- Advertências (COD)
- Rank de funcionários em vários relatórios

**Lógica de exibição nos relatórios:**
```typescript
// Se code existir, usar code; senão, usar os primeiros 8 caracteres do UUID
const displayCode = employee.code || employee.id.substring(0, 8).toUpperCase();
```

**Lógica de auto-geração (opcional por organização):**
```typescript
// Configuração por organização
interface OrganizationSettings {
  autoGenerateEmployeeCode: boolean;
  employeeCodePrefix: string; // ex: "EMP", "FUNC", ""
  employeeCodeFormat: 'sequential' | 'year-sequential'; // "0001" ou "2024-0001"
}

// Geração automática
function generateEmployeeCode(org: Organization, sequence: number): string {
  const prefix = org.settings.employeeCodePrefix || 'EMP';
  const year = new Date().getFullYear();

  if (org.settings.employeeCodeFormat === 'year-sequential') {
    return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
  }
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}
```

**Migração:**
```sql
ALTER TABLE employees ADD COLUMN code TEXT;
CREATE UNIQUE INDEX employees_code_org_unique_idx ON employees(code, organization_id)
  WHERE deleted_at IS NULL AND code IS NOT NULL;
```

---

### 2. `employees.photoUrl` - URL da Foto

**Impacto: 8/10 relatórios (80%)**

```typescript
// src/db/schema/employees.ts
photoUrl: text("photo_url"),
```

**Relatórios afetados:**
- Demitidos (galeria)
- Faltas (galeria)
- Atestados (galeria)
- Acidentes (galeria)
- Status (galeria)
- Advertências (galeria)
- Gestão EPI (galeria)
- Aniversariantes (potencial)

**Migração:**
```sql
ALTER TABLE employees ADD COLUMN photo_url TEXT;
```

---

## Alterações Recomendadas (Prioridade Alta)

Campos que melhoram significativamente a qualidade dos relatórios e permitem agrupamentos corretos.

### 3. `employees.managerId` - Gestor como FK

**Impacto: 5/10 relatórios (50%)**

Atualmente `manager` é um campo texto, dificultando agrupamentos e joins.

```typescript
// src/db/schema/employees.ts
// Remover:
// manager: text("manager"),

// Adicionar:
managerId: text("manager_id").references(() => employees.id),
```

**Relatórios afetados:**
- Gestão DP (por gestor)
- Acidentes (por gestor)
- Folha (% por gestor)
- Advertências (por gestor)
- Faltas (por gestor)

**Migração:**
```sql
-- 1. Adicionar nova coluna
ALTER TABLE employees ADD COLUMN manager_id TEXT REFERENCES employees(id);

-- 2. Criar índice
CREATE INDEX employees_manager_id_idx ON employees(manager_id);

-- 3. Migrar dados (se possível mapear nomes para IDs)
-- UPDATE employees e1 SET manager_id = e2.id
-- FROM employees e2 WHERE e1.manager = e2.name AND e1.organization_id = e2.organization_id;

-- 4. Manter campo antigo temporariamente para compatibilidade
-- ALTER TABLE employees DROP COLUMN manager; (após migração completa)
```

---

### 4. `medical_certificates.type` - Tipo de Atestado

**Impacto: 2/10 relatórios (20%)**

Necessário para distinguir atestados comuns de afastamentos INSS.

```typescript
// src/db/schema/medical-certificates.ts
export const medicalCertificateTypeEnum = pgEnum("medical_certificate_type", [
  "REGULAR",      // Atestado comum (até 15 dias)
  "INSS",         // Afastamento INSS (> 15 dias)
]);

// Adicionar campo
type: medicalCertificateTypeEnum("type").default("REGULAR").notNull(),
```

**Relatórios afetados:**
- Status (AFASTADO INSS)
- Atestados (categorização)

**Migração:**
```sql
CREATE TYPE medical_certificate_type AS ENUM ('REGULAR', 'INSS');
ALTER TABLE medical_certificates ADD COLUMN type medical_certificate_type DEFAULT 'REGULAR' NOT NULL;
-- Atualizar registros existentes baseado em daysOff > 15
UPDATE medical_certificates SET type = 'INSS' WHERE days_off > 15;
```

---

## Alterações Opcionais (Prioridade Média)

Campos que agregam valor mas podem ser implementados em fases posteriores.

### 5. Enums de Categorização para Ocorrências

#### 5.1 `absences.reasonCategory` - Categoria de Falta

```typescript
// src/db/schema/absences.ts
export const absenceReasonCategoryEnum = pgEnum("absence_reason_category", [
  "UNJUSTIFIED",        // Injustificada
  "JUSTIFIED",          // Justificada
  "MEDICAL",            // Médica
  "LEGAL",              // Legal (júri, eleição, etc.)
  "BEREAVEMENT",        // Luto
  "OTHER",              // Outra
]);

reasonCategory: absenceReasonCategoryEnum("reason_category"),
```

#### 5.2 `absences.type` como Enum

```typescript
// src/db/schema/absences.ts
export const absenceTypeEnum = pgEnum("absence_type", [
  "FULL_DAY",           // Dia inteiro
  "PARTIAL",            // Parcial
  "LATE_ARRIVAL",       // Atraso
  "EARLY_DEPARTURE",    // Saída antecipada
]);

// Alterar campo existente de text para enum
type: absenceTypeEnum("type").notNull(),
```

#### 5.3 `terminations.reasonCategory` - Categoria de Demissão

```typescript
// src/db/schema/terminations.ts
export const terminationReasonCategoryEnum = pgEnum("termination_reason_category", [
  "VOLUNTARY",          // Voluntária
  "INVOLUNTARY",        // Involuntária
  "MUTUAL_AGREEMENT",   // Acordo mútuo
  "CONTRACT_END",       // Fim de contrato
  "RETIREMENT",         // Aposentadoria
  "DEATH",              // Óbito
]);

reasonCategory: terminationReasonCategoryEnum("reason_category"),
```

#### 5.4 `warnings.reasonCategory` - Categoria de Advertência

```typescript
// src/db/schema/warnings.ts
export const warningReasonCategoryEnum = pgEnum("warning_reason_category", [
  "INDISCIPLINA",
  "ATRASO",
  "FALTA_INJUSTIFICADA",
  "INSUBORDINACAO",
  "MAU_COMPORTAMENTO",
  "NEGLIGENCIA",
  "OTHER",
]);

reasonCategory: warningReasonCategoryEnum("reason_category"),
```

#### 5.5 `medical_certificates.diagnosisCategory` - Categoria de Diagnóstico

```typescript
// src/db/schema/medical-certificates.ts
export const diagnosisCategoryEnum = pgEnum("diagnosis_category", [
  "RESPIRATORY",        // Respiratório
  "MUSCULOSKELETAL",    // Musculoesquelético
  "GASTROINTESTINAL",   // Gastrointestinal
  "MENTAL_HEALTH",      // Saúde mental
  "CARDIOVASCULAR",     // Cardiovascular
  "OTHER",              // Outros
]);

diagnosisCategory: diagnosisCategoryEnum("diagnosis_category"),
```

---

### 6. `employees.hasBasketAllowance` - Cesta Básica

**Impacto: 1/10 relatórios**

```typescript
// src/db/schema/employees.ts
hasBasketAllowance: boolean("has_basket_allowance").default(false).notNull(),
```

**Relatório afetado:**
- Faltas (indicador de cesta básica)

---

### 7. `terminations.laborReason` - Motivo Trabalhista

**Impacto: 1/10 relatórios**

```typescript
// src/db/schema/terminations.ts
laborReason: text("labor_reason"), // Motivo formal para documentação trabalhista
```

**Relatório afetado:**
- Demitidos (detalhamento do motivo)

---

## Resumo de Alterações por Tabela

### `employees`

| Campo | Tipo | Prioridade | Impacto |
|-------|------|------------|---------|
| `code` | text (opcional) | Alta | 8 relatórios |
| `photoUrl` | text | **Crítica** | 8 relatórios |
| `managerId` | text FK | Alta | 5 relatórios |
| `hasBasketAllowance` | boolean | Baixa | 1 relatório |

```typescript
// Alterações consolidadas em employees.ts
code: text("code"), // Opcional - auto-gerado ou manual
photoUrl: text("photo_url"),
managerId: text("manager_id").references(() => employees.id),
hasBasketAllowance: boolean("has_basket_allowance").default(false).notNull(),
```

### `medical_certificates`

| Campo | Tipo | Prioridade | Impacto |
|-------|------|------------|---------|
| `type` | enum | Alta | 2 relatórios |
| `diagnosisCategory` | enum | Média | 1 relatório |

### `absences`

| Campo | Tipo | Prioridade | Impacto |
|-------|------|------------|---------|
| `reasonCategory` | enum | Média | 1 relatório |
| `type` (alterar para enum) | enum | Média | 1 relatório |

### `terminations`

| Campo | Tipo | Prioridade | Impacto |
|-------|------|------------|---------|
| `reasonCategory` | enum | Média | 1 relatório |
| `laborReason` | text | Baixa | 1 relatório |

### `warnings`

| Campo | Tipo | Prioridade | Impacto |
|-------|------|------------|---------|
| `reasonCategory` | enum | Média | 1 relatório |

---

## Plano de Implementação Sugerido

### Fase 1 - Crítico (Semana 1-2)

1. **Adicionar `employees.code`**
   - Criar migração
   - Definir estratégia de preenchimento inicial
   - Atualizar endpoints de CRUD

2. **Adicionar `employees.photoUrl`**
   - Criar migração
   - Implementar upload de fotos (se necessário)
   - Atualizar endpoints de CRUD

### Fase 2 - Alta Prioridade (Semana 3-4)

3. **Refatorar `employees.manager` para `managerId`**
   - Criar migração com estratégia de rollback
   - Mapear dados existentes
   - Atualizar queries nos relatórios

4. **Adicionar `medical_certificates.type`**
   - Criar enum e migração
   - Lógica de categorização automática (daysOff > 15)

### Fase 3 - Melhorias (Semana 5+)

5. **Adicionar enums de categorização**
   - `absences.reasonCategory`
   - `terminations.reasonCategory`
   - `warnings.reasonCategory`
   - `medical_certificates.diagnosisCategory`

6. **Campos opcionais**
   - `employees.hasBasketAllowance`
   - `terminations.laborReason`

---

## Índices Recomendados

Para otimizar as queries dos relatórios:

```sql
-- Employees
CREATE INDEX idx_employees_code ON employees(code) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_manager_id ON employees(manager_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_birth_month ON employees(organization_id, EXTRACT(MONTH FROM birth_date)) WHERE deleted_at IS NULL AND status = 'ACTIVE';

-- Medical Certificates
CREATE INDEX idx_medical_certificates_type ON medical_certificates(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_medical_certificates_active ON medical_certificates(organization_id, start_date, end_date) WHERE deleted_at IS NULL;

-- Absences
CREATE INDEX idx_absences_reason_category ON absences(reason_category) WHERE deleted_at IS NULL;

-- Warnings
CREATE INDEX idx_warnings_reason ON warnings(reason) WHERE deleted_at IS NULL;

-- Vacations
CREATE INDEX idx_vacations_active ON vacations(organization_id, status, start_date, end_date) WHERE deleted_at IS NULL AND status = 'in_progress';
```

---

## Conclusão

Com as alterações de **Fase 1 e 2**, a cobertura média dos relatórios aumentará de **77% para ~95%**.

As alterações críticas (`employees.code` e `employees.photoUrl`) são **bloqueadoras** para a maioria dos relatórios e devem ser priorizadas.

A refatoração de `manager` para FK é **altamente recomendada** para garantir integridade referencial e facilitar agrupamentos nos relatórios.
