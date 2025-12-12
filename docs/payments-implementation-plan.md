# Plano de Implementação: Módulo de Pagamentos com Pagarme

## Objetivo

Implementar um módulo de pagamentos integrado ao Pagarme seguindo o padrão do plugin Stripe do Better Auth, com assinaturas vinculadas a organizações e fluxo de trial para conversão.

---

## Modelo de Negócio

### Fluxo de Aquisição (Self-Service + Sales-Assisted)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CANAIS DE AQUISIÇÃO                             │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
    │  Orgânico    │     │   Vendas     │     │  Indicação   │
    │  (encontrou) │     │  (outbound)  │     │  (referral)  │
    └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌──────────────────────────────────────────────────────┐
    │                   SIGNUP GRATUITO                    │
    │              (mesmo entry point para todos)          │
    └──────────────────────────┬───────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────┐
    │                      TRIAL                           │
    │              (14 dias, funcionalidades completas)    │
    └───────────┬─────────────────────────────┬────────────┘
                │                             │
                ▼                             ▼
    ┌───────────────────┐         ┌───────────────────────┐
    │   SELF-SERVICE    │         │    SALES-ASSISTED     │
    │                   │         │                       │
    │ Usuário faz       │         │ Usuário pede contato  │
    │ upgrade sozinho   │         │ ou vendas aborda      │
    │                   │         │                       │
    │ Checkout Pagarme  │         │ Demo → Proposta       │
    └───────────────────┘         └───────────────────────┘
```

### Por que esse modelo?

| Aspecto                  | Benefício                                   |
| ------------------------ | ------------------------------------------- |
| **Baixa fricção**        | Signup em 30 segundos, sem cartão           |
| **Experimentação**       | Usuário conhece o produto antes de pagar    |
| **Dados valiosos**       | Você vê como ele usa antes de converter     |
| **Confiança**            | Usuário paga sabendo o que está comprando   |
| **Conversão maior**      | Quem paga já está engajado                  |
| **Alinhado com mercado** | Mesmo padrão de Slack, Notion, Linear, etc. |

---

## Fluxo Principal: Signup → Trial → Upgrade

### Fluxo Detalhado

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FLUXO: SIGNUP → TRIAL → UPGRADE                      │
└─────────────────────────────────────────────────────────────────────────┘

[Usuário]                              [Sistema]                    [Pagarme]
    │                                      │                            │
    │ 1. POST /auth/sign-up                │                            │
    │    {name, email, password, org}      │                            │
    ├─────────────────────────────────────>│                            │
    │                                      │                            │
    │                                      │ Cria User                  │
    │                                      │ Cria Organization          │
    │                                      │ Cria Member (role: owner)  │
    │                                      │ Cria OrganizationProfile   │
    │                                      │ Cria Subscription (trial)  │
    │                                      │                            │
    │<─────────────────────────────────────│                            │
    │  {user, session, organization}       │                            │
    │                                      │                            │
    │ 2. Usa o produto (trial 14 dias)     │                            │
    │                                      │                            │
    │ 3. GET /payments/plans               │                            │
    ├─────────────────────────────────────>│                            │
    │<─────────────────────────────────────│                            │
    │  [{name: "starter"}, {name: "pro"}]  │                            │
    │                                      │                            │
    │ 4. POST /payments/checkout           │                            │
    │    {planId, successUrl, cancelUrl,   │                            │
    │     billing: {cnpj, phone, email}}   │                            │
    ├─────────────────────────────────────>│                            │
    │                                      │                            │
    │                                      │ Valida email verificado    │
    │                                      │ Salva billing data no profile│
    │                                      │ Cria Customer ────────────>│
    │                                      │<──── pagarmeCustomerId ────│
    │                                      │ Cria Checkout ────────────>│
    │                                      │<──── checkoutUrl ──────────│
    │                                      │                            │
    │<─────────────────────────────────────│                            │
    │  {checkoutUrl}                       │                            │
    │                                      │                            │
    │ 5. Redirect → Checkout Pagarme       │                            │
    ├──────────────────────────────────────┼───────────────────────────>│
    │                                      │                            │
    │                                      │      Usuário paga          │
    │                                      │                            │
    │                                      │<─── webhook (charge.paid) ─│
    │                                      │                            │
    │                                      │ Atualiza Subscription      │
    │                                      │ status: trial → active     │
    │                                      │                            │
    │ 6. Redirect intermediário            │                            │
    │<─────────────────────────────────────┼────────────────────────────│
    │                                      │                            │
    │ 7. GET /payments/checkout/callback   │                            │
    │    (aguarda webhook processar)       │                            │
    ├─────────────────────────────────────>│                            │
    │                                      │                            │
    │ 8. Redirect → successUrl final       │                            │
    │<─────────────────────────────────────│                            │
    │                                      │                            │
```

