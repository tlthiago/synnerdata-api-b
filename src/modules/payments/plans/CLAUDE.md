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

## Tier Versioning

- Tiers são imutáveis: `replaceTiers()` arquiva (soft delete) tiers antigos em vez de deletar
- Subscriptions ativas continuam referenciando tiers arquivados
- Queries públicas filtram `WHERE archived_at IS NULL`
- Admin endpoint `GET /plans/:id/archived-tiers` mostra tiers arquivados com contagem de subscriptions
- FK constraints `ON DELETE RESTRICT` impedem hard delete acidental
- Planos Pagar.me de tiers arquivados permanecem ativos enquanto houver subscriptions referenciando

## Endpoints

- `GET /plans` — planos ativos e públicos (sem auth)
- `GET /plans/all`, `GET /plans/:id`, `POST /plans`, `PUT /plans/:id`, `DELETE /plans/:id` — admin only
