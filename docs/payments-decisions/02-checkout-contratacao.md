# Decisões: Checkout & Contratação

> Documento de decisões para o fluxo de checkout e contratação de planos.

---

## 1. Método de Pagamento

| Item | Decisão |
|------|---------|
| MVP | Apenas cartão de crédito |
| Boleto/Pix | Fase futura (se cliente solicitar e pagar) |

---

## 2. Ciclo de Cobrança

| Item | Decisão |
|------|---------|
| Opções | Mensal e Anual |
| Desconto anual | 20% hardcoded (`YEARLY_DISCOUNT = 0.2`) |

---

## 3. Expiração do Payment Link

| Item | Decisão |
|------|---------|
| Tempo | 24 horas |
| Pagar.me | Passar `expires_at` na criação do link |
| Local | Manter controle em `pendingCheckouts.expiresAt` |

---

## 4. Separação de Profiles

| Tabela | Propósito |
|--------|-----------|
| `organizationProfiles` | Dados da empresa que USA o sistema |
| `billingProfiles` (NOVO) | Dados de quem PAGA |

### Estrutura do `billingProfiles`

```typescript
{
  id: string;
  organizationId: string;
  legalName: string;           // Nome/Razão social do pagador
  taxId: string;               // CNPJ/CPF do pagador
  email: string;               // Email de cobrança
  phone: string;
  address?: {                  // Opcional para MVP
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  pagarmeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 5. Fluxo de Checkout

```
Usuário clica "Contratar" no plano
    ↓
Modal "Dados de Cobrança" (sempre exibe)
    - CNPJ/CPF do pagador
    - Telefone
    - Email de cobrança
    - Checkbox: "Esses dados são os mesmos da organização?"
    ↓
[✓ Marcado] → Salva em billingProfiles + copia para organizationProfiles
[☐ Desmarcado] → Salva apenas em billingProfiles
    ↓
Cria/atualiza Customer no Pagar.me
    ↓
Tela de Resumo da Assinatura (antes do redirect)
    - Plano selecionado
    - Range de funcionários
    - Ciclo (mensal/anual)
    - Valor a ser cobrado
    - Botões: [Alterar] [Ir para pagamento]
    ↓
Cria payment link COM:
    - customer_id (pré-preenche dados)
    - expires_at (24h)
    ↓
Redireciona para checkout (dados já preenchidos)
    ↓
Usuário paga
    ↓
Webhook subscription.created
    ↓
Ativa assinatura + email confirmação + banner some
```

### Tela de Resumo da Assinatura

Exibir antes de redirecionar para o Pagar.me:

| Campo | Exemplo |
|-------|---------|
| Plano | Diamond Analytics |
| Funcionários | 1-50 |
| Ciclo | Mensal |
| Valor | R$ 499,00/mês |

Botões:
- **Alterar**: Volta para seleção de plano
- **Ir para pagamento**: Cria payment link e redireciona

---

## 6. Pré-requisitos para Checkout

| Item | Obrigatório |
|------|-------------|
| Email verificado | Sim (já garantido pelo OTP) |
| Dados de cobrança | Sim (modal sempre exibe) |
| Dados da organização | Não |

---

## 7. Pós-Pagamento

| Item | Comportamento |
|------|---------------|
| Redirecionamento | `successUrl` do Pagar.me → plataforma |
| Email | Confirmação de contratação do plano |
| Interface | Banner de trial some da sidebar |

---

## 8. Interface de Escolha de Plano

| Item | Implementação |
|------|---------------|
| Layout | 3 planos lado a lado |
| Seletor de funcionários | Select com ranges |
| Toggle de ciclo | Mensal / Anual (-20%) |
| Destaque | Badge "Mais Popular" no Diamond |
| CTA | Botão "Contratar" em cada plano |

---

## Implementação Necessária

### MVP - Backend

- [ ] Criar tabela `billingProfiles`
- [ ] Criar `BillingProfileService` (CRUD)
- [ ] Ajustar `CheckoutService` para:
  - Salvar dados em `billingProfiles`
  - Criar Customer no Pagar.me com dados de cobrança
  - Passar `expires_at` no payment link
  - Passar `customer_id` no payment link
- [ ] Ajustar `CustomerService` para usar `billingProfiles`

### MVP - Frontend

- [ ] Modal "Dados de Cobrança" sempre exibir campos
- [ ] Remover lógica de verificar `organizationProfiles` para checkout

### Fase 2 - Backend

- [ ] Adicionar boleto como método de pagamento (se cliente solicitar)
- [ ] Adicionar Pix como método de pagamento (se cliente solicitar)
- [ ] Mover `YEARLY_DISCOUNT` para env var

### Fase 2 - Frontend

- [ ] Seletor de método de pagamento no checkout
- [ ] Tela de resumo da assinatura antes do redirect

---

## Anexo: Campanhas Promocionais e Descontos (Opcional)

> Esta seção documenta estratégias para campanhas promocionais (Black Friday, etc.).
> Não faz parte do MVP e não tem obrigatoriedade de implementação.

### Limitações da Estrutura Atual

- Preços estão fixos em `planPricingTiers` (priceMonthly, priceYearly)
- Planos são sincronizados com Pagar.me com preço fixo
- Não existe conceito de "preço promocional temporário"
- Mudar preço no banco afeta todos (novos e renovações de existentes)

### Abordagem Recomendada: Desconto via API do Pagar.me

O Pagar.me suporta aplicar `discount` diretamente na subscription, sem alterar o preço do plano.

**Objeto Discount do Pagar.me:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `value` | number | Valor do desconto |
| `discount_type` | string | `flat` (fixo) ou `percentage` |
| `cycles` | number | Ciclos que o desconto será aplicado |
| `item_id` | string | Opcional - item específico |

**Fluxo sugerido:**

```
Admin ativa campanha (flag no sistema ou tabela campaigns)
    ↓
Checkout detecta campanha ativa
    ↓
Exibe preço com desconto na tela de resumo
    ↓
Cria subscription com preço normal
    ↓
Aplica discount via API (ex: 30% por 12 ciclos)
    ↓
Após X ciclos, desconto expira automaticamente
```

**Vantagens desta abordagem:**

- Não afeta clientes existentes
- Não precisa duplicar planos/tiers
- Preço normal volta automaticamente após os ciclos
- Simples de implementar

### Referências

- [Desconto - Pagar.me Docs](https://docs.pagar.me/reference/desconto-1)
- [Incluir desconto - Pagar.me Docs](https://docs.pagar.me/reference/incluir-desconto-1)