### Comparação com Better Auth + Stripe

| Aspecto                           | Better Auth + Stripe                      | Nosso Plano (Pagarme)                     |
| --------------------------------- | ----------------------------------------- | ----------------------------------------- |
| Usuário autenticado para checkout | Obrigatório                               | Obrigatório                               |
| Customer criado                   | No signup (`createCustomerOnSignUp`)      | No upgrade (quando tem CNPJ/phone)        |
| Subscription vinculada a          | User ou Organization (`referenceId`)      | Organization (`organization_id`)          |
| Checkout via gateway              | Stripe Checkout (hosted)                  | Pagarme Checkout (hosted)                 |
| Webhook processa pagamento        | Sim                                       | Sim                                       |
| Trial support                     | `freeTrial.days` + `trialStart/End`       | `trialStart/End` na subscription          |
| Trial abuse prevention            | Automático (1 trial por user em qualquer plano) | 1 trial por org (flag `trial_used`)  |
| Status inicial                    | `incomplete` (aguarda checkout)           | `trial` (signup inicia trial)             |
| Cancel                            | Redirect para Billing Portal              | Endpoint próprio + Billing Portal         |
| Restore                           | Endpoint próprio                          | Endpoint próprio                          |
| Success URL                       | Intermediate redirect (garante sync)      | Intermediate redirect (garante sync)      |
| Plan limits                       | `limits` object                           | `limits` JSON                             |
| Annual pricing                    | `annualDiscountPriceId`                   | `price_yearly`                            |
| Seats                             | Campo na subscription                     | Campo na subscription                     |
| Tabela temporária de checkout     | Não usa                                   | Não usa                                   |

**Diferenças intencionais:**
- Customer criado no upgrade (não signup): Pagarme exige CNPJ e telefone para PJ
- Status inicial "trial" (não "incomplete"): Nosso fluxo é trial-first, não checkout-first

---

## Coleta Progressiva de Dados

> **Princípio:** Coletar dados apenas quando necessário, minimizando fricção no signup
> e solicitando informações adicionais conforme o usuário avança no produto.

### Etapas de Coleta

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      COLETA PROGRESSIVA DE DADOS                        │
└─────────────────────────────────────────────────────────────────────────┘

    SIGNUP                ONBOARDING              UPGRADE
    (obrigatório)         (opcional)              (obrigatório p/ pagar)
    ─────────────         ──────────              ───────────────────────
    • Email               • Telefone              • CNPJ
    • Senha               • Cargo                 • Telefone (se não tem)
    • Nome                • Tamanho empresa       • Email para NF
    • Nome da empresa     • Como conheceu
