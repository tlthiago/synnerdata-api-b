# Plan Change (Mudança de Plano)

Upgrades imediatos e downgrades agendados com proration.

## Business Rules

- Endpoint unificado: pode mudar plano, billing cycle ou tier (qualquer combinação)
- Exatamente uma mudança necessária (não pode ser idêntico ao atual)
- Não pode mudar se já tem plan change agendado
- Não pode mudar se subscription não está active

## Upgrade vs Downgrade

- **Prioridade 1**: billing cycle — monthly→yearly = upgrade, yearly→monthly = downgrade
- **Prioridade 2**: mesmo cycle, compara preço mensal normalizado
- **Default**: upgrade se mesmo preço/cycle

## Employee Count Validation

- Valida employee count em **todas** as mudancas (upgrade e downgrade), nao apenas downgrades
- Impede mudanca se `currentEmployeeCount > newTier.maxEmployees`
- Erro: `EMPLOYEE_COUNT_EXCEEDS_TIER_LIMIT`

## Upgrade (imediato)

- Proration: `(newPrice - currentPrice) × (remainingDays / totalDays)`
- Mínimo R$ 1,00 (100 centavos)
- Cria payment link para valor proporcional
- Webhook `charge.paid` aplica upgrade

## Downgrade (agendado)

- Armazena: `pendingPlanId`, `pendingBillingCycle`, `pendingPricingTierId`, `planChangeAt`
- User mantém plano atual até fim do período
- Job executa no fim do período: cancela Pagar.me atual, ativa novo plano

## Custom Plan Transitions

- Custom → Catálogo (upgrade/downgrade): permitido via self-service
- Catálogo → Custom: bloqueado — apenas via admin-checkout (erro `CANNOT_CHANGE_TO_PRIVATE_PLAN`)
- Custom → Custom: bloqueado — apenas via admin-checkout
- Plano destino deve ter `isPublic=true`
- Plano privado anterior é arquivado (`archivedAt`) automaticamente após migração

## Endpoints

- `POST /subscription/change` — executar mudança
- `GET /subscription/scheduled-change` — ver mudança pendente
- `DELETE /subscription/scheduled-change` — cancelar mudança agendada
- `POST /subscription/preview-change` — preview sem executar
