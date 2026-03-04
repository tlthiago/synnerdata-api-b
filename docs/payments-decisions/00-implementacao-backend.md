# Implementação Backend - Módulo de Payments

> Documento de referência para acompanhamento do progresso de implementação.
> Foco: Backend MVP

---

## Status Geral

| Fase | Status | Progresso |
|------|--------|-----------|
| Já Implementado | ✅ | Base funcional |
| MVP - Prioridade Alta | ✅ | 5/5 concluído |
| MVP - Prioridade Média | 🔴 | Não iniciado |
| MVP - Prioridade Baixa | 🔴 | Não iniciado |
| Fase 2 | ⏸️ | Aguardando |

---

## 1. Já Implementado ✅

Funcionalidades que já existem no codebase:

### Trial & Subscription
- [x] Criação automática de trial ao criar organização (Better Auth hook)
- [x] `SubscriptionService.createTrial()` - Cria trial de 14 dias
- [x] `SubscriptionService.checkAccess()` - Verifica acesso e status
- [x] `SubscriptionService.cancel()` - Soft cancel (agenda para fim do período)
- [x] `SubscriptionService.restore()` - Restaura cancelamento agendado
- [x] `SubscriptionService.activate()` - Ativa assinatura
- [x] `SubscriptionService.markPastDue()` - Marca como inadimplente
- [x] `SubscriptionService.expireTrial()` - Expira trial
- [x] `SubscriptionService.suspend()` - Suspende por inadimplência

### Checkout
- [x] `CheckoutService.create()` - Cria checkout com payment link
- [x] Validação de email verificado
- [x] Validação de dados de cobrança
- [x] Integração com Pagar.me payment links
- [x] Metadados no payment link (organization_id, plan_id, etc.)

### Planos & Pricing
- [x] `PlanService` - CRUD de planos
- [x] `PricingTierService` - Tiers por faixa de funcionários
- [x] Sincronização lazy de planos com Pagar.me
- [x] 10 faixas de funcionários (0-10 até 91-180)

### Mudança de Plano
- [x] `PlanChangeService.changePlan()` - Muda plano
- [x] `PlanChangeService.changeBillingCycle()` - Muda ciclo
- [x] `PlanChangeService.cancelScheduledChange()` - Cancela mudança agendada
- [x] `PlanChangeService.getScheduledChange()` - Consulta mudança agendada
- [x] `PlanChangeService.executeScheduledChange()` - Executa mudança
- [x] `PlanChangeService.calculateProration()` - Calcula valor proporcional
- [x] `PlanChangeService.getChangeType()` - Determina upgrade/downgrade

### Limites
- [x] `LimitsService.checkFeatureAccess()` - Valida acesso a features
- [x] `LimitsService.requireFeatureAccess()` - Exige acesso (throw error)

### Webhooks
- [x] `WebhookService.process()` - Processa webhooks do Pagar.me
- [x] Handler: `subscription.created`
- [x] Handler: `subscription.canceled`
- [x] Handler: `subscription.updated`
- [x] Handler: `charge.paid`
- [x] Handler: `charge.payment_failed`
- [x] Handler: `charge.refunded`

### Jobs
- [x] `JobsService.expireTrials()` - Expira trials vencidos
- [x] `JobsService.notifyExpiringTrials()` - Notifica trials expirando
- [x] `JobsService.processScheduledCancellations()` - Processa cancelamentos
- [x] `JobsService.suspendExpiredGracePeriods()` - Suspende inadimplentes
- [x] `JobsService.processScheduledPlanChanges()` - Processa mudanças de plano

### Billing
- [x] `BillingService.getInvoices()` - Lista faturas
- [x] `BillingService.getInvoice()` - Detalhe da fatura
- [x] `BillingService.downloadInvoice()` - Download PDF
- [x] `BillingService.updatePaymentMethod()` - Atualiza cartão

### Emails (Parcial)
- [x] Trial expirando
- [x] Trial expirado
- [x] Checkout link
- [x] Assinatura ativada
- [x] Pagamento falhou
- [x] Cancelamento agendado
- [x] Cancelamento executado
- [x] Mudança de plano executada

---

## 2. MVP - Prioridade Alta 🟡

Funcionalidades críticas para o fluxo principal funcionar corretamente.

### 2.1 Plano Trial Separado ✅
> Referência: `01-onboarding-trial-planos.md` seção 11-13