```

### Signup (4 campos - obrigatórios)

| Dado            | Motivo                       |
| --------------- | ---------------------------- |
| Email           | Autenticação e comunicação   |
| Senha           | Autenticação                 |
| Nome do usuário | Personalização ("Olá, João") |
| Nome da empresa | Identificação da organização |

**Regras:**

- Signup deve ser completado em menos de 30 segundos
- Não exigir verificação de email para iniciar trial
- Criar subscription em status "trial" automaticamente após signup

### Onboarding (opcional - pós signup)

| Dado               | Motivo                                           |
| ------------------ | ------------------------------------------------ |
| Telefone           | Contato e qualificação de lead                   |
| Cargo              | Qualificação de lead                             |
| Tamanho da empresa | Qualificação de lead (1-10, 11-50, 51-200, 200+) |
| Como conheceu      | Atribuição de marketing                          |

**Regras:**

- Exibir no primeiro login como modal ou página dedicada
- Permitir pular sem preencher
- Dados usados pelo time de vendas para qualificação

### Upgrade/Checkout (obrigatórios para pagamento)

| Dado              | Motivo                       |
| ----------------- | ---------------------------- |
| CNPJ              | Exigido pelo Pagarme para PJ |
| Telefone          | Exigido pelo Pagarme         |
| Email de cobrança | Para envio de notas fiscais  |

**Regras:**

- Exibir formulário de dados faltantes antes de redirecionar ao checkout
- Validar CNPJ (formato e dígitos verificadores)
- Exigir verificação de email antes do upgrade
- Customer no Pagarme é criado apenas neste momento (quando temos todos os dados)

### Verificação de Email

| Momento                      | Exigido? |
| ---------------------------- | -------- |
| Para iniciar trial           | Não      |
| Para usar o produto no trial | Não      |
| Para fazer upgrade           | Sim      |

**Motivo:** Reduz fricção no signup, mas garante email válido antes de cobrar.

---

## Funcionalidades a Implementar

### Core Features

| Feature                        | Descrição                                                    |
| ------------------------------ | ------------------------------------------------------------ |
| Signup com trial               | Criar org + user + subscription (trial) no signup            |
| Criação de customer no upgrade | Criar customer no Pagarme apenas quando tiver todos os dados |
| Gerenciamento de planos        | Definir e gerenciar planos de assinatura                     |
| Checkout para upgrade          | Gerar link de checkout Pagarme para upgrade                  |
| Ciclo de vida de assinaturas   | Criar, atualizar, cancelar e restaurar assinaturas           |
| Webhooks seguros               | Processar eventos do Pagarme com verificação HMAC            |
| Períodos de trial              | Suporte a trial com prevenção de abuso (1 trial por org)     |
| Expiração de trial             | Job para expirar trials e notificar usuários                 |
| Sistema de seats               | Controle de quantidade de membros por plano                  |

### Features Adicionais (Paridade com Stripe Plugin)

| Feature              | Descrição                                                   |
| -------------------- | ----------------------------------------------------------- |
| Billing Portal       | Redirect para portal Pagarme (gerenciar cartões, faturas)   |
| Hooks/Callbacks      | Sistema de eventos (onTrialStart, onTrialExpired, etc.)     |
| Plan Limits          | Metadata de limites por plano (max projetos, storage, etc.) |
| Authorization System | Verificar permissão por ação (upgrade, cancel, list)        |
| Annual Pricing       | Suporte a preços anuais com desconto                        |

---

## Modelo de Dados

> **Importante:** As tabelas do Better Auth (`user`, `organization`, `member`, `session`, etc.)
> não devem ser modificadas. Todos os dados específicos do módulo de pagamentos serão
> armazenados em tabelas próprias com relacionamentos via foreign key.

### Tabelas do Módulo de Pagamentos

#### `organization_profile`

Dados complementares da organização para billing e Pagarme.

| Campo               | Descrição                           |
| ------------------- | ----------------------------------- |
| organization_id     | FK para organization do Better Auth |
| document            | CNPJ da empresa                     |
| phone               | Telefone de contato                 |
| billing_email       | Email para notas fiscais            |
| pagarme_customer_id | ID do customer no Pagarme           |
| company_size        | Tamanho da empresa (qualificação)   |
| industry            | Setor de atuação (qualificação)     |

#### `subscription`

Assinatura da organização.

| Campo                   | Descrição                                  |
| ----------------------- | ------------------------------------------ |
| organization_id         | FK para organization do Better Auth        |
| plan_id                 | FK para subscription_plan                  |
| status                  | trial, active, past_due, canceled, expired |
| pagarme_subscription_id | ID da subscription no Pagarme              |
| trial_start             | Início do trial                            |
| trial_end               | Fim do trial                               |
| trial_used              | Flag para prevenir abuso de trial          |
| current_period_start    | Início do período de cobrança              |
| current_period_end      | Fim do período de cobrança                 |
| cancel_at_period_end    | Se cancela no fim do período               |
| canceled_at             | Data do cancelamento                       |
| seats                   | Quantidade de membros contratados          |

#### `subscription_plan`

Planos de assinatura disponíveis.

| Campo           | Descrição                                          |
| --------------- | -------------------------------------------------- |
| name            | Identificador único (starter, pro, enterprise)     |
| display_name    | Nome de exibição                                   |
| pagarme_plan_id | ID do plano no Pagarme                             |
| price_monthly   | Preço mensal em centavos                           |
| price_yearly    | Preço anual em centavos (com desconto)             |
| trial_days      | Dias de trial (padrão: 14)                         |
| limits          | JSON com limites (max_members, max_projects, etc.) |
| is_active       | Se o plano está ativo                              |
| is_public       | Se aparece na página de preços                     |
| sort_order      | Ordem de exibição                                  |

#### `subscription_event`

Auditoria e idempotência de webhooks.

| Campo            | Descrição                                    |
| ---------------- | -------------------------------------------- |
| subscription_id  | FK para subscription                         |
| event_type       | Tipo do evento                               |
| pagarme_event_id | ID único do evento no Pagarme (idempotência) |
| payload          | JSON com dados do evento                     |
| processed_at     | Quando foi processado                        |
| error            | Erro se houver falha                         |

### Relacionamentos

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MODELO DE DADOS                                 │
└─────────────────────────────────────────────────────────────────────────┘

  BETTER AUTH (não modificar)              MÓDULO PAYMENTS (nossas tabelas)
  ───────────────────────────              ────────────────────────────────

  ┌──────────────┐                         ┌─────────────────────┐
  │    user      │                         │ organization_profile│
  └──────────────┘                         ├─────────────────────┤
         │                                 │ document (CNPJ)     │
         │                                 │ phone               │
         ▼                                 │ billing_email       │
  ┌──────────────┐         1:1             │ pagarme_customer_id │
  │ organization │◄────────────────────────│ company_size        │
  └──────────────┘                         │ industry            │
         │                                 └─────────────────────┘
         │
         │ 1:N                             ┌─────────────────────┐
         └────────────────────────────────►│   subscription      │
                                           ├─────────────────────┤
                                           │ status              │
                                           │ trial_start/end     │
                                           │ current_period_*    │
                                           │ seats               │
                                           └──────────┬──────────┘
                                                      │
                                                      │ N:1
                                                      ▼
                                           ┌─────────────────────┐
                                           │  subscription_plan  │
                                           ├─────────────────────┤
                                           │ name, price         │
                                           │ limits              │
                                           │ trial_days          │
                                           └─────────────────────┘
```

