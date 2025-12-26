# Funcionalidades Futuras

> **Criado em:** 2025-12-26
> **Status:** Backlog para discussão

Este documento lista funcionalidades potenciais que podem ser implementadas após a conclusão da migração do projeto antigo.

---

## Resumo

| Funcionalidade | Prioridade | Complexidade | Status |
|----------------|------------|--------------|--------|
| Import Excel de Funcionários | 🔴 Alta | Média | ⏳ Pendente |
| Métodos de Busca (Employees) | 🔴 Alta | Baixa | ⏳ Pendente |
| Integração eSocial | Alta | Alta | ⏳ Pendente |
| Relatórios/Dashboard | Média | Média | ⏳ Pendente |
| Upload de Documentos | Média | Média | ⏳ Pendente |
| Exportação Excel/PDF | Baixa | Baixa | ⏳ Pendente |
| Notificações/Alertas | Baixa | Média | ⏳ Pendente |

---

## 1. Import Excel de Funcionários

**Prioridade:** 🔴 Alta
**Complexidade:** Média
**Origem:** Projeto antigo (NestJS)

### Descrição

Importação em massa de funcionários através de arquivo Excel (.xlsx). Funcionalidade existente no projeto antigo que não foi migrada.

### Funcionalidades do Projeto Antigo

- `importXlsx()` - Método para processar arquivo Excel
- Template com 48 colunas para download
- Validação de headers obrigatórios/opcionais
- FileInterceptor para upload de arquivos

### Requisitos

- [ ] Endpoint para download de template Excel
- [ ] Endpoint para upload e processamento do arquivo
- [ ] Validação de formato e headers
- [ ] Validação de dados (CPF, datas, enums)
- [ ] Relatório de erros por linha
- [ ] Transação para rollback em caso de erro
- [ ] Limite de linhas por importação

### Endpoints

```text
GET  /v1/employees/import/template  - Download template Excel
POST /v1/employees/import           - Upload e processamento
```

### Bibliotecas Sugeridas

- **ExcelJS** - Leitura/escrita de arquivos Excel

---

## 2. Métodos de Busca (Employees)

**Prioridade:** 🔴 Alta
**Complexidade:** Baixa
**Origem:** Projeto antigo (NestJS)

### Descrição

Métodos auxiliares de busca no serviço de Employees que existiam no projeto antigo.

### Métodos Faltantes

| Método | Descrição | Uso |
|--------|-----------|-----|
| `findByCpf(cpf)` | Busca funcionário por CPF | Validação de duplicidade, integração |
| `findByIds(ids[])` | Busca múltiplos funcionários | Operações em lote, relatórios |
| `findByEmail(email)` | Busca funcionário por email | Integração com auth |

### Implementação Sugerida

```typescript
// employee.service.ts

static async findByCpf(
  db: Database,
  organizationId: string,
  cpf: string
): Promise<Employee | null> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        eq(employees.cpf, cpf),
        isNull(employees.deletedAt)
      )
    )
    .limit(1);
  return employee ?? null;
}

static async findByIds(
  db: Database,
  organizationId: string,
  ids: string[]
): Promise<Employee[]> {
  return db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        inArray(employees.id, ids),
        isNull(employees.deletedAt)
      )
    );
}
```

---

## 3. Integração eSocial

**Prioridade:** Alta (compliance)
**Complexidade:** Alta
**Origem:** Nova funcionalidade

### Descrição
Integração com o sistema eSocial do governo brasileiro para envio automático de eventos trabalhistas.

### Eventos Potenciais
- S-2200: Cadastramento inicial de funcionário
- S-2206: Alterações contratuais
- S-2210: Comunicação de Acidente de Trabalho (CAT)
- S-2230: Afastamentos temporários
- S-2299: Desligamento
- S-2300: Trabalhadores sem vínculo

### Requisitos
- [ ] Certificado digital A1/A3
- [ ] Mapeamento de campos para layout eSocial
- [ ] Fila de eventos com retry
- [ ] Log de transmissões
- [ ] Consulta de status de eventos

### Módulos Afetados
- Employees (cadastro, alterações, desligamento)
- Accidents (CAT)
- Medical Certificates (afastamentos)
- Vacations (afastamentos)

---

## 4. Relatórios e Dashboard

**Prioridade:** Média
**Complexidade:** Média

### Descrição
Agregações e métricas para visualização gerencial dos dados de RH.

### Relatórios Sugeridos

