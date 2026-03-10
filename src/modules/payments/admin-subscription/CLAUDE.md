# Admin Subscription

Ajuste de limites de trial (maxEmployees e trialDays) em subscriptions existentes, pelo admin.

## Endpoint

| Método | Rota | Descrição |
|--------|------|-----------|
| PATCH | `/admin/subscriptions/:organizationId/trial-limits` | Ajusta maxEmployees e/ou trialDays de um trial |

## Business Rules

- Apenas admin (`requireAdmin: true`)
- Subscription deve existir para a organização
- Plano deve ser trial (`isTrial === true`)
- Status aceitos: `active` ou `expired` (rejeita `canceled` e `past_due`)
- `maxEmployees` >= quantidade atual de funcionários da org
- Novo `trialEnd` (trialStart + trialDays) deve ser no futuro
- Se trial expirado e novo `trialEnd` é futuro → reativa para `active`

## Tier Imutável

Quando `maxEmployees` é alterado, um **novo tier dedicado** é criado (preço 0, vinculado ao plano trial) e o `pricingTierId` da subscription é atualizado. O tier anterior não é modificado nem arquivado (pode ser compartilhado).

## Input

Ambos opcionais, mas pelo menos um obrigatório:
- `maxEmployees` (1-1000) — novo limite de funcionários
- `trialDays` (1-365) — nova duração, recalcula `trialEnd` a partir de `trialStart`

## Response

```json
{
  "organizationId": "string",
  "status": "active",
  "planName": "Trial",
  "trialDays": 30,
  "trialEnd": "2026-04-09T...",
  "maxEmployees": 50,
  "reactivated": false
}
```

## Dependências

- `SubscriptionNotFoundError` — `src/modules/payments/errors.ts`
- `LimitsService.checkEmployeeLimit()` — `src/modules/payments/limits/limits.service.ts`
- `PlansService.getTrialPlan()` — `src/modules/payments/plans/plans.service.ts`
