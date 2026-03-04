# Mapeamento Frontend-Backend: Pagamentos

> Referencia tecnica para implementacao das paginas de pagamentos no frontend.
> Use em conjunto com `06-paginas-frontend.md` (wireframes) e os tipos gerados pelo Orval.

---

## 1. Visao Geral dos Endpoints

Base path: `/v1/payments`

### Endpoints para Frontend (Usuarios Autenticados)

| Categoria | Endpoint | Metodo | Descricao |
|-----------|----------|--------|-----------|
| **Plans** | `/plans` | GET | Listar planos disponiveis (publico) |
| **Subscription** | `/subscription` | GET | Obter assinatura da organizacao |
| **Subscription** | `/subscription/capabilities` | GET | Obter features e limites |
| **Subscription** | `/subscription/cancel` | POST | Agendar cancelamento |
| **Subscription** | `/subscription/restore` | POST | Restaurar assinatura cancelada |
| **Plan Change** | `/subscription/preview-change` | POST | Preview de mudanca de plano |
| **Plan Change** | `/subscription/change` | POST | Executar mudanca de plano |
| **Plan Change** | `/subscription/scheduled-change` | GET | Obter mudanca agendada |
| **Plan Change** | `/subscription/scheduled-change` | DELETE | Cancelar mudanca agendada |
| **Billing** | `/billing/profile` | GET | Obter perfil de cobranca |
| **Billing** | `/billing/profile` | POST | Criar perfil de cobranca |
| **Billing** | `/billing/profile` | PATCH | Atualizar perfil de cobranca |
| **Billing** | `/billing/invoices` | GET | Listar faturas (paginado) |
| **Billing** | `/billing/invoices/:id/download` | GET | URL de download da fatura |
| **Billing** | `/billing/update-card` | POST | Atualizar cartao |
| **Billing** | `/billing/usage` | GET | Obter uso vs limites |
| **Checkout** | `/checkout` | POST | Criar sessao de checkout |

---

## 2. Pagina: Assinatura (`/settings/subscription`)

### 2.1 Dados Necessarios

| Secao | Endpoint | Hook Orval | Quando Carregar |
|-------|----------|------------|-----------------|
| Plano Atual | `GET /subscription` | `useGetSubscription` | Mount |
| Alertas | `GET /subscription` | (mesmo acima) | Mount |
| Mudanca Agendada | `GET /subscription/scheduled-change` | `useGetScheduledChange` | Mount |
| Dados Cobranca | `GET /billing/profile` | `useGetBillingProfile` | Mount |
| Faturas Recentes | `GET /billing/invoices?limit=3` | `useGetInvoices` | Mount |
| Uso/Limites | `GET /billing/usage` | `useGetBillingUsage` | Mount |

### 2.2 Acoes do Usuario

| Acao | Endpoint | Hook Orval | Pos-Sucesso |
|------|----------|------------|-------------|
| Editar dados cobranca | `PATCH /billing/profile` | `useUpdateBillingProfile` | Toast + invalidate query |
| Cancelar assinatura | `POST /subscription/cancel` | `useCancelSubscription` | Modal confirmacao + invalidate |
| Restaurar assinatura | `POST /subscription/restore` | `useRestoreSubscription` | Toast + invalidate |
| Cancelar mudanca agendada | `DELETE /subscription/scheduled-change` | `useCancelScheduledChange` | Toast + invalidate |
| Download fatura | `GET /billing/invoices/:id/download` | `useDownloadInvoice` | Abrir URL em nova aba |

### 2.3 Calculos no Frontend

O backend retorna datas e valores brutos. O frontend deve calcular:

| Calculo | Campos do Backend | Observacao |
|---------|-------------------|------------|
| Dias restantes do trial | `subscription.trialEnd` | Diferenca entre `trialEnd` e data atual |
| Valor da proxima cobranca | `subscription.pricingTier.priceMonthly` ou `priceYearly` + `billingCycle` | Selecionar preco baseado no ciclo |
| Percentual de uso | `usage.members.current` / `usage.members.limit` | Ja vem calculado em `usage.members.percentage` |

### 2.4 Alertas Condicionais

| Condicao | Alerta | Acao |
|----------|--------|------|
| `uiState === 'trial_warning'` | "Seu trial expira em X dias" | Link para `/settings/plans` |
| `uiState === 'trial_critical'` | "Seu trial expira em X dias!" | Link para `/settings/plans` |
| `uiState === 'trial_expired'` | "Seu trial expirou" | Link para `/settings/plans` |
| `uiState === 'past_due'` | "Pagamento pendente" | Botao atualizar cartao |
| `uiState === 'cancel_scheduled'` | "Cancelamento agendado para X" | Botao restaurar |
| `scheduledChange !== null` | "Mudanca de plano agendada para X" | Botao cancelar mudanca |
| `usage.employees / usage.limit >= 0.8` | "Voce esta usando X% do limite" | Link para `/settings/plans` |

