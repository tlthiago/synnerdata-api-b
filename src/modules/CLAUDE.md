# Domain Context

- **auth** — Signup, admin signup e lifecycle de trial
- **payments** — Checkout, assinaturas, billing, planos e integração Pagar.me
  - `plans` — planos de assinatura com pricing tiers
  - `checkout` — criação de sessões de pagamento via Pagar.me (self-service)
  - `admin-checkout` — links de pagamento com preço customizado (admin only)
  - `subscription` — detalhes, cancelamento e restauração de assinaturas
  - `plan-change` — upgrades imediatos ou downgrades agendados com preview
  - `billing` — perfil de cobrança, cartões, faturas e uso vs. limites do plano
  - `webhook` — recebe eventos de pagamento do Pagar.me
  - `customer` — listagem de clientes do provedor de pagamento
  - `jobs` — jobs agendados (expiração de trial, cancelamentos, suspensões)
  - `pagarme/orphaned-plans` — rastreamento e limpeza de planos Pagar.me órfãos (admin only)
  - `price-adjustment` — reajuste de preço individual ou em massa (admin only)
- **organizations** — Multi-tenancy e estrutura organizacional
  - `profile` — metadata e configurações da organização
  - `branches` — filiais/unidades
  - `sectors` — setores/departamentos
  - `cost-centers` — centros de custo
  - `job-positions` — cargos
  - `job-classifications` — códigos CBO (classificação brasileira de ocupações)
  - `projects` — projetos com alocação de funcionários
  - `ppe-items` — itens de EPI com associação a cargos
- **employees** — Cadastro e gestão de funcionários
- **occurrences** — Eventos de funcionários
  - `absences` — ausências (faltas justificadas/injustificadas)
  - `accidents` — acidentes de trabalho
  - `vacations` — férias
  - `medical-certificates` — atestados médicos
  - `warnings` — advertências disciplinares
  - `terminations` — desligamentos
  - `ppe-deliveries` — entregas de EPI
  - `labor-lawsuits` — processos trabalhistas
  - `promotions` — promoções
  - `cpf-analyses` — análises de CPF
- **admin** — Recursos exclusivos para administradores da plataforma (composite controller, prefix `/v1/admin`)
  - `organizations` — listagem, detalhes e configuração de orgs (Power BI URL)
  - `api-keys` — chaves de API para integrações externas
- **audit** — Log de ações para compliance

---

# Module Development Patterns

## File Structure

Each module follows: `index.ts` (controller) + `<name>.service.ts` + `<name>.model.ts` + `errors.ts` (optional)

## Controller (index.ts)

- One Elysia instance per controller with `name`, `prefix`, and `detail.tags`
- Use `betterAuthPlugin` via `.use()` for authenticated routes
- Auth via `auth` macro: `{ auth: { permissions: { resource: ["action"] }, requireOrganization: true } }`
- Handlers delegate to service, wrap with `wrapSuccess()`
- Declare `response` map per route (200, 401, 403, 422) for OpenAPI

## Service (<name>.service.ts)

- Abstract class with static methods (never instantiated)
- Receives typed input, returns typed data
- Throws domain-specific errors extending AppError
- No HTTP concerns — no access to request/response

## Errors (errors.ts)

- Each module defines a base domain error extending `AppError` (e.g., `AbsenceError`)
- Specific errors extend the domain error (e.g., `AbsenceNotFoundError extends AbsenceError`)
- Include `status`, `code`, and descriptive `message` with relevant `details`

## Model (<name>.model.ts)

- Zod schemas for input validation (`createXSchema`, `updateXSchema`, `idParamSchema`)
- Zod schemas for response data (`xDataSchema`) — compose with `successResponseSchema()`
- Export inferred types: `type CreateX = z.infer<typeof createXSchema>`
- Input types extend inferred with context: `type CreateXInput = CreateX & { organizationId: string }`

## Testing

- Use `createTestApp()` from `src/test/support/app.ts`
- Use factories: `UserFactory`, `OrganizationFactory` from `src/test/factories/`
- Test via `app.handle(new Request())` — no HTTP server needed
- Test file location: `__tests__/` directory alongside the module code
