# Subscription (Assinatura)

Lifecycle completo de assinaturas: trial, ativação, cancelamento, restauração.

## Status

- `active` — acesso total
- `past_due` — pagamento falhou, grace period de 15 dias
- `canceled` — cancelado (soft ou hard)
- `expired` — trial expirou ou cancelamento efetivado

## Access Status (computed, não armazenado)

- `trial` — isTrial + status active + antes do trialEnd
- `trial_expired` — isTrial + status active + depois do trialEnd
- `active` — paid + status active
- `past_due`, `canceled`, `expired`, `no_subscription`

## Trial

- Criado automaticamente pela auth na primeira org
- 14 dias, limite 10 employees, todas as features
- `trialUsed=true` impede segundo trial
- Status permanece `active` até job expirar

## Cancel/Restore

- **Trial NÃO é cancelável** — trial expira naturalmente em 14 dias; retorna `TRIAL_NOT_CANCELLABLE` (400)
- Cancel: `cancelAtPeriodEnd=true`, acesso mantido até fim do período (apenas assinaturas pagas)
- Restore: desfaz cancel agendado, deve estar com cancelamento pendente
- Sem recuperação após status `canceled` ou `expired`
- Operações de billing (invoices, update-card) retornam `BILLING_NOT_AVAILABLE_FOR_TRIAL` (400) para trial

## Endpoints

- `GET /subscription` — dados da subscription
- `GET /subscription/capabilities` — features com status de acesso
- `POST /subscription/cancel` — agendar cancelamento
- `POST /subscription/restore` — restaurar cancelamento agendado