---

## 3. Pagina: Planos (`/settings/plans`)

### 3.1 Dados Necessarios

| Secao | Endpoint | Hook Orval | Quando Carregar |
|-------|----------|------------|-----------------|
| Lista de Planos | `GET /plans` | `useGetPlans` | Mount |
| Assinatura Atual | `GET /subscription` | `useGetSubscription` | Mount |
| Perfil Cobranca | `GET /billing/profile` | `useGetBillingProfile` | Mount |

### 3.2 Acoes do Usuario

| Acao | Endpoint | Hook Orval | Pos-Sucesso |
|------|----------|------------|-------------|
| Preview mudanca | `POST /subscription/preview-change` | `usePreviewChange` | Abrir modal |
| Confirmar mudanca | `POST /subscription/change` | `useChangeSubscription` | Redirect checkout ou toast |
| Criar checkout (trial) | `POST /checkout` | `useCreateCheckout` | Redirect para URL |
| Criar perfil cobranca | `POST /billing/profile` | `useCreateBillingProfile` | Fechar modal + continuar |

### 3.3 Fluxo de Selecao de Plano

```
Usuario seleciona plano/tier/ciclo
          |
          v
    Tem assinatura ativa?
          |
    +-----+-----+
    |           |
   Sim         Nao (trial/expired)
    |           |
    v           v
POST /preview-change    Tem billing profile?
    |                         |
    v                   +-----+-----+
Modal preview           |           |
    |                  Sim         Nao
    v                   |           |
POST /change            v           v
    |             POST /checkout   Modal criar profile
    |                   |                |
    v                   v                v
Upgrade? -----> Redirect checkoutUrl    POST /billing/profile
    |                                        |
Downgrade? --> Toast "agendado"              v
                                       POST /checkout
                                             |
                                             v
                                       Redirect checkoutUrl
```

### 3.4 Request/Response de Preview

**Request:**
```typescript
interface PreviewChangeRequest {
  newPlanId?: string      // ID do novo plano
  newBillingCycle?: 'monthly' | 'yearly'
  newTierId?: string      // ID do tier (faixa de funcionarios)
}
```

**Response:**
```typescript
interface PreviewChangeResponse {
  changeType: 'upgrade' | 'downgrade' | 'cycle_change' | 'tier_change'
  current: {
    planName: string
    tierRange: string     // "31-40"
    billingCycle: string
    price: number
  }
  new: {
    planName: string
    tierRange: string
    billingCycle: string
    price: number
  }
  proration?: {
    amount: number        // Valor proporcional (upgrades)
    daysRemaining: number
  }
  effectiveAt: string     // ISO date - imediato ou fim do periodo
  featuresGained: string[]
  featuresLost: string[]
}
```

### 3.5 Estados dos Botoes

| Condicao | Texto Botao | Disabled |
|----------|-------------|----------|
| Mesmo plano + tier + ciclo | "Seu plano atual" | true |
| Trial/Expired | "Contratar" | false |
| Upgrade disponivel | "Fazer upgrade" | false |
| Downgrade disponivel | "Selecionar" | false |
| Mudanca de ciclo | "Mudar para [ciclo]" | false |

---

## 4. Pagina: Faturas (`/settings/invoices`)

### 4.1 Dados Necessarios

| Secao | Endpoint | Hook Orval | Quando Carregar |
|-------|----------|------------|-----------------|
| Lista Faturas | `GET /billing/invoices` | `useGetInvoices` | Mount + paginacao |

### 4.2 Query Parameters

```typescript
interface InvoicesQuery {
  page?: number   // default: 1
  limit?: number  // default: 20, max: 100
}
```

### 4.3 Acoes do Usuario

| Acao | Endpoint | Hook Orval | Pos-Sucesso |
|------|----------|------------|-------------|
| Download fatura | `GET /billing/invoices/:id/download` | `useDownloadInvoice` | Abrir URL |
| Paginar | `GET /billing/invoices?page=X` | `useGetInvoices` | Atualizar lista |

---

## 5. Modais

### 5.1 Modal: Editar Dados de Cobranca

**Endpoint:** `PATCH /billing/profile`

