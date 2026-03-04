# Checkout (Sessão de Pagamento)

Criação de links de pagamento via Pagar.me para ativação de assinatura.

## Business Rules

- Email do user deve estar verificado
- Organização NÃO pode ter subscription paga ativa (trial OK)
- Plano deve estar ativo (`isActive=true`)
- Pricing tier deve existir
- Billing cycle: `monthly` | `yearly`
- Pending checkout expira em 24 horas

## Flow

1. Get/create customer no Pagar.me (via CustomerService)
2. Get/create plano no Pagar.me (via PagarmePlanService)
3. Criar payment link (type: subscription, method: credit_card, operation: auth_and_capture)
4. Salvar pending checkout no banco
5. Enviar email com link de checkout

## Payment Link Metadata

- `organization_id`, `plan_id`, `pricing_tier_id`, `billing_cycle`

## Endpoint

- `POST /checkout` — `subscription:update` + `requireOrganization`

## Errors

- `EmailNotVerifiedError`, `SubscriptionAlreadyActiveError`
- `PlanNotFoundError`, `PricingTierNotFoundError`
