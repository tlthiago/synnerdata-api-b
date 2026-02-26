# Jobs (Tarefas Agendadas)

Background jobs executados via cron para manutenção de subscriptions.

## Security

- Internal API key via header `X-Api-Key` (`INTERNAL_API_KEY`)
- Guard pattern no controller

## Jobs

| Job | Horário | Ação |
|---|---|---|
| `expire-trials` | 08:00 | Expira trials com `trialEnd < now` → status `expired` + email |
| `notify-expiring-trials` | 09:00 | Notifica trials que expiram em 3 dias → email de reminder |
| `process-cancellations` | 10:00 | Efetiva cancelamentos agendados com `currentPeriodEnd < now` → cancela no Pagar.me + email |
| `suspend-expired-grace-periods` | 11:00 | Suspende `past_due` com grace period expirado → status `canceled` + email |
| `process-scheduled-plan-changes` | 12:00 | Executa downgrades agendados com `planChangeAt <= now` → cancela plano atual, ativa novo |

## Endpoints

- `POST /jobs/expire-trials`
- `POST /jobs/notify-expiring-trials`
- `POST /jobs/process-cancellations`
- `POST /jobs/suspend-expired-grace-periods`
- `POST /jobs/process-scheduled-plan-changes`
