# Admin Checkout (Checkout com Preço Customizado)

Geração de links de pagamento com preço diferenciado pelo admin do sistema.
Cria um **plano privado dedicado** (`isPublic=false`) com faixa de funcionários livre e preço customizado.

## Business Rules

- Admin autenticado (role = admin ou super_admin)
- Organização NÃO pode ter subscription paga ativa (trial é permitido)
- `basePlanId` deve referenciar plano ativo e não-trial (herda features via `plan_features`)
- `minEmployees >= 0`, `maxEmployees > minEmployees` (faixa livre, não precisa existir no catálogo)
- Employee count da org deve ser <= `maxEmployees` informado (validado antes de criar plano privado)
- `customPriceMonthly >= 100` centavos (R$ 1,00)
- Preço anual: `calculateYearlyPrice(customPriceMonthly, basePlan.yearlyDiscountPercent)` — usa o desconto do plano base. Fallback: **20%** se o plano base não definir `yearlyDiscountPercent`
- Billing profile obrigatório — admin pode enviar dados de billing no payload para criação automática
- Um plano Pagar.me dedicado é criado para cada checkout (não cacheado no tier)
- Link de checkout expira em **24 horas** (`CHECKOUT_EXPIRATION_HOURS = 24`)
- `discountPercentage` é calculado comparando `customPriceMonthly` com o `priceMonthly` do tier de catálogo que tem a mesma faixa (`minEmployees`/`maxEmployees`). Se não houver tier correspondente, retorna 0

## Invariantes do plano privado

- Exatamente **1 tier** por plano privado
- `isPublic=false` — não aparece no catálogo (`GET /plans`)
- `isTrial=false`, `isActive=true`
- Features copiadas do plano base via `plan_features` (Gold/Diamond/Platinum)
- Exclusivo por organização (uma org por plano privado)

## Flow

1. Validar admin + organização + plano base (ativo, não-trial)
2. Garantir billing profile (criar se billing data informado, erro se ausente)
3. Get/create customer no Pagar.me (via CustomerService)
4. Calcular preço anual customizado e desconto vs. catálogo
5. Criar plano privado (`subscription_plans`) + 1 tier (`plan_pricing_tiers`) + copiar `plan_features` do plano base em transação
6. Criar plano customizado no Pagar.me (`PagarmePlanService.createCustomPlan`)
7. Criar payment link com metadata apontando para o plano privado
8. Salvar `pending_checkouts` com: `planId` (privado), `pricingTierId` (privado), `billingCycle`, `customPriceMonthly`, `customPriceYearly`, `pagarmePlanId`, `createdByAdminId`, `notes`, `expiresAt`
9. Retornar link + dados do plano privado

## Input

`basePlanId`, `minEmployees`, `maxEmployees`, `customPriceMonthly`, `organizationId`, `billingCycle`, `successUrl`, `notes?`, `billing?`

## Output

`checkoutUrl`, `paymentLinkId`, `privatePlanId`, `privateTierId`, `customPriceMonthly`, `customPriceYearly`, `catalogPriceMonthly`, `discountPercentage`, `basePlanDisplayName`, `minEmployees`, `maxEmployees`, `expiresAt`

## Payment Link Metadata

`organization_id`, `plan_id` (privado), `pricing_tier_id` (privado), `billing_cycle`, `is_custom_price`, `custom_price_monthly`, `custom_price_yearly`

## Webhook Resolution

O webhook `subscription.created` resolve via metadata (`plan_id`, `pricing_tier_id`) que apontam para registros reais no banco (plano privado + tier). A resolução funciona identicamente ao checkout normal.

## Rastreabilidade

- `organizationId` no plano privado: org dona do plano
- `basePlanId` no plano privado: plano público de origem (herança de features)
- `archivedAt`: preenchido automaticamente quando subscription migra para outro plano

## Consumidores

- `AdminProvisionService.createWithCheckout()` — chama `AdminCheckoutService.create()` com `minEmployees: 0` fixo e `successUrl` construído automaticamente (`APP_URL/ativacao?email=<ownerEmail>`)

## Endpoint

- `POST /admin/checkout` — `requireAdmin: true`
