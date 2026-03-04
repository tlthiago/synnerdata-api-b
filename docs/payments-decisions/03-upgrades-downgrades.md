# Decisões: Upgrades & Downgrades

> Documento de decisões para mudanças de plano, ciclo e tier.

---

## 1. Método Unificado

Substituir os métodos individuais por um único método que aceita todas as mudanças.

### Métodos Atuais (a remover)

- `changePlan()` - Muda apenas o plano
- `changeBillingCycle()` - Muda apenas o ciclo

### Novo Método

```typescript
changeSubscription({
  organizationId: string;
  newPlanId?: string;        // Opcional - muda plano
  newBillingCycle?: string;  // Opcional - muda ciclo (monthly/yearly)
  newEmployeeCount?: number; // Opcional - muda tier
  successUrl: string;
})
```

---

## 2. Determinação de Upgrade vs Downgrade

Calcular com base no **resultado final** (considerando todas as mudanças):

```
Preço atual = tier atual × ciclo atual
Preço novo = tier novo × ciclo novo

Se preço novo > preço atual → Upgrade
Se preço novo < preço atual → Downgrade
Se preço novo = preço atual → Verificar se há alguma mudança, senão rejeitar
```

### Regras Adicionais

| Mudança Isolada | Tipo |
|-----------------|------|
| Mensal → Anual | Upgrade (mais compromisso) |
| Anual → Mensal | Downgrade (menos compromisso) |
| Tier maior (mais funcionários) | Upgrade |
| Tier menor (menos funcionários) | Downgrade |
| Plano mais caro | Upgrade |
| Plano mais barato | Downgrade |

---

## 3. Fluxo de Upgrade

```
Usuário solicita mudança
    ↓
Valida que não é igual à assinatura atual
    ↓
Calcula preço atual vs preço novo
    ↓
[Upgrade detectado]
    ↓
Calcula proration (valor proporcional dos dias restantes)
    ↓
Gera payment link (mínimo R$1,00)
    ↓
Usuário paga
    ↓
Webhook ativa nova configuração imediatamente
```

---

## 4. Fluxo de Downgrade

```
Usuário solicita mudança
    ↓
Valida que não é igual à assinatura atual
    ↓
Calcula preço atual vs preço novo
    ↓
[Downgrade detectado]
    ↓
Valida funcionários excedentes (ver seção 5)
    ↓
[Funcionários OK]
    ↓
Agenda mudança para fim do período atual
    ↓
Armazena: pendingPlanId, pendingBillingCycle, pendingPricingTierId
    ↓
Job executa mudança na data de renovação
```

---

## 5. Validação de Funcionários Excedentes

Antes de agendar qualquer downgrade, validar se a quantidade atual de funcionários cabe no novo tier.

### Fluxo

```
Usuário solicita downgrade
    ↓
Busca quantidade atual de funcionários cadastrados
    ↓
Busca maxEmployees do novo tier
    ↓
[Funcionários atual > maxEmployees novo]
    → Erro: "Você tem X funcionários. O plano/tier selecionado
       permite máximo Y. Remova Z funcionários para continuar."
    ↓
[Funcionários OK]
    → Continua com agendamento
```

### Erro a Criar

```typescript
class EmployeeCountExceedsNewPlanLimitError extends PaymentError {
  constructor(currentCount: number, newLimit: number) {
    super({
      code: "EMPLOYEE_COUNT_EXCEEDS_NEW_PLAN_LIMIT",
      message: `Você tem ${currentCount} funcionários cadastrados.
                O plano selecionado permite máximo ${newLimit}.
                Remova ${currentCount - newLimit} funcionários para continuar.`,
      status: 400,
    });
  }
}
```

---

## 6. Validação "Mesma Configuração"

Rejeitar solicitação se não houver nenhuma mudança efetiva.

