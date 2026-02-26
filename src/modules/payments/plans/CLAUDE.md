# Plans (Planos de Assinatura)

Planos com pricing tiers por faixa de funcionários.

## Business Rules

- Nome do plano único
- Não pode deletar plano com subscriptions ativas
- Trial plan: `isTrial=true`, `trialDays=14`, 1 tier (0-10), todas as features
- Paid plans: `isTrial=false`, exatamente 10 tiers matching `EMPLOYEE_TIERS`

## Employee Tiers (EMPLOYEE_TIERS constant)

- Trial: 0-10 (tier único)
- Paid: 0-10, 11-20, 21-30, 31-40, 41-50, 51-60, 61-70, 71-80, 81-90, 91-180
- Max: 180 employees
- Desconto anual: 20% (`monthlyPrice * 12 * 0.8`)

## Plan Features (PLAN_FEATURES constant)

- **Gold**: terminated_employees, absences, medical_certificates, accidents, warnings, employee_status
- **Diamond**: Gold + birthdays, ppe, employee_record
- **Platinum**: Diamond + payroll

## Endpoints

- `GET /plans` — planos ativos e públicos (sem auth)
- `GET /plans/all`, `GET /plans/:id`, `POST /plans`, `PUT /plans/:id`, `DELETE /plans/:id` — admin only