#### Funcionários
- Total por status (ativos, afastados, demitidos)
- Distribuição por setor/filial
- Turnover mensal/anual
- Tempo médio de empresa

#### Ocorrências
- Faltas por período (justificadas vs injustificadas)
- Atestados por CID
- Férias vencidas/a vencer
- Advertências por tipo

#### SST (Saúde e Segurança)
- Acidentes por período/tipo
- Taxa de frequência e gravidade
- EPIs entregues vs pendentes
- Validade de EPIs

#### Jurídico
- Ações trabalhistas por status
- Valores provisionados vs pagos
- Processos por tipo

### Implementação
- [ ] Endpoints de agregação (`/v1/reports/*`)
- [ ] Cache de relatórios pesados
- [ ] Filtros por período, filial, setor

---

## 5. Upload de Documentos

**Prioridade:** Média
**Complexidade:** Média

### Descrição
Sistema de upload e armazenamento de documentos relacionados aos módulos.

### Tipos de Documentos

| Módulo | Documentos |
|--------|------------|
| Employees | Foto, RG, CPF, CTPS, contrato |
| Medical Certificates | Atestado digitalizado |
| Accidents | CAT, laudos médicos |
| PPE Deliveries | Termo de entrega assinado |
| Warnings | Advertência assinada |
| Terminations | Termo de rescisão, homologação |
| Labor Lawsuits | Petições, sentenças, acordos |

### Requisitos Técnicos
- [ ] Storage: S3/R2/MinIO
- [ ] Limite de tamanho por arquivo
- [ ] Tipos permitidos (PDF, JPG, PNG)
- [ ] Compressão de imagens
- [ ] Antivírus/validação de arquivos
- [ ] URLs assinadas com expiração

### Estrutura de Pastas
```
/{organizationId}/{module}/{resourceId}/{filename}
```

---

## 6. Exportação Excel/PDF

**Prioridade:** Baixa
**Complexidade:** Baixa

### Descrição
Exportação de listagens e relatórios em formatos Excel e PDF.

### Funcionalidades
- [ ] Exportar listagem de funcionários
- [ ] Exportar relatório de férias
- [ ] Exportar histórico de EPIs por funcionário
- [ ] Exportar relatório de acidentes
- [ ] Exportar ficha de registro de funcionário

### Bibliotecas Sugeridas
- **Excel:** ExcelJS ou SheetJS
- **PDF:** PDFKit ou Puppeteer

### Endpoints
```
GET /v1/employees/export?format=xlsx
GET /v1/employees/export?format=pdf
GET /v1/reports/vacations/export?format=xlsx
```

---

## 7. Notificações e Alertas

**Prioridade:** Baixa
**Complexidade:** Média

### Descrição
Sistema de notificações para eventos importantes do RH.

### Alertas Sugeridos

| Evento | Antecedência | Canal |
|--------|--------------|-------|
| Férias vencendo | 30 dias | Email |
| Contrato de experiência vencendo | 15 dias | Email |
| EPI a vencer | 30 dias | Email |
| Aniversário de funcionário | No dia | Email |
| Prazo de processo trabalhista | 7 dias | Email |

### Requisitos
- [ ] Cron jobs para verificação diária
- [ ] Templates de email
- [ ] Configuração de preferências por usuário
- [ ] Log de notificações enviadas
- [ ] Opção de desativar notificações

### Canais Futuros
- Push notifications (web/mobile)
- WhatsApp Business API
- Slack/Teams webhooks

---

## Notas de Implementação

### Ordem Sugerida de Implementação

1. **Métodos de Busca (Employees)** - Baixa complexidade, útil para outras funcionalidades
2. **Import Excel de Funcionários** - Alta prioridade, existia no projeto antigo
3. **Exportação Excel/PDF** - Menor complexidade, valor imediato
4. **Upload de Documentos** - Infraestrutura reutilizável
5. **Relatórios/Dashboard** - Depende de dados acumulados
6. **Notificações** - Nice-to-have
7. **eSocial** - Maior complexidade, requer especialista

### Considerações Técnicas

- Todas as funcionalidades devem respeitar o multi-tenancy (organizationId)
- Permissões devem ser verificadas para cada operação
- Logs de auditoria para operações sensíveis
- Rate limiting para endpoints de exportação/relatórios

---

## Histórico

| Data | Ação |
|------|------|
| 2025-12-26 | Adicionado: Import Excel, Métodos de Busca (análise projeto antigo) |
| 2025-12-26 | Documento criado após conclusão da migração |