```typescript
// Validação
if (
  newPlanId === currentPlanId &&
  newBillingCycle === currentBillingCycle &&
  newPricingTierId === currentPricingTierId
) {
  throw new NoChangeRequestedError();
}
```

### Erro a Criar

```typescript
class NoChangeRequestedError extends PaymentError {
  constructor() {
    super({
      code: "NO_CHANGE_REQUESTED",
      message: "A configuração selecionada é igual à sua assinatura atual.",
      status: 400,
    });
  }
}
```

---

## 7. Cálculo de Proration

Fórmula atual (manter):

```typescript
const priceDifference = newPrice - currentPrice;
const totalDays = (periodEnd - periodStart) / MS_PER_DAY;
const remainingDays = (periodEnd - now) / MS_PER_DAY;
const proration = Math.round(priceDifference * (remainingDays / totalDays));
```

- Valor mínimo: R$1,00 (100 centavos) - exigência do Pagar.me
- Apenas para upgrades (downgrades não cobram)

---

## 8. Cancelamento de Mudança Agendada

Usuário pode cancelar um downgrade agendado antes da execução.

### Método Existente

`cancelScheduledChange()` - Limpa campos pendentes:
- `pendingPlanId = null`
- `pendingBillingCycle = null`
- `pendingPricingTierId = null`
- `planChangeAt = null`

---

## 9. Interface do Usuário

Na mesma tela, usuário pode selecionar:
- Quantidade de funcionários (select)
- Ciclo de cobrança (toggle mensal/anual)
- Plano desejado (cards)

Sistema valida em tempo real e mostra:
- Se é upgrade ou downgrade
- Valor a pagar (se upgrade) ou data efetiva (se downgrade)

### Preview da Mudança (Obrigatório)

Antes de confirmar qualquer mudança, exibir resumo claro:

**Upgrade:**
```
┌─────────────────────────────────────────────────────────┐
│  Resumo da Mudança                                      │
│                                                         │
│  Atual:     Gold (1-50) Mensal - R$ 399/mês            │
│  Novo:      Diamond (51-100) Anual - R$ 679/mês        │
│                                                         │
│  Tipo: UPGRADE                                          │
│  Valor proporcional: R$ 280,00 (15 dias restantes)     │
│  Próxima cobrança: R$ 8.148/ano em 15/02/2025          │
│                                                         │
│  [Cancelar]                    [Confirmar Upgrade]      │
└─────────────────────────────────────────────────────────┘
```

**Downgrade:**
```
┌─────────────────────────────────────────────────────────┐
│  Resumo da Mudança                                      │
│                                                         │
│  Atual:     Diamond (51-100) Mensal - R$ 499/mês       │
│  Novo:      Gold (1-50) Mensal - R$ 399/mês            │
│                                                         │
│  Tipo: DOWNGRADE                                        │
│  Efetivo em: 15/02/2025 (fim do período atual)         │
│                                                         │
│  ⚠️ Você perderá acesso a:                             │
│  - Aniversariantes automático                           │
│  - Controle de EPIs                                     │
│  - Ficha Cadastral                                      │
│                                                         │
│  Seus dados serão mantidos, mas não poderá             │
│  visualizar esses relatórios.                          │
│                                                         │
│  [Cancelar]                   [Confirmar Downgrade]     │
└─────────────────────────────────────────────────────────┘
```

### Cancelamento de Downgrade Agendado

- Exibir na página de assinatura quando há downgrade agendado
- Botão claro para cancelar
- Confirmação antes de cancelar

```
┌─────────────────────────────────────────────────────────┐
│  ⚠️ Mudança agendada                                   │
│                                                         │
│  Seu plano mudará para Gold em 15/02/2025.             │
│                                                         │
│  [Cancelar mudança]                                     │
└─────────────────────────────────────────────────────────┘
```

### Incentivo de Upgrade Durante Uso

Quando usuário tenta acessar feature bloqueada pelo plano atual:

