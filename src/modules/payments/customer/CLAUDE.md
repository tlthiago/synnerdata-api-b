# Customer (Cliente Pagar.me)

Gerenciamento de clientes no provedor de pagamento.

## Business Rules

- Get or create: verifica billing profile → verifica `pagarmeCustomerId` → cria se não existe
- Criação atômica: só atualiza DB se outro request não setou antes (race condition)
- Idempotency key: `create-customer-{organizationId}`
- Type: sempre `company` para billing profiles
- Phone parsing: >11 dígitos → primeiros 2 = country code; senão country = "55" (Brasil)

## Endpoint

- `GET /customers` — lista clientes do Pagar.me (admin only, filtros: name/email/document)
