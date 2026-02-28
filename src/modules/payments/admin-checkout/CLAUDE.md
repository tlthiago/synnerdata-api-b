# Admin Checkout (Checkout com Preço Customizado)

Geração de links de pagamento com preço diferenciado pelo admin do sistema.
Cria um **plano privado dedicado** (`isPublic=false`) com faixa de funcionários livre e preço customizado.

## Business Rules

- Admin autenticado (role = admin ou super_admin)
- Organização NÃO pode ter subscription paga ativa
- `basePlanId` deve referenciar plano ativo e não-trial (herda features/limits)
- `minEmployees >= 0`, `maxEmployees > minEmployees` (faixa livre, não precisa existir no catálogo)
- `customPriceMonthly >= 100` centavos (R$ 1,00)
- Preço anual: `calculateYearlyPrice(customPriceMonthly)` — mesma regra de 20% desconto do catálogo
- Billing profile obrigatório — admin pode enviar dados de billing no payload para criação automática
- Um plano Pagar.me dedicado é criado para cada checkout (não cacheado no tier)

## Invariantes do plano privado

- Exatamente **1 tier** por plano privado
- `isPublic=false` — não aparece no catálogo (`GET /plans`)
- `isTrial=false`, `isActive=true`
- Features herdadas do plano base (Gold/Diamond/Platinum)
- Exclusivo por organização (uma org por plano privado)

## Flow

1. Validar admin + organização + plano base (ativo, não-trial)
2. Garantir billing profile (criar se billing data informado, erro se ausente)
3. Get/create customer no Pagar.me (via CustomerService)
4. Calcular preço anual customizado
5. Criar plano privado (`subscription_plans`) + 1 tier (`plan_pricing_tiers`) em transação
6. Criar plano customizado no Pagar.me (`PagarmePlanService.createCustomPlan`)
7. Criar payment link com metadata apontando para o plano privado
8. Salvar pending checkout referenciando plano privado
9. Retornar link + dados do plano privado

## Input

`basePlanId`, `minEmployees`, `maxEmployees`, `customPriceMonthly`, `organizationId`, `billingCycle`, `successUrl`, `notes?`, `billing?`

## Output

`checkoutUrl`, `paymentLinkId`, `privatePlanId`, `privateTierId`, `customPriceMonthly`, `customPriceYearly`, `basePlanDisplayName`, `minEmployees`, `maxEmployees`, `expiresAt`

## Payment Link Metadata

`organization_id`, `plan_id` (privado), `pricing_tier_id` (privado), `billing_cycle`, `is_custom_price`, `custom_price_monthly`, `custom_price_yearly`

## Webhook Resolution

O webhook `subscription.created` resolve via metadata (`plan_id`, `pricing_tier_id`) que apontam para registros reais no banco (plano privado + tier). A resolução funciona identicamente ao checkout normal.

## Endpoint

- `POST /admin/checkout` — `requireAdmin: true`
