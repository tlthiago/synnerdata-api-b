# Billing (Cobrança)

Perfil de cobrança, faturas, cartões e tracking de uso.

## Billing Profile

- Um por organização, obrigatório para checkout
- CNPJ validado (14-18 chars)
- Sync com Pagar.me: se `pagarmeCustomerId` existe, atualiza customer no provider
- Document type: 11 dígitos = CPF (individual), mais = CNPJ (company)
- **Propagação para org profile**: ao criar/atualizar billing profile, campos null do org profile são preenchidos automaticamente via `OrganizationService.enrichProfile()` (fire-and-forget)

## Invoices

- Buscadas do Pagar.me via `pagarmeSubscriptionId`
- Paginadas: `page`, `limit` (1-100, default 20)
- Campos: id, code, amount (centavos), status, dueAt, paidAt, url

## Card Update

- Via `cardId` obtido do Pagar.me.js (tokenização no frontend)
- Atualiza todas as cobranças pendentes e futuras

## Usage Tracking

- Members usage: count de employees ativos vs `tier.maxEmployees` (ou `plan_limits.max_employees` para trial)
- Features: consultadas via `plan_features` table
- Percentual: 0-100% (null se ilimitado)

## Endpoints

- `GET /billing/profile`, `POST /billing/profile`, `PATCH /billing/profile`
- `GET /billing/invoices`, `GET /billing/invoices/:id/download`
- `POST /billing/update-card`
- `GET /billing/usage`

## User attribution shape

A resposta de `GET /billing/profile` (e equivalentes em `POST`/`PATCH`) segue o pattern canônico de `createdBy`/`updatedBy` como `entityReferenceSchema` (`{ id, name }`), documentado em `src/modules/organizations/cost-centers/CLAUDE.md`.
