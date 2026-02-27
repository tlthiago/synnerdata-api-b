# Plans (Planos de Assinatura)

Planos com pricing tiers por faixa de funcionários.

## Business Rules

- Nome do plano único
- Não pode deletar plano com subscriptions ativas
- Trial plan: `isTrial=true`, `trialDays=14`, 1 tier (0-10), todas as features
- Paid plans: `isTrial=false`, >= 1 tier contíguo (sem gaps/overlaps, first tier starts at 0)

## Employee Tiers

- Trial: 0-10 (tier único, regra fixa)
- Paid: qualquer conjunto de tiers contíguos (min >= 0, sem gaps, sem overlaps)
- `EMPLOYEE_TIERS` mantido como template/default para seeds
- Desconto anual: 20% (`monthlyPrice * 12 * 0.8`)

## Plan Features (PLAN_FEATURES constant)

- **Gold**: terminated_employees, absences, medical_certificates, accidents, warnings, employee_status
- **Diamond**: Gold + birthdays, ppe, employee_record
- **Platinum**: Diamond + payroll

## Individual Tier Operations

- Tiers podem ser gerenciados individualmente sem afetar outros tiers
- Ao adicionar tier: range não pode sobrepor existentes e deve ser contíguo
- Ao atualizar preço: `priceYearly` recalculado via `calculateYearlyPrice()`, cache Pagar.me invalidado (`pagarmePlanIdMonthly`/`pagarmePlanIdYearly` = null)
- Ao deletar tier: bloqueado se existirem subscriptions ativas referenciando o tier
- Subscriptions existentes NÃO são afetadas por updates de preço (mantêm subscription Pagar.me no preço antigo)

## Endpoints

- `GET /plans` — planos ativos e públicos (sem auth)
- `GET /plans/all`, `GET /plans/:id`, `POST /plans`, `PUT /plans/:id`, `DELETE /plans/:id` — admin only
- `GET /plans/:id/tiers` — listar tiers com preços e IDs Pagar.me (admin)
- `POST /plans/:id/tiers` — adicionar tier (validar range: sem overlap, contiguidade) (admin)
- `PATCH /plans/:id/tiers/:tierId` — atualizar `priceMonthly`, recalcular `priceYearly`, invalidar cache Pagar.me (admin)
- `DELETE /plans/:id/tiers/:tierId` — remover tier (bloqueado se tiver subscriptions ativas) (admin)