```
┌─────────────────────────────────────────────────────────┐
│  🔒 Relatório de EPIs                                   │
│                                                         │
│  Este relatório está disponível nos planos              │
│  Diamond e Platinum.                                    │
│                                                         │
│  Seu plano atual: Gold                                  │
│                                                         │
│  [Ver planos]              [Continuar no plano atual]   │
└─────────────────────────────────────────────────────────┘
```

### Aviso Proativo de Limite de Funcionários

Quando organização está chegando no limite de funcionários:

**Na interface (banner/alerta):**

```
📊 Uso de funcionários: 45/50 (90%)
   Considere fazer upgrade antes de atingir o limite.
   [Ver planos]
```

**Emails automáticos:**

| % do limite | Email |
|-------------|-------|
| 80% | "Você está usando 80% do limite de funcionários" |
| 95% | "Atenção: limite quase atingido (95%)" |
| 100% | "Limite atingido - faça upgrade para cadastrar mais" |

---

## 10. Lembretes Antes da Execução do Downgrade

Enviar emails de lembrete antes da execução automática do downgrade agendado.

### Sequência de Emails

| Dias antes | Email |
|------------|-------|
| 7 dias | "Lembrete: Seu plano mudará em 7 dias" |
| 3 dias | "Sua mudança de plano acontece em 3 dias" |
| 1 dia | "Amanhã seu plano será alterado" |

### Conteúdo do Email

```
Olá [Nome],

Sua mudança de plano está agendada para [DATA].

Mudança:
  De: [Plano Atual] ([Tier Atual])
  Para: [Plano Novo] ([Tier Novo])

Features que você perderá acesso:
  - [Feature 1]
  - [Feature 2]

Seus dados serão mantidos, mas não poderá visualizar esses relatórios.

[Cancelar mudança]  [Manter mudança]
```

### Implementação

```typescript
// Job diário: notifyUpcomingDowngrades()
static async notifyUpcomingDowngrades(): Promise<void> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * MS_PER_DAY);
  const in3Days = new Date(now.getTime() + 3 * MS_PER_DAY);
  const in1Day = new Date(now.getTime() + 1 * MS_PER_DAY);

  // Buscar downgrades agendados para cada período
  // Enviar email apropriado baseado na proximidade
}
```

---

## 11. Comunicação

### Emails

| Evento | Email |
|--------|-------|
| Upgrade solicitado | Link de pagamento |
| Upgrade confirmado | Confirmação da mudança |
| Downgrade agendado | Confirmação do agendamento |
| Downgrade - 7 dias | Lembrete de mudança próxima |
| Downgrade - 3 dias | Lembrete urgente |
| Downgrade - 1 dia | Último lembrete |
| Downgrade executado | Confirmação da mudança |
| Downgrade cancelado | Confirmação do cancelamento |

### Interface

- Mostrar mudança agendada na página de assinatura
- Botão claro para cancelar
- Countdown visual ("Mudança em X dias")

---

## 12. Campo `employeeCount` na Subscription

### Decisão

Manter `employeeCount` como **denormalização consciente** do `tier.maxEmployees`.

| Campo | Valor | Propósito |
|-------|-------|-----------|
| `pricingTierId` | ID do tier | Referência ao tier contratado |
| `employeeCount` | `= tier.maxEmployees` | Cache do limite (evita join) |

### Regra

`employeeCount` **sempre deve ser igual** a `pricingTier.maxEmployees`.

### Vantagens

- Consultas rápidas (não precisa join para saber o limite)
- Histórico (se o tier for alterado no futuro, subscription mantém o valor original)
- Simplicidade (`subscription.employeeCount` é o limite direto)

### Implementação no Checkout/Upgrade

```typescript
const tier = await getTier(planId, selectedRange);

await createSubscription({
  planId,
  pricingTierId: tier.id,
  employeeCount: tier.maxEmployees,  // Sempre igual ao max do tier
  billingCycle,
});
```

---

## 13. Validação de Limite de Funcionários

