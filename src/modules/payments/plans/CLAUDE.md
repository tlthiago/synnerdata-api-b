# Plans (Planos de Assinatura)

Planos com pricing tiers por faixa de funcionários.

## Business Rules

- Nome do plano único
- Não pode deletar plano com subscriptions ativas
- Trial plan: `isTrial=true`, `trialDays=14`, 1 tier (0-10), todas as features
- Unique trial constraint: apenas 1 plano trial ativo (não arquivado) por vez — enforced via partial unique index `subscription_plans_single_active_trial`
- Paid plans: `isTrial=false`, >= 1 tier contíguo (sem gaps/overlaps, first tier starts at 0)

## Employee Tiers

- Trial: 0-10 (tier único, regra fixa)
- Paid: qualquer conjunto de tiers contíguos (min >= 0, sem gaps, sem overlaps)
- `EMPLOYEE_TIERS` mantido como template/default para seeds
- Desconto anual: configurável por plano via `yearlyDiscountPercent` (default 20%). Fórmula: `calculateYearlyPrice(monthlyPrice, discountPercent)` = `monthlyPrice * 12 * (1 - discountPercent / 100)`

## Plan Features (tabela `plan_features`)

Features são armazenadas na tabela `plan_features` (junction: planId + featureId) e definidas na tabela `features`. Não existe mais constante `PLAN_FEATURES` — a fonte de verdade é o banco de dados.

- **Gold**: terminated_employees, absences, medical_certificates, accidents, warnings, employee_status
- **Diamond**: Gold + birthdays, ppe, employee_record
- **Platinum**: Diamond + payroll

## Plan Limits (tabela `plan_limits`)

Limites numéricos por plano são armazenados na tabela `plan_limits` (planId + limitKey + limitValue). Exemplo: trial plan tem `max_employees = 10`.

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