- [x] Criar plano "Trial" no seed com `isTrial: true`
- [x] Adicionar campo `isTrial` na tabela `subscriptionPlans`
- [x] Ajustar `createTrial()` para usar plano Trial (busca por `isTrial: true`)
- [x] Criar constante `DEFAULT_TRIAL_EMPLOYEE_LIMIT = 10`
- [x] Definir `employeeCount = 10` ao criar trial (limite do tier mínimo)

**Arquivos modificados:**
- `src/db/schema/payments.ts`
- `src/db/seeds/plans.ts`
- `src/modules/payments/subscription/subscription.service.ts`
- `src/modules/payments/plan/plan.model.ts`
- `src/modules/payments/plan/plan.service.ts`
- `src/test/fixtures/plans.ts`
- `src/test/helpers/seed.ts`

### 2.2 Validação de Limite de Funcionários ✅
> Referência: `03-upgrades-downgrades.md` seção 12-13

- [x] Criar `LimitsService.checkEmployeeLimit(organizationId)`
- [x] Criar `LimitsService.requireEmployeeLimit(organizationId)`
- [x] Criar `LimitsService.getEmployeeUsagePercentage(organizationId)`
- [x] Criar erro `EmployeeLimitReachedError`
- [x] Adicionar validação no endpoint de cadastro de funcionário

**Arquivos modificados:**
- `src/modules/payments/limits/limits.service.ts`
- `src/modules/payments/limits/limits.model.ts`
- `src/modules/payments/errors.ts`
- `src/modules/employees/employee.service.ts`
- `src/test/helpers/employee.ts`
- `src/test/helpers/subscription.ts`

### 2.3 Método Unificado de Mudança de Assinatura ✅
> Referência: `03-upgrades-downgrades.md` seção 1

- [x] Criar `PlanChangeService.changeSubscription()` unificado
- [x] Aceitar: `newPlanId?`, `newBillingCycle?`, `newEmployeeCount?`
- [x] Validar "mesma configuração" (nenhuma mudança)
- [x] Criar erro `NoChangeRequestedError`
- [x] Deprecar/manter `changePlan()` e `changeBillingCycle()` como wrappers

**Arquivos modificados:**
- `src/modules/payments/plan-change/plan-change.service.ts`
- `src/modules/payments/plan-change/plan-change.model.ts`
- `src/modules/payments/plan-change/index.ts`
- `src/modules/payments/errors.ts`

### 2.4 Validação de Funcionários no Downgrade ✅
> Referência: `03-upgrades-downgrades.md` seção 5

- [x] Antes de agendar downgrade, validar `currentEmployees <= newTier.maxEmployees`
- [x] Criar erro `EmployeeCountExceedsNewPlanLimitError`
- [x] Retornar mensagem clara com quantidade a remover

**Arquivos modificados:**
- `src/modules/payments/plan-change/plan-change.service.ts`
- `src/modules/payments/errors.ts`

### 2.5 Usar `pendingPricingTierId` no Downgrade ✅
> Referência: `03-upgrades-downgrades.md` seção 4

- [x] Incluir `pendingPricingTierId` ao agendar downgrade de tier
- [x] Ajustar `executeScheduledChange()` para aplicar novo tier
- [x] Garantir `employeeCount = tier.maxEmployees` após mudança

**Arquivos modificados:**
- `src/modules/payments/plan-change/plan-change.service.ts`

---

## 3. MVP - Prioridade Média 🔴

Funcionalidades importantes mas não bloqueantes.

### 3.1 Coleta de Motivo de Cancelamento
> Referência: `04-cancelamento.md` seção 4

- [ ] Criar tabela `cancellationFeedback` ou adicionar campos em `orgSubscriptions`
- [ ] Criar enum com motivos de cancelamento
- [ ] Ajustar `SubscriptionService.cancel()` para aceitar `reason` e `comment`
- [ ] Endpoint para listar motivos disponíveis

**Arquivos a modificar:**
- `src/db/schema/payments.ts`
- `src/modules/payments/subscription/subscription.service.ts`
- `src/modules/payments/subscription/subscription.model.ts`

### 3.2 Oferta de Downgrade antes de Cancelar
> Referência: `04-cancelamento.md` seção 3.1

- [ ] Endpoint para sugerir plano mais barato baseado no atual
- [ ] Retornar: plano sugerido, preço, features mantidas

**Arquivos a criar:**
- `src/modules/payments/retention/retention.service.ts`

### 3.3 Endpoint de Features Perdidas no Downgrade
> Referência: `03-upgrades-downgrades.md` seção 9

- [ ] Endpoint que compara features do plano atual vs novo
- [ ] Retornar lista de features que serão perdidas

**Arquivos a modificar:**
- `src/modules/payments/plan-change/plan-change.service.ts`