**Request:**
```typescript
interface UpdateBillingProfileRequest {
  legalName?: string
  taxId?: string        // CNPJ/CPF
  email?: string
  phone?: string
  address?: {
    street: string
    number: string
    complement?: string
    neighborhood: string
    city: string
    state: string       // UF (2 chars)
    zipCode: string     // CEP
    country?: string    // default: "BR"
  }
}
```

### 5.2 Modal: Preview Upgrade

**Trigger:** `POST /subscription/preview-change` com `changeType === 'upgrade'`

**Dados exibidos:**
- `current.planName`, `current.price`
- `new.planName`, `new.price`
- `proration.amount`, `proration.daysRemaining`
- `featuresGained[]`

**Acao confirmar:** `POST /subscription/change` → redirect para `checkoutUrl`

### 5.3 Modal: Preview Downgrade

**Trigger:** `POST /subscription/preview-change` com `changeType === 'downgrade'`

**Dados exibidos:**
- `current.planName`, `current.price`
- `new.planName`, `new.price`
- `effectiveAt` (fim do periodo)
- `featuresLost[]`

**Acao confirmar:** `POST /subscription/change` → toast "Mudanca agendada"

### 5.4 Modal: Fluxo de Cancelamento

**Passo 1 - Oferta Downgrade:**
- Exibir plano mais barato como alternativa
- Acao "Mudar para X" → `POST /subscription/preview-change`
- Acao "Cancelar mesmo assim" → Passo 2

**Passo 2 - Motivo:**
- Coletar `reason` (enum) e `comment` (opcional)
- Enviar junto com cancelamento

**Passo 3 - Confirmacao:**
- Exibir `subscription.currentPeriodEnd` como data final
- Acao "Confirmar" → `POST /subscription/cancel`

**Request:**
```typescript
interface CancelSubscriptionRequest {
  reason:
    | 'too_expensive'
    | 'not_using_enough'
    | 'missing_features'
    | 'switching_to_competitor'
    | 'company_closing'
    | 'temporary_pause'
    | 'bad_experience'
    | 'other'
  comment?: string
}
```

---

## 6. Checkout Externo

### 6.1 Criar Checkout (Trial → Pago)

**Endpoint:** `POST /checkout`

**Request:**
```typescript
interface CreateCheckoutRequest {
  planId: string
  tierId: string
  billingCycle: 'monthly' | 'yearly'
  successUrl: string    // URL de retorno apos pagamento
}
```

**Response:**
```typescript
interface CreateCheckoutResponse {
  checkoutUrl: string   // URL do Pagar.me para pagamento
  paymentLinkId: string
  expiresAt: string     // 24h
}
```

**Fluxo:**
1. Frontend chama `POST /checkout`
2. Recebe `checkoutUrl`
3. Redirect usuario para `checkoutUrl` (pagina Pagar.me)
4. Apos pagamento, Pagar.me redireciona para `successUrl`
5. Webhook processa e ativa assinatura
6. Frontend em `successUrl` faz polling ou refetch de `/subscription`

### 6.2 Atualizar Cartao

**Endpoint:** `POST /billing/update-card`

**Pre-requisito:** Tokenizar cartao com Pagar.me.js no frontend

**Request:**
```typescript
interface UpdateCardRequest {
  cardId: string  // Token do Pagar.me.js
}
```

---

## 7. Tipos Principais (Referencia Orval)

### Subscription
```typescript
interface Subscription {
  id: string
  organizationId: string
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  plan: {
    id: string
    name: string
    displayName: string
  }
  tier: {
    id: string
    minEmployees: number
    maxEmployees: number
  }
  billingCycle: 'monthly' | 'yearly'
  currentPeriodStart: string
  currentPeriodEnd: string
  trialEndsAt: string | null
  cancelAt: string | null
  canceledAt: string | null
  pagarmeSubscriptionId: string | null
  createdAt: string
  updatedAt: string
}
```

### BillingProfile
```typescript
interface BillingProfile {
  id: string
  organizationId: string
  legalName: string
  taxId: string
  email: string
  phone: string | null
  address: Address | null
  pagarmeCustomerId: string | null
  createdAt: string
  updatedAt: string
}
```

### Plan
```typescript
interface Plan {
  id: string
  name: string              // "gold", "diamond", "platinum"
  displayName: string       // "Ouro Insights"
  description: string | null
  features: string[]        // ["absences", "accidents", ...]
  limits: {
    employees: number
    // ... outros limites
  }
  isActive: boolean
  isPublic: boolean
  isTrial: boolean
  sortOrder: number
  pricingTiers: PricingTier[]
}

interface PricingTier {
  id: string
  planId: string
  minEmployees: number
  maxEmployees: number
  monthlyPrice: number      // em centavos
  yearlyPrice: number       // em centavos (com desconto)
}
```

