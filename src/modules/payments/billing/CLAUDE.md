# Billing (Cobrança)

Perfil de cobrança, faturas, cartões e tracking de uso.

## Billing Profile

- Um por organização, obrigatório para checkout
- CNPJ validado (14-18 chars)
- Sync com Pagar.me: se `pagarmeCustomerId` existe, atualiza customer no provider
- Document type: 11 dígitos = CPF (individual), mais = CNPJ (company)

## Invoices

- Buscadas do Pagar.me via `pagarmeSubscriptionId`
- Paginadas: `page`, `limit` (1-100, default 20)
- Campos: id, code, amount (centavos), status, dueAt, paidAt, url

## Card Update

- Via `cardId` obtido do Pagar.me.js (tokenização no frontend)
- Atualiza todas as cobranças pendentes e futuras

## Usage Tracking

- Members usage: count de employees ativos vs `tier.maxEmployees`
- Percentual: 0-100% (null se ilimitado)

## Endpoints

- `GET /billing/profile`, `POST /billing/profile`, `PATCH /billing/profile`
- `GET /billing/invoices`, `GET /billing/invoices/:id/download`
- `POST /billing/update-card`
- `GET /billing/usage`