### 3.4 Jobs de Lembretes de Downgrade
> Referência: `03-upgrades-downgrades.md` seção 10

- [ ] Criar `JobsService.notifyUpcomingDowngrades()`
- [ ] Enviar emails 7, 3, 1 dias antes da execução
- [ ] Criar templates de email

**Arquivos a modificar:**
- `src/modules/payments/jobs/jobs.service.ts`
- `src/lib/email/templates/`

### 3.5 Jobs de Lembretes de Cancelamento
> Referência: `04-cancelamento.md` seção 5

- [ ] Criar `JobsService.notifyScheduledCancellations()`
- [ ] Enviar emails 7, 3, 1 dias antes da execução
- [ ] Criar templates de email

**Arquivos a modificar:**
- `src/modules/payments/jobs/jobs.service.ts`
- `src/lib/email/templates/`

---

## 4. MVP - Prioridade Baixa 🔴

Funcionalidades desejáveis mas podem aguardar.

### 4.1 Emails de Trial (Dias 1, 3, 7)
> Referência: `05-emails-notificacoes.md` seção 1

- [ ] Job para email de boas-vindas (dia 1)
- [ ] Job para email de valor (dia 3)
- [ ] Job para email de engajamento (dia 7)
- [ ] Criar templates de email

**Arquivos a modificar:**
- `src/modules/payments/jobs/jobs.service.ts`
- `src/lib/email/templates/`

### 4.2 Emails de Limite de Funcionários
> Referência: `05-emails-notificacoes.md` seção 7

- [ ] Job para verificar uso de funcionários diariamente
- [ ] Enviar email ao atingir 80%, 95%, 100%
- [ ] Criar templates de email

**Arquivos a modificar:**
- `src/modules/payments/jobs/jobs.service.ts`
- `src/lib/email/templates/`

### 4.3 Cancelamento pelo Admin
> Referência: `04-cancelamento.md` seção 11

- [ ] Endpoint admin para cancelar assinatura (imediato ou agendado)
- [ ] Endpoint admin para restaurar assinatura
- [ ] Endpoint admin para estender período
- [ ] Motivos específicos de cancelamento admin
- [ ] Logs de auditoria
- [ ] Notificação opcional ao cliente

**Arquivos a criar:**
- `src/modules/payments/admin/admin.service.ts`
- `src/modules/payments/admin/admin.routes.ts`

### 4.4 Emails de Grace Period
> Referência: `05-emails-notificacoes.md` seção 3

- [ ] Emails nos dias 5, 10, 14 do grace period
- [ ] Criar templates de email

**Arquivos a modificar:**
- `src/modules/payments/jobs/jobs.service.ts`
- `src/lib/email/templates/`

---

## 5. Fase 2 ⏸️

Funcionalidades para implementação futura.

### Retenção Avançada
- [ ] Ofertas de desconto para retenção
- [ ] Pausar assinatura (1-3 meses)
- [ ] Sequência de win-back emails

### Dados e Compliance
- [ ] LGPD: Endpoint para exclusão de dados
- [ ] Cold storage e exclusão programada (90 dias)

### Billing Avançado
- [ ] Sistema de reembolsos
- [ ] Boleto como método de pagamento
- [ ] Pix como método de pagamento
- [ ] NFS-e automática

### Emails Pós-Expiração
- [ ] Emails dias 17, 21, 30 após expiração do trial

### Admin Avançado
- [ ] Dashboard de métricas de cancelamento
- [ ] Dashboard de receita (se cliente solicitar)

---

## 6. Ordem de Implementação Sugerida

### Sprint 1: Fundação
1. ✅ Plano Trial separado (2.1)
2. ✅ Validação de limite de funcionários (2.2)

### Sprint 2: Mudanças de Plano ✅
3. ✅ Método unificado `changeSubscription()` (2.3)
4. ✅ Validação de funcionários no downgrade (2.4)
5. ✅ Usar `pendingPricingTierId` (2.5)

### Sprint 3: Cancelamento
6. ⬚ Coleta de motivo de cancelamento (3.1)
7. ⬚ Oferta de downgrade antes de cancelar (3.2)

### Sprint 4: Comunicação
8. ⬚ Endpoint features perdidas (3.3)
9. ⬚ Jobs de lembretes de downgrade (3.4)
10. ⬚ Jobs de lembretes de cancelamento (3.5)

### Sprint 5: Polimento
11. ⬚ Emails de trial (4.1)
12. ⬚ Emails de limite de funcionários (4.2)
13. ⬚ Cancelamento pelo admin (4.3)
14. ⬚ Emails de grace period (4.4)