### Invoice
```typescript
interface Invoice {
  id: string
  pagarmeInvoiceId: string
  status: 'pending' | 'paid' | 'canceled' | 'refunded'
  amount: number            // em centavos
  paidAt: string | null
  dueDate: string
  description: string
  createdAt: string
}
```

### Usage
```typescript
interface Usage {
  employees: {
    current: number
    limit: number
    percentage: number
  }
  features: {
    [featureName: string]: {
      enabled: boolean
      limit?: number
      current?: number
    }
  }
}
```

---

## 8. Cache e Invalidacao

### Queries que Devem Ser Invalidadas

| Apos Acao | Invalidar |
|-----------|-----------|
| Criar/atualizar billing profile | `['billing', 'profile']` |
| Cancelar assinatura | `['subscription']` |
| Restaurar assinatura | `['subscription']` |
| Executar mudanca de plano | `['subscription']`, `['scheduled-change']` |
| Cancelar mudanca agendada | `['scheduled-change']` |
| Atualizar cartao | `['billing', 'profile']` |

### Polling Recomendado

| Cenario | Endpoint | Intervalo |
|---------|----------|-----------|
| Apos retorno de checkout | `GET /subscription` | 2s por 30s |
| Pagamento pendente (past_due) | `GET /subscription` | 5min |

---

## 9. Tratamento de Erros

### Erros Esperados

| Codigo | Classe | Mensagem para Usuario |
|--------|--------|----------------------|
| `SUBSCRIPTION_NOT_FOUND` | 404 | "Assinatura nao encontrada" |
| `BILLING_PROFILE_NOT_FOUND` | 404 | "Configure seus dados de cobranca" |
| `BILLING_PROFILE_ALREADY_EXISTS` | 409 | (nao mostrar, usar PATCH) |
| `SAME_PLAN_ERROR` | 400 | "Voce ja esta neste plano" |
| `NO_CHANGE_REQUESTED` | 400 | "Nenhuma alteracao solicitada" |
| `EMPLOYEE_COUNT_EXCEEDS_NEW_PLAN_LIMIT` | 400 | "Reduza o numero de funcionarios antes de mudar" |
| `TRIAL_EXPIRED` | 403 | "Seu trial expirou" |
| `SUBSCRIPTION_NOT_ACTIVE` | 403 | "Assinatura nao esta ativa" |
| `SUBSCRIPTION_NOT_CANCELABLE` | 400 | "Assinatura nao pode ser cancelada" |
| `EMAIL_NOT_VERIFIED` | 403 | "Verifique seu email antes de continuar" |
| `MISSING_BILLING_DATA` | 400 | "Preencha os dados de cobranca" |

---

## 10. Checklist de Implementacao

### Pagina Assinatura
- [ ] Fetch inicial: subscription, billing profile, invoices, usage, scheduled-change
- [ ] Derivar estado da UI (trial_active, trial_warning, etc.)
- [ ] Renderizar alertas condicionais
- [ ] Secao plano atual com barra de progresso (funcionarios ou dias trial)
- [ ] Secao dados de cobranca com modal de edicao
- [ ] Secao faturas recentes com download
- [ ] Link/botao cancelar assinatura
- [ ] Botao restaurar (se cancel_scheduled)
- [ ] Alerta de mudanca agendada com opcao cancelar

### Pagina Planos
- [ ] Fetch inicial: plans, subscription, billing profile
- [ ] Seletor de quantidade de funcionarios
- [ ] Toggle ciclo mensal/anual
- [ ] Cards de planos com precos dinamicos
- [ ] Estados dos botoes (atual, upgrade, downgrade)
- [ ] Modal preview upgrade com proration
- [ ] Modal preview downgrade com features perdidas
- [ ] Integracao com checkout (redirect)
- [ ] Modal criar billing profile (se nao existir)

### Pagina Faturas
- [ ] Fetch paginado de invoices
- [ ] Tabela com data, descricao, valor, status
- [ ] Botao download por fatura
- [ ] Paginacao

### Modais
- [ ] Editar dados de cobranca (form completo)
- [ ] Preview upgrade
- [ ] Preview downgrade
- [ ] Fluxo cancelamento (3 passos)

### Integracao Pagar.me
- [ ] Tokenizacao de cartao com Pagar.me.js
- [ ] Redirect para checkout externo
- [ ] Pagina de sucesso com polling
