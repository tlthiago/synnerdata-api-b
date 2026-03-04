# Admin Provision Module

Provisionamento de organizações pelo admin: criação de user + org + subscription + profile (trial ou checkout com pagamento).

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/admin/provisions/trial` | Cria user + org com trial |
| POST | `/admin/provisions/checkout` | Cria user + org com link de pagamento Pagar.me |
| GET | `/admin/provisions` | Lista provisões com filtros e paginação |
| POST | `/admin/provisions/:id/resend-activation` | Reenvia email de ativação |
| POST | `/admin/provisions/:id/regenerate-checkout` | Regenera link de checkout expirado |
| DELETE | `/admin/provisions/:id` | Remove provisão (hard delete org+user, soft delete provisão) |

## Provision Status Flow

```
TRIAL:
  pending_activation → active (user define senha via onPasswordReset)
  pending_activation → deleted (admin exclui)

CHECKOUT:
  pending_payment → pending_activation (webhook: pagamento confirmado)
  pending_payment → deleted (admin exclui)
  pending_activation → active (user define senha via onPasswordReset)
  pending_activation → deleted (admin exclui)
```

## Fluxo de Ativação (Trial)

1. Admin cria provisão → user criado com `emailVerified=false` e senha aleatória
2. `sendResetPassword` hook em `auth.ts` intercepta, extrai token da URL do Better Auth
3. Email de ativação enviado com URL do frontend: `APP_URL/definir-senha?token=<TOKEN>&email=<EMAIL>`
4. `activationUrl` e `activationSentAt` salvos na provisão
5. Usuário clica no link → frontend exibe formulário de definição de senha
6. Frontend chama `POST /api/auth/reset-password` com `{ newPassword, token }`
7. Hook `onPasswordReset` em `auth.ts` detecta provisão `pending_activation`:
   - Seta `emailVerified=true` na tabela `users`
   - Transiciona provisão para `status: "active"`, grava `activatedAt`
8. Frontend faz `signIn.email({ email, password })` para login automático (reset-password não retorna sessão)

## Custom Trial Parameters

O endpoint `POST /admin/provisions/trial` aceita parâmetros opcionais:

- `trialDays` (optional, 1-365) — duração em dias. Default: 14 (do plano trial base)
- `maxEmployees` (optional, 1-1000) — limite de funcionários. Default: 10 (do tier trial base)

Quando `maxEmployees` é informado, um pricing tier dedicado é criado (preço 0, vinculado ao plano trial). O tier customizado é a fonte de verdade para o `LimitsService`.

## Organization Data

Ambos os endpoints (trial e checkout) aceitam um objeto `organization` com dois nomes distintos:

- `organization.name` — nome real da organização → salvo em `organizations.name`
- `organization.tradeName` — nome fantasia → salvo em `organization_profiles.tradeName`

### Trial

Campos do profile:
- `taxId`, `email` — obrigatórios
- `phone` — opcional. Quando informado, é copiado para `mobile` via `enrichProfile`
- `legalName`, endereço completo (`street`, `number`, `complement`, `neighborhood`, `city`, `state`, `zipCode`) — opcionais

### Checkout

Campos do profile — **todos obrigatórios** (billing profile precisa):
- `legalName`, `taxId`, `email`, `phone` — dados fiscais
- `street`, `number`, `neighborhood`, `city`, `state`, `zipCode` — endereço
- `complement` — opcional

O serviço mapeia os dados de `organization` para:
1. **Org profile** via `OrganizationService.enrichProfile()` (preenche campos null)
2. **Billing data** para `AdminCheckoutService.create()` (cria billing profile + customer Pagar.me)

## Checkout: successUrl e Polling

- `successUrl` é construída automaticamente: `APP_URL/ativacao?email=<ownerEmail>`
- O admin **não** define a URL — o backend monta baseado no email do owner
- `minEmployees` é fixo em `0` (sem faixa, como trial)
- Frontend usa endpoint público de polling (`GET /v1/public/provision-status?email=<email>`) para verificar quando a ativação está pronta
- Email de ativação é enviado automaticamente pelo listener `subscription.activated` como fallback

## Response: `subscription` object

Todas as rotas que retornam `ProvisionData` incluem o objeto `subscription`:

```json
{
  "subscription": {
    "status": "active",
    "trialDays": 30,
    "trialEnd": "2026-04-03T...",
    "maxEmployees": 50
  }
}
```

- `trialDays` é calculado a partir de `trialEnd - trialStart`
- `maxEmployees` vem do `planPricingTiers` vinculado à subscription
- Na listagem, os dados vêm via LEFT JOIN (subscription + tier)
- Nos demais endpoints, vêm via `fetchSubscriptionInfo()`

## Decisões Arquiteturais

- **Criação de org via Drizzle direto** — `auth.api.createOrganization()` não funciona para admin porque `allowUserToCreateOrganization` bloqueia roles `admin`/`super_admin`. A função `createOrganizationForUser()` insere org + member diretamente, chama `SubscriptionService.createTrial()` e `OrganizationService.createMinimalProfile()`.
- **`auth.api.createUser()` requer headers admin** — a API do Better Auth admin precisa de sessão autenticada. Os headers são passados do controller → service.
- **Sem FK constraints na tabela `admin_org_provisions`** — `userId` e `organizationId` são colunas text simples (sem FK). Isso garante que o registro de provisão (audit trail) sobreviva ao hard delete de org/user.
- **Ativação via `requestPasswordReset`** — o email de ativação reutiliza o fluxo de reset de senha do Better Auth. O hook `sendResetPassword` em `auth.ts` detecta provisão `pending_activation`, extrai o token, e monta URL do frontend (`APP_URL/definir-senha?token=<TOKEN>&email=<EMAIL>`).
- **`emailVerified` definido no `onPasswordReset`** — não é setado prematuramente durante a criação. O hook verifica se existe provisão `pending_activation` para o user e, se sim, seta `emailVerified=true` e transiciona para `active`. Garante que o email foi provado pelo user ao clicar no link.
- **Token extraction** — o token é extraído da URL do Better Auth via `segments.indexOf("reset-password") + 1`, com fallback e log de erro se falhar.
- **`env.APP_URL`** — usado para construir URLs de ativação e checkout success. Nunca usar `process.env` diretamente.

## Tabela: `admin_org_provisions`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | text PK | `provision-<uuid>` |
| userId | text | ID do owner criado (sem FK) |
| organizationId | text | ID da org criada (sem FK) |
| type | enum | `trial` \| `checkout` |
| status | enum | `pending_payment` \| `pending_activation` \| `active` \| `deleted` |
| activationUrl | text | URL de ativação do frontend (`/definir-senha?token=...&email=...`) |
| activationSentAt | timestamp | Quando o email de ativação foi enviado |
| activatedAt | timestamp | Quando o user ativou a conta (definiu senha) |
| checkoutUrl | text | URL do link de pagamento Pagar.me |
| checkoutExpiresAt | timestamp | Expiração do link de checkout |
| pendingCheckoutId | text | ID do pending_checkout associado |
| notes | text | Observações do admin |
| createdBy | text | Admin que criou |
| deletedAt/deletedBy | timestamp/text | Soft delete para audit |

## Dependências

- `AdminCheckoutService` — criação de links de pagamento customizados
- `SubscriptionService` — criação de trial subscription (aceita `customPricingTierId` e `customTrialDays` opcionais)
- `PlansService.getTrialPlan()` — obter plano trial base para criação de tier customizado
- `OrganizationService.createMinimalProfile()` / `enrichProfile()` — profile da org
- `auth.api.createUser()` / `auth.api.requestPasswordReset()` — Better Auth admin API
- `sendAccountActivationEmail()` / `sendCheckoutLinkEmail()` — envio de emails
- `auth.ts` hooks (`sendResetPassword`, `onPasswordReset`) — interceptam ativação de provisão
