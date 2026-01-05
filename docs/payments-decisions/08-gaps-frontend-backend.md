# Gaps Frontend-Backend: Endpoints Necessarios

> Analise dos wireframes vs endpoints existentes para identificar lacunas de implementacao.

---

## 1. Visao Geral

Analise realizada comparando os wireframes documentados em `06-paginas-frontend.md` com os endpoints existentes no modulo `@src/modules/payments/`.

### Status dos Gaps

| Prioridade | Item | Status |
|------------|------|--------|
| **P0** | pricingTier em GET /subscription | ✅ Implementado |
| **P1** | Preview de mudanca de plano | ✅ Implementado |
| **P2** | Visualizar metodo de pagamento | ⏸️ Adiado (pos-MVP) |
| **P3** | trialDays no capabilities | ⚪ Nao necessario |

---

## 2. Endpoints Existentes (Resumo)

### Subscription
- `GET /subscription` - Detalhes da assinatura (plano, status, periodo, **pricingTier**)
- `GET /subscription/capabilities` - Status, features disponiveis
- `POST /subscription/cancel` - Agendar cancelamento
- `POST /subscription/restore` - Restaurar cancelamento

### Plan Change
- `POST /subscription/change` - Executa mudanca (upgrade cria checkout, downgrade agenda)
- `POST /subscription/preview-change` - Preview de mudanca (sem executar)
- `GET /subscription/scheduled-change` - Consulta mudanca agendada
- `DELETE /subscription/scheduled-change` - Cancela mudanca agendada

### Billing
- `GET /billing/profile` - Dados de cobranca
- `POST /billing/profile` - Criar perfil
- `PATCH /billing/profile` - Atualizar perfil
- `GET /billing/invoices` - Lista faturas
- `GET /billing/invoices/:id/download` - Download fatura
- `POST /billing/update-card` - Atualizar cartao
- `GET /billing/usage` - Uso de funcionarios

### Plans
- `GET /plans` - Lista planos publicos com tiers

### Checkout
- `POST /checkout` - Criar checkout para contratacao

---

## 3. Gap P0: pricingTier em GET /subscription ✅

### Problema Identificado
O wireframe mostra:
```
Proxima cobranca: R$ 499,00 em 15/02/2025
```

O endpoint `GET /subscription` nao retornava informacoes do pricing tier (preco, faixa de funcionarios).

### Solucao Implementada
Adicionado campo `pricingTier` ao response de `GET /subscription`:

```typescript
pricingTier: {
  id: string;
  minEmployees: number;
  maxEmployees: number;
  priceMonthly: number;  // centavos
  priceYearly: number;   // centavos
} | null
```

### Arquivos Modificados
- `src/modules/payments/subscription/subscription.helpers.ts`
- `src/modules/payments/subscription/subscription.model.ts`
- `src/modules/payments/subscription/subscription-query.service.ts`
- `src/modules/payments/subscription/__tests__/get-subscription.test.ts`

---

## 4. Gap P1: Preview de Mudanca de Plano ✅

### Problema Identificado
O wireframe mostra modal de preview ANTES de confirmar:

```
┌─────────────────────────────────────────────────────────────────┐
│  Confirmar Upgrade                                        [X]  │
├─────────────────────────────────────────────────────────────────┤
│  Resumo da Mudanca                                              │
│  Atual:  Ouro Insights (31-40) Mensal      R$ 299/mes          │
│  Novo:   Diamante Analytics (31-40) Mensal R$ 499/mes          │
│                                                                 │
│  Valor proporcional: R$ 200,00 (15 dias restantes)             │
│                                                                 │
│  Voce ganhara acesso a:                                         │
│  ✓ Relatorio de EPIs                                           │
│  ✓ Ficha Cadastral                                             │
│  ✓ Aniversariantes                                             │
│                                                                 │
│  [Cancelar]                            [Confirmar e pagar]      │
└─────────────────────────────────────────────────────────────────┘
```

O endpoint `POST /subscription/change` **executa** a acao diretamente (cria checkout ou agenda). Nao ha como fazer preview sem executar.

### Solucao Implementada
Criado endpoint `POST /subscription/preview-change`:

**Permissao**: `subscription:read`

```typescript
// Request
{
  newPlanId?: string;
  newBillingCycle?: "monthly" | "yearly";
  newTierId?: string;
}

// Response
{
  changeType: "upgrade" | "downgrade";
  immediate: boolean;              // true para upgrades, false para downgrades

  currentPlan: { id, displayName, billingCycle };
  currentTier: { id, minEmployees, maxEmployees, priceMonthly, priceYearly };

  newPlan: { id, displayName, billingCycle };
  newTier: { id, minEmployees, maxEmployees, priceMonthly, priceYearly };

  prorationAmount?: number;        // centavos (upgrades only)
  daysRemaining?: number;          // dias restantes no periodo (upgrades only)
  scheduledAt?: string;            // ISO date (downgrades only)

  featuresGained: string[];        // display names em portugues
  featuresLost: string[];          // display names em portugues
}
```