### Método a Implementar

```typescript
// LimitsService.checkEmployeeLimit()
static async checkEmployeeLimit(organizationId: string): Promise<{
  current: number;
  limit: number;
  canAdd: boolean;
}> {
  const subscription = await getSubscription(organizationId);
  const currentCount = await countEmployees(organizationId);

  return {
    current: currentCount,
    limit: subscription.employeeCount,  // Usa direto, sem join
    canAdd: currentCount < subscription.employeeCount,
  };
}

// LimitsService.requireEmployeeLimit()
static async requireEmployeeLimit(organizationId: string): Promise<void> {
  const { canAdd, current, limit } = await this.checkEmployeeLimit(organizationId);
  if (!canAdd) {
    throw new EmployeeLimitReachedError(current, limit);
  }
}
```

### Uso

Chamar `LimitsService.requireEmployeeLimit()` no endpoint de cadastro de funcionário.

### Erro a Criar

```typescript
class EmployeeLimitReachedError extends PaymentError {
  constructor(current: number, limit: number) {
    super({
      code: "EMPLOYEE_LIMIT_REACHED",
      message: `Limite de funcionários atingido (${current}/${limit}).
                Faça upgrade do seu plano para cadastrar mais.`,
      status: 400,
    });
  }
}
```

---

## Implementação Necessária

### MVP - Backend

- [ ] Criar método unificado `changeSubscription()`
- [ ] Remover métodos `changePlan()` e `changeBillingCycle()`
- [ ] Garantir que `employeeCount` = `tier.maxEmployees` no checkout/upgrade
- [ ] Criar `LimitsService.checkEmployeeLimit()`
- [ ] Criar `LimitsService.requireEmployeeLimit()`
- [ ] Criar `LimitsService.getEmployeeUsagePercentage()`
- [ ] Criar erro `EmployeeLimitReachedError`
- [ ] Adicionar validação de limite no endpoint de cadastro de funcionário
- [ ] Adicionar validação de funcionários excedentes no downgrade
- [ ] Adicionar validação "mesma configuração"
- [ ] Usar `pendingPricingTierId` no agendamento de downgrade
- [ ] Criar erro `EmployeeCountExceedsNewPlanLimitError`
- [ ] Criar erro `NoChangeRequestedError`
- [ ] Ajustar `executeScheduledChange()` para considerar tier
- [ ] Endpoint para retornar features perdidas no downgrade
- [ ] Job para enviar emails de aviso de limite (80%, 95%, 100%)
- [ ] Job `notifyUpcomingDowngrades()` para lembretes de downgrade (7, 3, 1 dias antes)

### MVP - Frontend

- [ ] Tela unificada de mudança (plano + ciclo + funcionários)
- [ ] Mostrar se é upgrade ou downgrade em tempo real
- [ ] Mostrar valor a pagar ou data efetiva
- [ ] Preview da mudança antes de confirmar (resumo completo)
- [ ] No downgrade: mostrar lista de features que vai perder
- [ ] Mostrar mudança agendada na página de assinatura
- [ ] Botão para cancelar mudança agendada
- [ ] Modal de incentivo ao upgrade em feature bloqueada
- [ ] Banner de aviso quando limite de funcionários > 80%

### Fase 2 - Backend

- [ ] Trial de upgrade (testar plano superior antes de pagar)

---

## Estrutura do Banco (Já Existente)

### `orgSubscriptions`

| Campo | Uso |
|-------|-----|
| `planId` | Plano atual |
| `pricingTierId` | Tier atual |
| `employeeCount` | Funcionários contratados |
| `billingCycle` | Ciclo atual |
| `pendingPlanId` | Plano agendado (downgrade) |
| `pendingPricingTierId` | Tier agendado (downgrade) - **não usado ainda** |
| `pendingBillingCycle` | Ciclo agendado (downgrade) |
| `planChangeAt` | Data da mudança agendada |
