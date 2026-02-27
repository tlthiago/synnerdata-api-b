# Payments Module

Assinaturas, checkout, billing e integração Pagar.me. Módulo mais crítico do sistema.

## Invariantes

- Uma subscription por organização
- Trial usado apenas uma vez
- Apenas status `active` concede acesso a features
- Pricing tiers imutáveis (ranges min/max)
- Trial: exatamente 1 tier (0-10). Paid: >= 1 tier, contíguos, sem gaps/overlaps, min >= 0, min <= max
- Employee count não pode exceder `tier.maxEmployees`
- Webhooks são idempotentes (mesmo evento processado uma vez)
- Customer ID e plan changes são atômicos (proteção contra race condition)
- Preço customizado rastreado via `priceAtPurchase` e `isCustomPrice` em `org_subscriptions`

## Subscription Status Flow

```
TRIAL (isTrial=true, status="active")
  → ACTIVE (checkout pago)
  → TRIAL_EXPIRED (job expira)
  → CANCELED (user cancela)

ACTIVE (status="active")
  → PAST_DUE (webhook: charge.failed, grace 15 dias)
  → CANCELED (user agenda cancelamento no fim do período)

PAST_DUE (status="past_due")
  → ACTIVE (webhook: charge.paid)
  → CANCELED (job: grace period expirou)

CANCELED/EXPIRED → sem recuperação
```

## Data Conventions

- Valores em **centavos** (BRL): R$ 99,90 = 9990
- Charge mínima: 100 centavos (R$ 1,00)
- Billing cycles: `monthly` | `yearly`
- Grace period: 15 dias
- Trial: 14 dias

## Feature Hierarchy

- **Gold**: terminated_employees, absences, medical_certificates, accidents, warnings, employee_status
- **Diamond**: Gold + birthdays, ppe, employee_record
- **Platinum**: Diamond + payroll
- **Trial**: todas as features (durante período ativo)

## Permissions

- `subscription:read` — ver subscription, capabilities, preview changes
- `subscription:update` — checkout, cancelar, restaurar, trocar plano
- `billing:read` — perfil, faturas, usage
- `billing:update` — criar/atualizar perfil, atualizar cartão
- `requireAdmin` — admin checkout com preço customizado, reajuste de preços (individual e bulk)

## Orphaned Plans

Quando `replaceTiers()` substitui tiers, os planos Pagar.me associados ficam órfãos. A tabela `pagarme_plan_history` rastreia todos os planos criados na Pagar.me.

- `PagarmePlanHistoryService.record()` — registra ao criar plano na Pagar.me
- `PagarmePlanHistoryService.deactivateByTierId()` — marca como inativo ao substituir tiers
- `GET /admin/pagarme/orphaned-plans` — lista planos órfãos (isActive=false)
- `POST /admin/pagarme/orphaned-plans/cleanup` — desativa na Pagar.me planos sem subscriptions ativas

## Integration Points

- **Auth Module** → cria trial na primeira org
- **Employees Module** → `LimitsService.requireEmployeeLimit()`
- **Pagar.me API** → planos, clientes, assinaturas, cobranças, faturas
- **Orphaned Plans** → `pagarme_plan_history` rastreia criações; admin endpoints para cleanup
- **Email** → notificações de subscription/payment/price-adjustment
- **Jobs/Cron** → tarefas diárias de expiração
- **price-adjustment** → reajuste de preço individual ou em massa (admin only)