---

## Regras de Negócio

### Trial

| Regra                 | Descrição                                   |
| --------------------- | ------------------------------------------- |
| Duração padrão        | 14 dias                                     |
| Início                | Automático após signup                      |
| Prevenção de abuso    | 1 trial por organização (flag `trial_used`) |
| Expiração             | Job diário marca como "expired"             |
| Notificação           | Email 3 dias antes de expirar               |
| Acesso após expiração | Bloqueado até fazer upgrade                 |

### Status da Subscription

| Status     | Descrição                            | Acesso ao produto       |
| ---------- | ------------------------------------ | ----------------------- |
| `trial`    | Em período de trial                  | Completo                |
| `active`   | Pagamento confirmado                 | Completo                |
| `past_due` | Pagamento falhou                     | Limitado (grace period) |
| `canceled` | Cancelado, aguardando fim do período | Completo até fim        |
| `expired`  | Trial ou período acabou              | Bloqueado               |

### Checkout/Upgrade

| Regra                  | Descrição                                                                 |
| ---------------------- | ------------------------------------------------------------------------- |
| Pré-requisito          | Email verificado                                                          |
| Dados obrigatórios     | CNPJ, telefone, email de cobrança                                         |
| Customer Pagarme       | Criado apenas no momento do checkout                                      |
| Redirecionamento       | Após coletar dados faltantes                                              |
| Success URL (redirect) | Usar redirect intermediário para garantir que webhook processou antes do redirect final |

