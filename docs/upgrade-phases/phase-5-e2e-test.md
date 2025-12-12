# Fase 5: E2E Test

## Objetivo

Criar um teste end-to-end que valida o fluxo completo de upgrade, mockando apenas as chamadas externas ao Pagar.me.

## Pré-requisitos

- **Fases 1-4 completas:** Todo o código de upgrade implementado

## Arquivos Implementados

1. `src/modules/payments/__tests__/upgrade-use-case.test.ts` ✅

---

## 5.1 Estrutura do Teste

O teste cobre o fluxo completo:

1. Criação de usuário e organização com trial
2. Chamada ao endpoint de checkout (cria Payment Link real no Pagarme sandbox)
3. Verificação do sync do plano com Pagarme
4. Simulação do webhook `subscription.created`
5. Verificação da ativação da subscription
6. Verificação do sync de dados do customer
7. Verificação de que checkout duplicado é rejeitado

---

## 5.2 Arquivo de teste implementado

**Arquivo:** `src/modules/payments/__tests__/upgrade-use-case.test.ts`

O teste foi implementado com chamadas reais à API Pagarme (sandbox) em vez de mocks, proporcionando maior confiança na integração.

### Estrutura do teste

```typescript
describe("Upgrade Use Case: Trial → Paid Subscription", () => {
  describe("Fase 1: Setup - Usuário com Trial", () => {
    test("should create authenticated user with organization");
    test("should create trial subscription for organization");
    test("should have organization profile without pagarmeCustomerId");
  });

  describe("Fase 2: Checkout - Criação do Payment Link", () => {
    test("should create payment link for upgrade");
    test("should sync plan to Pagarme");
    test("should create pending checkout record");
    test("should still have trial subscription (not activated yet)");
  });

  describe("Fase 3: Webhook - Ativação via subscription.created", () => {
    test("should receive subscription.created webhook");
    test("should activate subscription");
    test("should store pagarmeCustomerId in subscription");
    test("should set current period dates");
    test("should mark pending checkout as completed");
  });

  describe("Fase 4: Sync de Dados do Customer", () => {
    test("should sync pagarmeCustomerId to organization profile");
    test("should not overwrite existing profile data");
  });

  describe("Fase 5: Validação Final", () => {
    test("should have complete active subscription");
    test("should reject new checkout for already active subscription");
    test("should have synced customer data in profile");
  });
});
```

### Helpers utilizados

O teste utiliza helpers de `src/test/helpers/`:
- `createTestApp()` - Cria instância da aplicação
- `createTestUser()` - Cria usuário autenticado com organização
- `createTestSubscription()` - Cria subscription de teste
- `seedPlans()` - Popula planos (starter, pro)
- `createWebhookRequest()` - Gera request de webhook com assinatura válida
- `webhookPayloads` - Payloads de webhook pré-configurados

---

## 5.3 Executar os testes

```bash
# Rodar apenas o teste de upgrade flow
bun test src/modules/payments/__tests__/upgrade-use-case.test.ts

# Rodar com verbose
bun test src/modules/payments/__tests__/upgrade-use-case.test.ts --verbose

# Rodar todos os testes de payments
bun test src/modules/payments/
```

---

## 5.4 Troubleshooting

### Erro: "Table not found"

Verifique se as migrations estão atualizadas:

```bash
bun run db:migrate
```

### Erro: "Signature validation failed"

O teste precisa mockar a validação de assinatura do webhook. Ajuste o mock do `WebhookService.process()` se necessário.

### Erro: "Plan not found"

Certifique-se de que existe um plano no banco de dados antes de rodar o teste.

---

## Validação da Fase 5

### Teste 1: Todos os testes passam

```bash
bun test src/modules/payments/__tests__/upgrade-use-case.test.ts
```

**Resultado esperado:** Todos os 17 testes passam (✓)

### Teste 2: Testes existentes não quebram

```bash
bun test src/modules/payments/
```

**Resultado esperado:** Nenhum teste existente quebrou

---

## Checklist

- [x] Arquivo de teste criado (`upgrade-use-case.test.ts`)
- [x] Chamadas reais à API Pagarme (sandbox)
- [x] Testes de checkout creation passam
- [x] Testes de plan sync passam
- [x] Testes de webhook processing passam
- [x] Testes de access check passam
- [x] Cleanup automático via test helpers
- [x] Testes existentes continuam passando

> **Status: ✅ COMPLETA**
>
> **Teste integrado implementado:**
> - `src/modules/payments/__tests__/upgrade-use-case.test.ts` (341 linhas)
>
> **Cobertura do teste:**
> - Fase 1: Setup - Usuário com Trial (3 testes)
> - Fase 2: Checkout - Criação do Payment Link (4 testes)
> - Fase 3: Webhook - Ativação via subscription.created (5 testes)
> - Fase 4: Sync de Dados do Customer (2 testes)
> - Fase 5: Validação Final (3 testes)
>
> **Testes individuais também implementados:**
> - `src/modules/payments/checkout/__tests__/create-checkout.test.ts`
> - `src/modules/payments/webhook/__tests__/subscription-created.test.ts`
> - `src/modules/payments/plan/__tests__/sync-plan.test.ts`
> - `src/modules/payments/plan/__tests__/create-plan.test.ts`
> - `src/modules/payments/plan/__tests__/update-plan.test.ts`
> - `src/modules/payments/plan/__tests__/delete-plan.test.ts`
> - `src/modules/payments/plan/__tests__/list-plans.test.ts`
> - `src/modules/payments/plan/__tests__/get-plan.test.ts`
> - `src/modules/payments/customer/__tests__/get-customers.test.ts`

---

## Próxima Fase

Após validar, prosseguir para **[Fase 6: Polish](./phase-6-polish.md)**