---

## 7. Referências

| Documento | Conteúdo |
|-----------|----------|
| `01-onboarding-trial-planos.md` | Trial, planos, limites |
| `02-checkout-contratacao.md` | Checkout, billing profiles |
| `03-upgrades-downgrades.md` | Mudanças de plano, proration |
| `04-cancelamento.md` | Cancelamento, retenção |
| `05-emails-notificacoes.md` | Lista de emails |
| `06-paginas-frontend.md` | Páginas frontend (referência) |

---

## 8. Anotações de Progresso

### 28/12/2024 - Plano Trial Separado (2.1)

**Implementado:**
- Campo `isTrial: boolean` na tabela `subscriptionPlans`
- Plano Trial com `isTrial: true`, `isPublic: false`, preço 0
- `PLAN_FEATURES.trial` com todas as features (igual Platinum)
- `createTrial()` busca plano por `isTrial: true` (não mais por nome)
- Constante `DEFAULT_TRIAL_EMPLOYEE_LIMIT = 10` para limite de funcionários no trial
- Trial agora define `employeeCount = 10` para evitar cadastro excessivo durante período gratuito

**Decisões técnicas:**
- Removida constante `DEFAULT_TRIAL_PLAN_NAME` (não utilizada após mudança para busca por `isTrial`)
- Trial tem limite de 10 funcionários para garantir compatibilidade com tier mínimo na contratação

**Testes:**
- 6 novos testes em `trial-plan.test.ts`
- 390 testes passando no módulo de payments

### 28/12/2024 - Validação de Limite de Funcionários (2.2)

**Implementado:**
- `LimitsService.checkEmployeeLimit(organizationId)` - Retorna `{ current, limit, canAdd }`
- `LimitsService.requireEmployeeLimit(organizationId)` - Lança erro se limite atingido
- `LimitsService.getEmployeeUsagePercentage(organizationId)` - Retorna percentual de uso (0-100)
- `EmployeeLimitReachedError` com código `EMPLOYEE_LIMIT_REACHED`
- Tipo `CheckEmployeeLimitData` para tipagem forte
- Validação integrada em `EmployeeService.create()` via dynamic import

**Decisões técnicas:**
- Funcionários soft-deleted (deletedAt != null) NÃO contam no limite
- Sem subscription → limit = 0 (bloqueia criação)
- Dynamic import do `LimitsService` para evitar dependência circular
- Helper `ensureSubscriptionExists()` adicionado em `createTestEmployee()` para compatibilidade de testes

**Testes:**
- 6 novos testes em `limits.service.test.ts` para os métodos de limite
- 400 testes passando no módulo de payments
- 1364 testes passando no total (todos os módulos)

### 28/12/2024 - Método Unificado + Validações (2.3, 2.4, 2.5)

**Implementado:**
- `PlanChangeService.changeSubscription()` - Método unificado que aceita `newPlanId?`, `newBillingCycle?`, `newEmployeeCount?`
- `NoChangeRequestedError` - Erro para quando a configuração é igual à atual
- `EmployeeCountExceedsNewPlanLimitError` - Erro para downgrade com funcionários excedentes
- `validateEmployeeCountForDowngrade()` - Valida se funcionários atuais cabem no novo tier
- `processUnifiedUpgrade()` - Processa upgrade com checkout
- `scheduleUnifiedDowngrade()` - Agenda downgrade com `pendingPricingTierId`
- Endpoint `POST /v1/payments/subscription/change` - Endpoint unificado
- Métodos `changePlan()` e `changeBillingCycle()` mantidos como wrappers para backward compatibility

**Decisões técnicas:**
- Quando `pricingTierId` não está definido na subscription, o sistema busca automaticamente o tier apropriado baseado no `employeeCount` atual
- Downgrades salvam `pendingPricingTierId` para garantir que o tier correto seja aplicado no fim do período
- `executeScheduledChange()` agora aplica `pricingTierId` e `employeeCount` do tier pendente
- Validação de funcionários usa `LimitsService.checkEmployeeLimit()` existente

**Schemas/Tipos:**
- `changeSubscriptionSchema` - Schema Zod para entrada unificada
- `changeSubscriptionDataSchema` - Schema Zod para resposta
- `ChangeSubscriptionInput` e `ChangeSubscriptionData` - Tipos TypeScript

**Testes:**
- 43 testes passando no módulo plan-change
- Cobertura completa para upgrade, downgrade, validações e wrappers

---

*Última atualização: 28/12/2024*