**Success URL handling (padrão Better Auth):**
O `successUrl` informado pelo cliente passa por um redirect intermediário que:
1. Aguarda confirmação de que o webhook foi processado
2. Garante que a subscription está atualizada no banco
3. Só então redireciona para a URL final

Isso evita race conditions onde o usuário chega na página de sucesso antes do status estar atualizado.

### Cancelamento

| Regra        | Descrição                               |
| ------------ | --------------------------------------- |
| Tipo         | Soft delete (cancela no fim do período) |
| Acesso       | Mantém até `current_period_end`         |
| Restauração  | Permitida antes do fim do período       |
| Após período | Status muda para `expired`              |

### Autorização

| Ação                    | Quem pode       |
| ----------------------- | --------------- |
| Visualizar subscription | Qualquer membro |
| Fazer upgrade           | Owner ou Admin  |
| Cancelar                | Owner ou Admin  |
| Restaurar               | Owner ou Admin  |
| Acessar billing portal  | Owner ou Admin  |

### Webhooks

| Evento Pagarme          | Ação no sistema                        |
| ----------------------- | -------------------------------------- |
| `charge.paid`           | Ativar subscription, atualizar período |
| `charge.failed`         | Marcar como `past_due`, notificar      |
| `subscription.canceled` | Marcar `cancel_at_period_end = true`   |

**Regras de processamento:**

- Validar assinatura HMAC antes de processar
- Garantir idempotência via `pagarme_event_id`
- Registrar todos os eventos na tabela `subscription_event`

### Eventos Internos (Hooks)

| Evento                   | Quando dispara          |
| ------------------------ | ----------------------- |
| `trial.started`          | Após signup             |
| `trial.expiring`         | 3 dias antes de expirar |
| `trial.expired`          | Trial expirou           |
| `subscription.activated` | Pagamento confirmado    |
| `subscription.canceled`  | Usuário cancelou        |
| `subscription.renewed`   | Renovação automática    |
| `charge.paid`            | Pagamento aprovado      |
| `charge.failed`          | Pagamento falhou        |

### Limites por Plano

Cada plano define limites que são verificados em tempo de execução:

- Máximo de membros na organização
- Máximo de projetos
- Espaço de armazenamento
- Features habilitadas

**Regra:** Ao atingir limite, bloquear ação e sugerir upgrade.

---

## Rotas da API

| Método | Rota                                      | Auth | Permissão   | Descrição                          |
| ------ | ----------------------------------------- | ---- | ----------- | ---------------------------------- |
| GET    | `/payments/plans`                         | Sim  | Qualquer    | Listar planos disponíveis          |
| GET    | `/payments/plans/:id`                     | Sim  | Qualquer    | Detalhes do plano                  |
| POST   | `/payments/checkout`                      | Sim  | Admin/Owner | Gerar link de upgrade              |
| GET    | `/payments/checkout/callback`             | Sim  | -           | Redirect intermediário pós-checkout |
| GET    | `/payments/subscription`                  | Sim  | Qualquer    | Status da subscription atual       |
| POST   | `/payments/subscription/cancel`           | Sim  | Admin/Owner | Cancelar no fim do período         |
| POST   | `/payments/subscription/restore`          | Sim  | Admin/Owner | Restaurar cancelada                |
| POST   | `/payments/billing/portal`                | Sim  | Admin/Owner | Redirect para portal Pagarme       |
| GET    | `/payments/billing/invoices`              | Sim  | Qualquer    | Listar faturas                     |
| GET    | `/payments/billing/invoices/:id/download` | Sim  | Qualquer    | Download PDF da fatura             |
| POST   | `/payments/webhooks/pagarme`              | HMAC | -           | Webhooks do Pagarme                |

---

## Fases de Implementação

