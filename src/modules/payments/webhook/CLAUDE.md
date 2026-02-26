# Webhook (Eventos Pagar.me)

Recebe e processa eventos de pagamento do Pagar.me.

## Security

- Basic auth via header (timing-safe comparison)
- Credentials: `PAGARME_WEBHOOK_USERNAME` / `PAGARME_WEBHOOK_PASSWORD`

## Idempotência

- Event IDs rastreados — mesmo evento processado uma vez
- Todos os eventos salvos em `subscriptionEvents` com payload, status, error

## Event Handlers

| Evento | Ação |
|---|---|
| `charge.paid` | `markActive()`, atualiza período, salva pagarmeSubscriptionId |
| `charge.payment_failed` | Status → `past_due`, grace period 15 dias |
| `invoice.payment_failed` | Mesmo que charge.payment_failed |
| `subscription.created` | Ativa subscription com metadata do checkout |
| `subscription.canceled` | `cancelByWebhook()`, status → `canceled` |
| `charge.refunded` | Log + evento `charge.refunded` |
| `subscription.updated` | Atualiza info do cartão se presente |

## Endpoint

- `POST /webhooks/pagarme` — sem auth de sessão, apenas basic auth
