# Admin Provision Module

Provisionamento de organizações pelo admin: criação de user + org + subscription (trial ou checkout com pagamento).

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/admin/provisions/trial` | Cria user + org com trial de 14 dias |
| POST | `/admin/provisions/checkout` | Cria user + org com link de pagamento Pagar.me |
| GET | `/admin/provisions` | Lista provisões com filtros e paginação |
| POST | `/admin/provisions/:id/resend-activation` | Reenvia email de ativação |
| POST | `/admin/provisions/:id/regenerate-checkout` | Regenera link de checkout expirado |
| DELETE | `/admin/provisions/:id` | Remove provisão (hard delete org+user, soft delete provisão) |

## Provision Status Flow

```
TRIAL:
  pending_activation → active (user define senha)
  pending_activation → deleted (admin exclui)

CHECKOUT:
  pending_payment → pending_activation (webhook: pagamento confirmado)
  pending_payment → deleted (admin exclui)
  pending_activation → active (user define senha)
  pending_activation → deleted (admin exclui)
```

## Decisões Arquiteturais

- **Criação de org via Drizzle direto** — `auth.api.createOrganization()` não funciona para admin porque `allowUserToCreateOrganization` bloqueia roles `admin`/`super_admin`. A função `createOrganizationForUser()` insere org + member diretamente e chama `SubscriptionService.createTrial()`.
- **`auth.api.createUser()` requer headers admin** — a API do Better Auth admin precisa de sessão autenticada. Os headers são passados do controller → service.
- **Sem FK constraints na tabela `admin_org_provisions`** — `userId` e `organizationId` são colunas text simples (sem FK). Isso garante que o registro de provisão (audit trail) sobreviva ao hard delete de org/user.
- **Ativação via `requestPasswordReset`** — o email de ativação usa o fluxo de reset de senha do Better Auth. O listener em `hooks/listeners.ts` intercepta o evento e salva a URL na provisão.
- **`env.APP_URL`** — usado para construir URLs de checkout success. Nunca usar `process.env` diretamente.

## Tabela: `admin_org_provisions`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | text PK | `provision-<uuid>` |
| userId | text | ID do owner criado (sem FK) |
| organizationId | text | ID da org criada (sem FK) |
| type | enum | `trial` \| `checkout` |
| status | enum | `pending_payment` \| `pending_activation` \| `active` \| `deleted` |
| activationUrl | text | URL de ativação (set-password) |
| activationSentAt | timestamp | Quando o email de ativação foi enviado |
| activatedAt | timestamp | Quando o user ativou a conta |
| checkoutUrl | text | URL do link de pagamento Pagar.me |
| checkoutExpiresAt | timestamp | Expiração do link de checkout |
| pendingCheckoutId | text | ID do pending_checkout associado |
| notes | text | Observações do admin |
| createdBy | text | Admin que criou |
| deletedAt/deletedBy | timestamp/text | Soft delete para audit |

## Dependências

- `AdminCheckoutService` — criação de links de pagamento customizados
- `SubscriptionService` — criação de trial subscription
- `auth.api.createUser()` / `auth.api.requestPasswordReset()` — Better Auth admin API
- `sendCheckoutLinkEmail()` — envio de email com link de checkout
- `hooks/listeners.ts` — intercepta `requestPasswordReset` para salvar activation URL