### Fase 1: Infraestrutura

**Objetivo:** Preparar base técnica para o módulo.

- Configurar variáveis de ambiente do Pagarme
- Criar tabelas do módulo de pagamentos
- Implementar client HTTP para API do Pagarme
- Definir tipos das respostas da API Pagarme

### Fase 2: Fluxo de Signup com Trial

**Objetivo:** Ao criar conta, organização inicia automaticamente em trial.

- Criar subscription com status "trial" após signup
- Calcular data de expiração do trial (14 dias)
- Criar profile da organização (tabela separada)
- Emitir evento `trial.started`

### Fase 3: Fluxo de Upgrade

**Objetivo:** Permitir que usuário faça upgrade do trial para plano pago.

- Validar dados obrigatórios (CNPJ, telefone, email)
- Criar customer no Pagarme
- Gerar link de checkout do Pagarme
- Redirecionar usuário para pagamento

### Fase 4: Processamento de Webhooks

**Objetivo:** Reagir a eventos do Pagarme.

- Validar assinatura HMAC
- Processar eventos de forma idempotente
- Atualizar status da subscription conforme evento
- Emitir eventos internos (hooks)

### Fase 5: Gestão de Billing

**Objetivo:** Permitir visualização de faturas e acesso ao portal.

- Listar faturas da organização
- Gerar URL de download de fatura
- Redirecionar para portal do Pagarme

### Fase 6: Ciclo de Vida

**Objetivo:** Gerenciar expiração, cancelamento e renovação.

- Job de expiração de trials
- Notificações de trial expirando
- Cancelamento com acesso até fim do período
- Restauração de subscription cancelada

### Fase 7: Autorização e Limites

**Objetivo:** Controlar acesso às funcionalidades.

- Verificar permissão por ação e role
- Verificar limites do plano antes de ações
- Bloquear ações quando limite atingido

---

## Análise de Viabilidade: Pagarme API

> Análise baseada na documentação oficial do Pagarme SDK Node.js e API Reference.

### Funcionalidades Disponíveis no Pagarme

| Funcionalidade | Disponível | Método/Endpoint | Observações |
| -------------- | ---------- | --------------- | ----------- |
| **Customer** | ✅ | `customersController.createCustomer()` | Suporta document (CNPJ/CPF), phones, address |
| **Subscription** | ✅ | `subscriptionsController.createSubscription()` | Suporta plan_id, customer_id, items, metadata |
| **Plans** | ✅ | `plansController.createPlan()` | Suporta interval, interval_count, items, trial_period_days |
| **Cancel Subscription** | ✅ | `subscriptionsController.cancelSubscription()` | Suporta `cancel_pending_invoices` |
| **Renew Subscription** | ✅ | `subscriptionsController.renewSubscription()` | Renova ciclo manualmente |
| **Invoices** | ✅ | `invoicesController.getInvoices()` | Filtro por customer, subscription, status |
| **Get Invoice** | ✅ | `invoicesController.getInvoice()` | Retorna URL do boleto/invoice |
| **Charges** | ✅ | `chargesController.createCharge()` | Cobranças avulsas |
| **Update Card** | ✅ | `subscriptionsController.updateSubscriptionCard()` | Atualiza cartão da subscription |
| **Payment Link** | ✅ | `POST /reference/create-link` | Checkout hosted |
| **Discounts** | ✅ | `subscriptionsController.createDiscount()` | Cupons/descontos |
| **Webhooks** | ✅ | Configuração no dashboard | Eventos de charge, subscription, invoice |

### Trial Period no Pagarme

| Aspecto | Suporte | Como Implementar |
| ------- | ------- | ---------------- |
| Trial no plano | ✅ | Campo `trial_period_days` no `CreatePlanRequest` |
| Trial na subscription | ⚠️ | Não há campo direto; usar `start_at` futuro ou gerenciar localmente |
| Trial abuse prevention | ❌ | Implementar no nosso sistema (flag `trial_used`) |

