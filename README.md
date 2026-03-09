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
│   ├── auth/                   # Autenticação (Email OTP, roles, trial lifecycle)
│   ├── organizations/          # Estrutura organizacional
│   │   ├── profile/            # Perfil e dados fiscais da organização
│   │   ├── branches/           # Filiais
│   │   ├── sectors/            # Setores/departamentos
│   │   ├── cost-centers/       # Centros de custo
│   │   ├── job-positions/      # Cargos
│   │   ├── job-classifications/ # CBOs
│   │   ├── projects/           # Projetos com alocação de funcionários
│   │   └── ppe-items/          # Catálogo de EPIs
│   ├── employees/              # Cadastro e gestão de funcionários
│   ├── occurrences/            # Eventos de funcionários
│   │   ├── absences/           # Ausências
│   │   ├── accidents/          # Acidentes de trabalho
│   │   ├── vacations/          # Férias
│   │   ├── medical-certificates/ # Atestados médicos
│   │   ├── warnings/           # Advertências disciplinares
│   │   ├── terminations/       # Desligamentos
│   │   ├── ppe-deliveries/     # Entregas de EPI
│   │   ├── labor-lawsuits/     # Processos trabalhistas
│   │   ├── promotions/         # Promoções
│   │   └── cpf-analyses/       # Análises de CPF
│   ├── payments/               # Sistema de pagamentos (Pagar.me)
│   │   ├── plans/              # Planos e pricing tiers
│   │   ├── checkout/           # Sessões de pagamento
│   │   ├── subscription/       # Lifecycle de assinaturas
│   │   ├── plan-change/        # Upgrades e downgrades
│   │   ├── billing/            # Perfil de cobrança, faturas, cartões
│   │   ├── webhook/            # Eventos Pagar.me
│   │   ├── customer/           # Clientes do provedor
│   │   └── jobs/               # Jobs agendados
│   ├── audit/                  # Log de ações para compliance
│   └── api-keys/               # Chaves de API para integrações
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

Todas validadas via Zod em `src/env.ts`. Veja o arquivo para tipos e defaults.

```bash
# Server
PORT=3333
CORS_ORIGIN=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/synnerdata

# Auth (Better Auth)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3333
API_URL=http://localhost:3333
APP_URL=http://localhost:3000

# Payments (Pagar.me)
PAGARME_BASE_URL=https://api.pagar.me/core/v5
PAGARME_SECRET_KEY=sk_...
PAGARME_PUBLIC_KEY=pk_...
PAGARME_WEBHOOK_USERNAME=
PAGARME_WEBHOOK_PASSWORD=

# Email
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@synnerdata.com

# Security
INTERNAL_API_KEY=           # Min 32 chars — for scheduled job endpoints
PII_ENCRYPTION_KEY=         # 64 hex chars — openssl rand -hex 32
SUPER_ADMIN_EMAILS=
ADMIN_EMAILS=

# Observability (optional)
SENTRY_DSN=                 # GlitchTip/Sentry DSN — omit to disable
```

---

## Módulos

| Domínio | Módulos | Status |
|---------|---------|--------|
| auth | auth | Implementado |
| organizations | profile, branches, sectors, cost-centers, job-positions, job-classifications, projects, ppe-items | Implementado |
| employees | employees | Implementado |
| occurrences | absences, accidents, vacations, medical-certificates, warnings, terminations, ppe-deliveries, labor-lawsuits, promotions, cpf-analyses | Implementado |
| payments | plans, checkout, subscription, plan-change, billing, webhook, customer, jobs | Implementado |
| audit | audit | Implementado |
| api-keys | api-keys | Implementado |

---

## CI/CD

| Workflow | Trigger | O que faz |
|---|---|---|
| **Lint** | PR (todas as branches) | Type check, Biome lint, secretlint, `bun pm audit` |
| **Build** | PR (todas as branches) | Build do binário para verificar compilação |
| **Test** | PR (main, preview) | Testes afetados pelo escopo da PR |
| **Test** | Schedule (diário 6h BRT) | Suite completa de testes |
| **Security** | PR (main, preview) + semanal | Trivy scan (imagem Docker + filesystem) |
| **Dependabot** | Semanal (segunda 9h BRT) | Updates de npm, Docker e GitHub Actions |

### Branch Protection

- **`preview`** — requer status checks: Lint & Security, Build
- **`main`** — requer status checks: Lint & Security, Build, Affected Tests + conversation resolution

### Fluxo de Branches

```
feature branch → PR → preview (staging) → PR → main (production)
```

---

## Deploy

| Componente | Detalhes |
|---|---|
| **Plataforma** | [Coolify](https://coolify.io) (self-hosted) em VPS Hostinger |
| **Build** | Dockerfile multi-stage — roda source code direto com Bun (sem compilação binária) |
| **Banco** | PostgreSQL dedicado gerenciado pelo Coolify |
| **Ambientes** | `preview` (staging) e `production` |
| **DNS** | DuckDNS |
| **SSL** | Automático via Coolify (Let's Encrypt) |

O Coolify faz auto-deploy ao detectar push nas branches `preview` e `main`. Migrations rodam automaticamente no entrypoint do container (`scripts/entrypoint.sh`) antes de iniciar a aplicação.

### Observabilidade

| Ferramenta | Propósito |
|---|---|
| [GlitchTip](https://glitchtip.com) | Error tracking (Sentry-compatible) — captura erros 5xx e não tratados via `@sentry/bun` |
| [Uptime Kuma](https://uptime.kuma.pet) | Monitoramento de uptime — API, frontend e GlitchTip |

A integração com GlitchTip é configurada via variável de ambiente `SENTRY_DSN` (opcional — sem a variável, o tracking é desativado).

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
4. IDs com formato `{prefix}-${crypto.randomUUID()}`
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
