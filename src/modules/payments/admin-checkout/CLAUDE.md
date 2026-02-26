# Admin Checkout (Checkout com Preço Customizado)

Geração de links de pagamento com preço diferenciado pelo admin do sistema.

## Business Rules

- Admin autenticado (role = admin ou super_admin)
- Organização NÃO pode ter subscription paga ativa
- Plano deve estar ativo, tier deve pertencer ao plano
- customPriceMonthly >= 100 centavos (R$ 1,00)
- Preço anual: `calculateYearlyPrice(customPriceMonthly)` — mesma regra de 20% desconto do catálogo
- Billing profile obrigatório — admin pode enviar dados de billing no payload para criação automática
- Um plano Pagar.me dedicado é criado para cada preço customizado (não cacheado no tier)

## Flow

1. Validar admin + organização + plano + tier
2. Garantir billing profile (criar se billing data informado, erro se ausente)
3. Get/create customer no Pagar.me (via CustomerService)
4. Calcular preço anual customizado
5. Criar plano customizado no Pagar.me (`PagarmePlanService.createCustomPlan`)
6. Criar payment link com metadata `is_custom_price=true`
7. Salvar pending checkout com campos customizados
8. Retornar link + dados comparativos de preço

## Payment Link Metadata

Todos os campos do checkout normal + `is_custom_price`, `custom_price_monthly`, `custom_price_yearly`

## Webhook Resolution

O webhook `subscription.created` resolve checkouts customizados da mesma forma que self-service:
- Via metadata (primary) ou lookup em `pending_checkouts` (fallback)
- Propaga `priceAtPurchase` e `isCustomPrice` para `org_subscriptions`

## Endpoint

- `POST /admin/checkout` — `requireAdmin: true`