**Estratégia para Trial:**
- Criar plano com `trial_period_days: 14`
- OU gerenciar trial localmente (nossa tabela subscription com `trial_start/end`)
- Prevenir abuso via flag `trial_used` na nossa tabela

### Checkout Hosted (Payment Link)

| Aspecto | Suporte | Detalhes |
| ------- | ------- | -------- |
| Payment Link | ✅ | `POST /reference/create-link` |
| Success URL | ✅ | Campo `success_url` no checkout |
| Cancel URL | ✅ | Campo disponível |
| Métodos de pagamento | ✅ | `accepted_payment_methods`: credit_card, boleto, pix |
| Billing address | ✅ | `billing_address` no request |

**Nota:** Pagarme oferece Payment Links mas não um "Checkout Session" idêntico ao Stripe. O fluxo é:
1. Criar order com checkout payment
2. Redirecionar para URL do payment link
3. Receber webhook quando pago

### Webhooks Pagarme

| Evento | Equivalente Stripe | Ação |
| ------ | ------------------ | ---- |
| `charge.paid` | `invoice.paid` | Ativar subscription |
| `charge.payment_failed` | `invoice.payment_failed` | Marcar past_due |
| `subscription.canceled` | `customer.subscription.deleted` | Marcar canceled |
| `subscription.created` | `customer.subscription.created` | Log/audit |
| `invoice.created` | `invoice.created` | Notificar usuário |

**Validação:** Pagarme usa assinatura HMAC no header para validar webhooks.

### Gaps Identificados

| Feature | Stripe | Pagarme | Solução |
| ------- | ------ | ------- | ------- |
| Billing Portal nativo | ✅ | ❌ | Criar telas próprias ou usar links diretos |
| Hosted Checkout Session | ✅ | ⚠️ | Usar Payment Link + Order |
| Proration automático | ✅ | ❌ | Calcular manualmente se necessário |
| Trial abuse prevention | ✅ | ❌ | Implementar flag `trial_used` |
| Subscription restore | ✅ | ❌ | Implementar via reativação manual |
| Dunning (retry automático) | ✅ | ⚠️ | Configurar no dashboard Pagarme |

### Adaptações Necessárias

1. **Checkout Flow:**
   - Stripe: `createCheckoutSession()` → redirect → webhook
   - Pagarme: `createOrder()` com `checkout` payment → redirect para payment link → webhook

2. **Trial Management:**
   - Gerenciar trial localmente na nossa tabela `subscription`
   - Usar `trial_start`, `trial_end`, `trial_used` para controle
   - Job de expiração continua necessário

3. **Billing Portal:**
   - Pagarme não tem portal self-service nativo
   - Opções: (a) criar telas próprias, (b) usar API para listar invoices/update card

4. **Subscription Restore:**
   - Implementar endpoint próprio que:
     - Remove flag `cancel_at_period_end`
     - Atualiza status para `active`
     - Chama API Pagarme se necessário

### Conclusão da Viabilidade

| Aspecto | Viabilidade | Nota |
| ------- | ----------- | ---- |
| Core subscription flow | ✅ Alta | APIs completas |
| Trial management | ✅ Alta | Gerenciar localmente |
| Checkout hosted | ✅ Alta | Via Payment Link |
| Webhooks | ✅ Alta | Eventos equivalentes |
| Billing management | ⚠️ Média | Sem portal nativo, criar telas |
| Cancel/Restore | ✅ Alta | Cancel nativo, restore manual |
| Invoices/Faturas | ✅ Alta | APIs completas |

**Veredicto: VIÁVEL** - Todas as funcionalidades planejadas podem ser implementadas com Pagarme, com algumas adaptações para features que não são nativas (billing portal, trial abuse prevention, restore).

---

## Referências

- [Pagarme API v5 Docs](https://docs.pagar.me/reference/getting-started-with-your-api)
- [Pagarme Node.js SDK](https://github.com/pagarme/pagarme-nodejs-sdk)
- [Better-Auth Stripe Plugin](https://www.better-auth.com/docs/plugins/stripe)
- [Elysia Best Practices](https://elysiajs.com/essential/best-practice.html)
