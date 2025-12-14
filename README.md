# Synnerdata API

> API Backend para plataforma SaaS B2B de gestão de Departamento Pessoal.

## Contexto de Negócio

Synnerdata é uma plataforma que permite empresas centralizarem dados do departamento pessoal, incluindo:

### Estrutura Organizacional
- **Organizações** - Empresas clientes (cada empresa = uma organização)
- **Filiais** - Unidades da empresa
- **Setores** - Departamentos internos
- **Centros de Custo** - Alocação financeira
- **Projetos** - Agrupamento de trabalho

### Configurações de DP
- **CBOs** - Classificação Brasileira de Ocupações
- **EPIs** - Equipamentos de Proteção Individual
- **Funções/Cargos** - Posições na empresa

### Funcionários e Ocorrências
- **Funcionários** - Cadastro completo com dados pessoais e contratuais
- **Advertências** - Registros disciplinares
- **Acidentes** - Acidentes de trabalho
- **Ações Trabalhistas** - Processos judiciais
- **Análises de CPF** - Background checks
- **Atestados Médicos** - Afastamentos por saúde
- **Entregas de EPI** - Controle de equipamentos
- **Faltas** - Ausências não justificadas
- **Férias** - Períodos de descanso
- **Promoções** - Progressão de carreira
- **Rescisões** - Desligamentos

---

## Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Runtime | [Bun](https://bun.sh) | latest |
| Framework | [Elysia](https://elysiajs.com) | latest |
| Auth | [Better Auth](https://better-auth.com) | ^1.4.5 |
| ORM | [Drizzle](https://orm.drizzle.team) | ^0.45.0 |
| Database | PostgreSQL | 16+ |
| Validation | [Zod](https://zod.dev) | ^4.1.13 |
| Testes Unit | Bun Test | built-in |
| Testes E2E | [Playwright](https://playwright.dev) | ^1.57.0 |
| Linting | [Biome](https://biomejs.dev) via Ultracite | ^2.3.8 |

---

## Estrutura do Projeto

```
src/
├── db/                         # Database (Drizzle ORM)
│   ├── schema/                 # Definições de tabelas
│   ├── migrations/             # Migrations SQL
│   └── index.ts                # Conexão e exports
│
├── lib/                        # Infraestrutura compartilhada
│   ├── errors/                 # Sistema de erros
│   ├── responses/              # Tipos de resposta padronizados
│   ├── auth-plugin.ts          # Plugin Better Auth para Elysia
│   ├── auth.ts                 # Configuração Better Auth
│   ├── permissions.ts          # Sistema de permissões
│   ├── email.ts                # Serviço de email (Nodemailer)
│   └── cron-plugin.ts          # Jobs agendados
│
├── modules/                    # Módulos de domínio
│   ├── auth/                   # Autenticação
│   └── payments/               # Sistema de pagamentos (Pagar.me)
│
├── test/                       # Helpers e fixtures de teste
│   ├── fixtures/               # Dados de teste
│   └── helpers/                # Utilitários para testes
│
├── env.ts                      # Variáveis de ambiente tipadas
└── index.ts                    # Entry point da aplicação
```

---

## Comandos

```bash
# Desenvolvimento
bun run dev              # Servidor com hot reload

# Database
bun run db:start         # Iniciar PostgreSQL (Docker)
bun run db:push          # Aplicar schema
bun run db:generate      # Gerar migration
bun run db:migrate       # Rodar migrations
bun run db:studio        # Drizzle Studio (GUI)

# Testes
bun test                 # Testes unitários
bun run test:e2e         # Testes E2E (Playwright)

# Qualidade
npx ultracite check      # Verificar lint/format
npx ultracite fix        # Corrigir lint/format
```

---

## Variáveis de Ambiente

```bash
# Server
PORT=3000
CORS_ORIGIN=http://localhost:3001

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/synnerdata

# Auth (Better Auth)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000

# Payments (Pagar.me)
PAGARME_SECRET_KEY=sk_...
PAGARME_BASE_URL=https://api.pagar.me/core/v5
PAGARME_WEBHOOK_USERNAME=
PAGARME_WEBHOOK_PASSWORD=

# Email
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

---

## Módulos Planejados

| Domínio | Módulo | Status |
|---------|--------|--------|
| organization | organization | Planejado |
| organization | branches | Planejado |
| organization | departments | Planejado |
| organization | cost-centers | Planejado |
| organization | projects | Planejado |
| hr-config | cbo | Planejado |
| hr-config | ppe | Planejado |
| hr-config | positions | Planejado |
| employees | employee | Planejado |
| employees | documents | Planejado |
| occurrences | warnings | Planejado |
| occurrences | accidents | Planejado |
| occurrences | lawsuits | Planejado |
| occurrences | background-checks | Planejado |
| occurrences | medical-leaves | Planejado |
| occurrences | ppe-deliveries | Planejado |
| occurrences | absences | Planejado |
| occurrences | vacations | Planejado |
| occurrences | promotions | Planejado |
| occurrences | terminations | Planejado |

---

## Documentação

| Documento | Descrição |
|-----------|-----------|
| [`docs/code-standards/module-code-standards.md`](./docs/code-standards/module-code-standards.md) | Padrões de código para módulos (Controller, Service, Model, Erros) |
| [`docs/code-standards/testing-standards.md`](./docs/code-standards/testing-standards.md) | Padrões de testes (Unit, Integration, E2E) |
| [`docs/improvements/api-maturity-plan.md`](./docs/improvements/api-maturity-plan.md) | Plano de melhorias da API |
| [`docs/payments-module-status.md`](./docs/payments-module-status.md) | Status do módulo de pagamentos |

---

## Para Agentes de IA

### Contexto Rápido

1. **Domínio**: SaaS B2B para gestão de Departamento Pessoal brasileiro
2. **Arquitetura**: Módulos feature-based com Controller/Service/Model
3. **Auth**: Better Auth com plugin de organizations (uma org por empresa)
4. **DB**: PostgreSQL com Drizzle ORM (Select API, não Query API)
5. **Validação**: Zod com schemas tipados
6. **Responses**: Sempre com envelope `{ success, data/error }`

### Ao Criar Novos Módulos

1. **Seguir padrões de código**: [`docs/code-standards/module-code-standards.md`](./docs/code-standards/module-code-standards.md)
2. **Seguir padrões de testes**: [`docs/code-standards/testing-standards.md`](./docs/code-standards/testing-standards.md)
3. Usar `betterAuthPlugin` com `auth: { permissions, requireOrganization }`
4. IDs com formato `{prefix}-${Bun.randomUUIDv7()}`
5. Erros de domínio em `errors.ts` do domínio pai
6. Sempre filtrar por `organizationId` nas queries
7. Incluir soft delete columns em tabelas de domínio

### Arquivos de Referência

| Tipo | Arquivo |
|------|---------|
| Controller | `src/modules/payments/subscription/index.ts` |
| Service | `src/modules/payments/subscription/subscription.service.ts` |
| Model | `src/modules/payments/checkout/checkout.model.ts` |
| Erros | `src/modules/payments/errors.ts` |