### Arquivos Modificados
- `src/modules/payments/plans/plans.constants.ts` - Funcao `compareFeatures()`
- `src/modules/payments/plan-change/plan-change.model.ts` - Schemas
- `src/modules/payments/plan-change/plan-change.service.ts` - Metodo `previewChange()`
- `src/modules/payments/plan-change/index.ts` - Endpoint POST
- `src/modules/payments/plan-change/__tests__/preview-change.test.ts` - 15 testes

### Logica de Implementacao
1. Reutiliza validacoes do `changeSubscription()` (mesmo fluxo)
2. Valida funcionarios no downgrade
3. Calcula proration via `ProrationService.calculateProration()`
4. Compara features via `compareFeatures()` com display names
5. Retorna preview **sem executar nenhuma acao** (sem DB writes, sem Pagarme calls)

---

## 5. Gap P2: Visualizar Metodo de Pagamento ⏸️

### Problema Identificado
O wireframe mostra dados do cartao atual (brand, ultimos 4 digitos, validade).

Nao existe endpoint para **visualizar** o cartao atual. So existe `POST /billing/update-card` para atualizar.

### Decisao: Adiado para pos-MVP

**Justificativa**:
- Nao e essencial para o MVP
- Requer armazenar dados de cartao no banco ou consultar Pagarme em tempo real
- Complexidade adicional sem beneficio critico para o lancamento
- Usuario pode atualizar cartao sem precisar ver o atual

**Quando implementar**: Conforme demanda dos usuarios apos lancamento do MVP.

**Wireframe removido**: A secao "Metodo de Pagamento" sera omitida da interface inicial. Usuario tera apenas botao "Atualizar cartao" que redireciona para checkout do Pagarme.

---

## 6. Gap P3: trialDays no Capabilities ⚪

### Problema Identificado
O wireframe mostra barra de progresso do trial:

```
████████████████████░░░░░░░░░░
11 de 14 dias utilizados
```

O endpoint `GET /subscription/capabilities` retorna `daysRemaining` mas nao `trialDays` (total).

### Decisao: Nao necessario

**Justificativa**: O periodo de trial sera **sempre 14 dias** (constante de negocio). O frontend pode calcular diretamente:

```typescript
const TRIAL_DAYS = 14;
const daysUsed = TRIAL_DAYS - daysRemaining;
// Exibir: "11 de 14 dias utilizados"
```

Nao ha necessidade de adicionar complexidade no backend para retornar um valor constante.

---

## 7. Wireframes Complementares Sugeridos

### 7.1 Estado de Erro de Pagamento (past_due)

Quando `status: "past_due"`, mostrar alerta proeminente:

```
┌─────────────────────────────────────────────────────────────────┐
│  🔴 Pagamento pendente                                          │
│                                                                 │
│  Nao conseguimos processar sua cobranca.                        │
│  Atualize seu cartao ate 20/02 para evitar suspensao.          │
│                                                                 │
│  Dias restantes: 10 de 15                                       │
│  ████████████████████░░░░░░░░░░                                 │
│                                                                 │
│                                              [Atualizar cartao] │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Tela Pos-Checkout

Quando usuario volta do Pagarme apos pagamento:

**Sucesso:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ✅ Pagamento confirmado!                                       │
│                                                                 │
│  Seu plano Diamante Analytics esta ativo.                       │
│  Voce ja pode usar todas as funcionalidades.                    │
│                                                                 │
│                                       [Ir para o dashboard]     │
└─────────────────────────────────────────────────────────────────┘
```

**Pendente (boleto/pix):**
```
┌─────────────────────────────────────────────────────────────────┐
│  ⏳ Aguardando pagamento                                        │
│                                                                 │
│  Seu pedido foi registrado. Assim que o pagamento for           │
│  confirmado, seu plano sera ativado automaticamente.            │
│                                                                 │
│  Voce recebera um email de confirmacao.                         │
│                                                                 │
│                                       [Ir para o dashboard]     │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Loading States

Sugestao de skeleton enquanto carrega dados da assinatura.

---

## 8. Status Final

### Implementados
1. ✅ **P0** - pricingTier em GET /subscription
2. ✅ **P1** - Preview de mudanca de plano

### Descartados/Adiados
3. ⏸️ **P2** - Visualizar metodo de pagamento (adiado para pos-MVP)
4. ⚪ **P3** - trialDays no capabilities (nao necessario - valor constante)

---

## 9. Referencias

| Documento | Conteudo |
|-----------|----------|
| `03-upgrades-downgrades.md` | Logica de mudanca de plano |
| `06-paginas-frontend.md` | Wireframes das paginas |
| `payments-module-hierarchy.md` | Arquitetura do modulo |

---

*Ultima atualizacao: 05/01/2026*
