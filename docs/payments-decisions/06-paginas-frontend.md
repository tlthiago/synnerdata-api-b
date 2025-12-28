# Decisões: Páginas Frontend

> Estrutura de páginas para gerenciamento de assinatura pelo usuário.

---

## 1. Visão Geral

### Referências de Mercado

| SaaS | Estrutura |
|------|-----------|
| Notion | Settings > Plans - Uma página com seções |
| Slack | Settings > Billing - Tabs (Overview, Invoices, Payment) |
| Figma | Settings > Billing - Uma página com cards |
| Linear | Settings > Billing - Uma página limpa |
| Vercel | Settings > Billing - Tabs |

### Decisão

Estrutura simples com **2 páginas principais**:

| Página | Rota | Propósito |
|--------|------|-----------|
| Assinatura | `/settings/subscription` | Dashboard principal, visão geral |
| Planos | `/settings/plans` | Seleção e comparação de planos |
| Faturas | `/settings/invoices` | Histórico completo (opcional, pode ser seção) |

---

## 2. Página: Assinatura (`/settings/subscription`)

Dashboard principal de gerenciamento da assinatura.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Assinatura                                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [ALERTAS - Condicional]                                        │
│                                                                 │
│  [PLANO ATUAL]                                                  │
│                                                                 │
│  [MÉTODO DE PAGAMENTO]                                          │
│                                                                 │
│  [DADOS DE COBRANÇA]                                            │
│                                                                 │
│  [FATURAS RECENTES]                                             │
│                                                                 │
│  [CANCELAR ASSINATURA]                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: Alertas (Condicional)

Exibir no topo quando houver ação pendente:

**Trial expirando:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ⏰ Seu trial expira em 3 dias                                  │
│  Contrate um plano para continuar usando o Synnerdata.          │
│                                                    [Ver planos] │
└─────────────────────────────────────────────────────────────────┘
```

**Trial expirado:**
```
┌─────────────────────────────────────────────────────────────────┐
│  🔴 Seu trial expirou                                           │
│  Contrate um plano para recuperar o acesso.                     │
│                                                    [Ver planos] │
└─────────────────────────────────────────────────────────────────┘
```

**Pagamento pendente:**
```
┌─────────────────────────────────────────────────────────────────┐
│  🔴 Pagamento pendente                                          │
│  Não conseguimos processar sua cobrança. Atualize seu cartão   │
│  até 20/02 para evitar suspensão.                               │
│                                              [Atualizar cartão] │
└─────────────────────────────────────────────────────────────────┘
```

**Downgrade agendado:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ Mudança de plano agendada                                   │
│  Seu plano mudará para Ouro Insights em 15/02/2025.            │
│                                              [Cancelar mudança] │
└─────────────────────────────────────────────────────────────────┘
```

**Cancelamento agendado:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ Cancelamento agendado                                       │
│  Sua assinatura será cancelada em 15/02/2025.                  │
│  Você perderá acesso a todos os relatórios.                    │
│                                            [Manter assinatura] │
└─────────────────────────────────────────────────────────────────┘
```

**Limite de funcionários:**
```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Você está usando 90% do limite de funcionários (45/50)     │
│  Considere fazer upgrade antes de atingir o limite.            │
│                                                    [Ver planos] │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: Plano Atual

**Estado: Trial**
```
┌─────────────────────────────────────────────────────────────────┐
│  Plano Atual                                                    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  🎁 Trial Gratuito                                        │ │
│  │                                                            │ │
│  │  Status: Ativo                                            │ │
│  │  Expira em: 15/02/2025 (3 dias)                          │ │
│  │                                                            │ │
│  │  Durante o trial você tem acesso a todas as               │ │
│  │  funcionalidades do plano Platina Vision.                 │ │
│  │                                                            │ │
│  │  [Escolher um plano →]                                    │ │
│  │                                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Estado: Ativo**
```
┌─────────────────────────────────────────────────────────────────┐
│  Plano Atual                                                    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  💎 Diamante Analytics                                    │ │
│  │                                                            │ │
│  │  Status: Ativo                                            │ │
│  │  Funcionários: 45/50                                      │ │
│  │  ████████████████████░░░░░ 90%                            │ │
│  │                                                            │ │
│  │  Ciclo: Mensal                                            │ │
│  │  Próxima cobrança: R$ 499,00 em 15/02/2025               │ │
│  │                                                            │ │
│  │  [Gerenciar plano →]                                      │ │
│  │                                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: Método de Pagamento

**Com cartão cadastrado:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Método de Pagamento                                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  💳 Visa terminado em 4242                                │ │
│  │  Expira em 12/2026                                        │ │
│  │                                                            │ │
│  │  [Atualizar cartão]                                       │ │
│  │                                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Sem cartão (trial):**
```
┌─────────────────────────────────────────────────────────────────┐
│  Método de Pagamento                                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  Nenhum método de pagamento cadastrado.                   │ │
│  │  Será solicitado ao contratar um plano.                   │ │
│  │                                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: Dados de Cobrança

```
┌─────────────────────────────────────────────────────────────────┐
│  Dados de Cobrança                                              │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  Razão Social: Empresa XYZ Ltda                           │ │
│  │  CNPJ: 12.345.678/0001-90                                 │ │
│  │  Email de cobrança: financeiro@empresa.com                │ │
│  │  Telefone: (11) 99999-9999                                │ │
│  │                                                            │ │
│  │  [Editar dados]                                           │ │
│  │                                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: Faturas Recentes

```
┌─────────────────────────────────────────────────────────────────┐
│  Faturas                                                        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  15/01/2025   Diamante Analytics   R$ 499,00   Pago  [⬇]  │ │
│  │  15/12/2024   Diamante Analytics   R$ 499,00   Pago  [⬇]  │ │
│  │  15/11/2024   Diamante Analytics   R$ 499,00   Pago  [⬇]  │ │
│  │                                                            │ │
│  │  [Ver todas as faturas →]                                 │ │
│  │                                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: Cancelar Assinatura

```
─────────────────────────────────────────────────────────────────

Precisa cancelar? [Cancelar assinatura]
```

---

## 3. Página: Planos (`/settings/plans`)

Página para seleção e comparação de planos.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Voltar para Assinatura                                       │
│                                                                 │
│  Escolha o plano ideal para sua empresa                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Quantos funcionários sua empresa tem?                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ▼ 31-40 funcionários                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Ciclo de cobrança:                                             │
│  ┌──────────────┐  ┌──────────────────────┐                    │
│  │   Mensal     │  │  Anual (20% off)     │                    │
│  └──────────────┘  └──────────────────────┘                    │
│                                                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │                 │ │    ⭐ POPULAR   │ │                 │   │
│  │  OURO INSIGHTS  │ │    DIAMANTE     │ │ PLATINA VISION  │   │
│  │                 │ │    ANALYTICS    │ │                 │   │
│  │                 │ │                 │ │                 │   │
│  │   R$ 299/mês    │ │   R$ 499/mês    │ │   R$ 699/mês    │   │
│  │                 │ │                 │ │                 │   │
│  │  ✓ Ausências    │ │  ✓ Tudo do Ouro │ │  ✓ Tudo Diamante│   │
│  │  ✓ Acidentes    │ │  ✓ EPIs         │ │  ✓ API          │   │
│  │  ✓ Advertências │ │  ✓ Ficha        │ │  ✓ Suporte      │   │
│  │  ✓ Atestados    │ │  ✓ Aniversários │ │    Prioritário  │   │
│  │                 │ │                 │ │                 │   │
│  │  [Seu plano]    │ │  [Selecionar]   │ │  [Selecionar]   │   │
│  │                 │ │                 │ │                 │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│                                                                 │
│  [Comparar todos os recursos em detalhe →]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Estados dos Botões

| Estado | Botão |
|--------|-------|
| Plano atual (mesmo tier/ciclo) | "Seu plano atual" (desabilitado) |
| Upgrade disponível | "Selecionar" ou "Fazer upgrade" |
| Downgrade disponível | "Selecionar" |
| Trial | "Contratar" |

### Indicadores Visuais

- **Plano atual:** Borda destacada ou badge "Atual"
- **Plano popular:** Badge "Popular" ou "Recomendado"
- **Economia anual:** Mostrar valor economizado

---

## 4. Página: Faturas (`/settings/invoices`) - Opcional

Histórico completo de faturas com paginação.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Voltar para Assinatura                                       │
│                                                                 │
│  Histórico de Faturas                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Data        │ Descrição           │ Valor   │ Status │    │ │
│  │─────────────│─────────────────────│─────────│────────│────│ │
│  │ 15/01/2025  │ Diamante Analytics  │ R$ 499  │ Pago   │ ⬇  │ │
│  │ 15/12/2024  │ Diamante Analytics  │ R$ 499  │ Pago   │ ⬇  │ │
│  │ 15/11/2024  │ Diamante Analytics  │ R$ 499  │ Pago   │ ⬇  │ │
│  │ 15/10/2024  │ Diamante Analytics  │ R$ 499  │ Pago   │ ⬇  │ │
│  │ 15/09/2024  │ Diamante Analytics  │ R$ 499  │ Pago   │ ⬇  │ │
│  │ 15/08/2024  │ Ouro Insights       │ R$ 299  │ Pago   │ ⬇  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [← Anterior]  Página 1 de 3  [Próxima →]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Modais e Sheets

### Modal: Atualizar Cartão

```
┌─────────────────────────────────────────────────────────────────┐
│  Atualizar Cartão                                         [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Número do cartão                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  0000 0000 0000 0000                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Validade              CVV                                      │
│  ┌───────────────┐     ┌───────────────┐                       │
│  │  MM/AA        │     │  000          │                       │
│  └───────────────┘     └───────────────┘                       │
│                                                                 │
│  Nome no cartão                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Cancelar]                              [Salvar cartão]        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Modal: Editar Dados de Cobrança

```
┌─────────────────────────────────────────────────────────────────┐
│  Dados de Cobrança                                        [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Razão Social / Nome                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Empresa XYZ Ltda                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  CNPJ / CPF                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  12.345.678/0001-90                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Email de cobrança                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  financeiro@empresa.com                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Telefone                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  (11) 99999-9999                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Cancelar]                                     [Salvar dados]  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Modal: Preview de Upgrade

```
┌─────────────────────────────────────────────────────────────────┐
│  Confirmar Upgrade                                        [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Resumo da Mudança                                              │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Atual:  Ouro Insights (31-40) Mensal      R$ 299/mês    │ │
│  │  Novo:   Diamante Analytics (31-40) Mensal R$ 499/mês    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Valor proporcional: R$ 200,00 (15 dias restantes)             │
│  Próxima cobrança: R$ 499,00 em 15/02/2025                     │
│                                                                 │
│  Você ganhará acesso a:                                         │
│  ✓ Relatório de EPIs                                           │
│  ✓ Ficha Cadastral                                             │
│  ✓ Aniversariantes                                             │
│                                                                 │
│  [Cancelar]                            [Confirmar e pagar]      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Modal: Preview de Downgrade

```
┌─────────────────────────────────────────────────────────────────┐
│  Confirmar Downgrade                                      [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Resumo da Mudança                                              │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Atual:  Diamante Analytics (31-40) Mensal R$ 499/mês    │ │
│  │  Novo:   Ouro Insights (31-40) Mensal      R$ 299/mês    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Efetivo em: 15/02/2025 (fim do período atual)                 │
│                                                                 │
│  ⚠️ Você perderá acesso a:                                     │
│  ✗ Relatório de EPIs                                           │
│  ✗ Ficha Cadastral                                             │
│  ✗ Aniversariantes                                             │
│                                                                 │
│  Seus dados serão mantidos, mas não poderá visualizar          │
│  esses relatórios até fazer upgrade novamente.                 │
│                                                                 │
│  [Cancelar]                           [Confirmar downgrade]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Modal: Confirmar Cancelamento (Fluxo)

**Passo 1: Oferta de Downgrade**
```
┌─────────────────────────────────────────────────────────────────┐
│  Antes de ir...                                           [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Que tal um plano mais acessível?                              │
│                                                                 │
│  Seu plano atual: Diamante Analytics - R$ 499/mês              │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  💰 Ouro Insights - R$ 299/mês                           │ │
│  │                                                            │ │
│  │  ✓ Relatórios de ausências                               │ │
│  │  ✓ Relatórios de acidentes                               │ │
│  │  ✓ Relatórios de advertências                            │ │
│  │                                                            │ │
│  │  [Mudar para Ouro Insights]                               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [Não, quero cancelar mesmo assim]                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Passo 2: Coleta de Motivo**
```
┌─────────────────────────────────────────────────────────────────┐
│  Por que você está cancelando?                            [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Selecione o motivo principal:                                  │
│                                                                 │
│  ○ Muito caro para minha empresa                               │
│  ○ Não estou usando o suficiente                               │
│  ○ Faltam funcionalidades que preciso                          │
│  ○ Vou usar outro sistema                                      │
│  ○ Empresa encerrando atividades                               │
│  ○ Pausa temporária                                            │
│  ○ Experiência ruim com o sistema                              │
│  ○ Outro motivo                                                │
│                                                                 │
│  Comentário (opcional):                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Voltar]                          [Continuar cancelamento]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Passo 3: Confirmação Final**
```
┌─────────────────────────────────────────────────────────────────┐
│  Confirmar Cancelamento                                   [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Tem certeza que deseja cancelar?                              │
│                                                                 │
│  Seu acesso continua até: 15/02/2025                           │
│                                                                 │
│  Após essa data:                                                │
│  • Você não poderá acessar seus relatórios                     │
│  • Seus dados serão mantidos por 90 dias                       │
│  • Você pode voltar a qualquer momento                         │
│                                                                 │
│  [Voltar]                        [Confirmar cancelamento]       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Estado: Trial

A página de assinatura no estado trial tem foco diferente: mostrar valor e incentivar conversão.

### Layout Trial

```
┌─────────────────────────────────────────────────────────────────┐
│  Assinatura                                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [ALERTA - se < 7 dias]                                         │
│                                                                 │
│  [SEU TRIAL - countdown e barra de progresso]                   │
│                                                                 │
│  [O QUE VOCÊ ESTÁ APROVEITANDO - lista de features]             │
│                                                                 │
│  [DADOS DE COBRANÇA - incentiva preencher]                      │
│                                                                 │
│  [COMPARE OS PLANOS - preview dos 3 planos]                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: Seu Trial

```
┌─────────────────────────────────────────────────────────────────┐
│  🎁 Trial Gratuito                                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ████████████████████░░░░░░░░░░                         │   │
│  │  11 de 14 dias utilizados                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Expira em: 18/02/2025                                          │
│                                                                 │
│  Durante o trial você tem acesso completo a todas               │
│  as funcionalidades do Synnerdata.                              │
│                                                                 │
│  [Escolher um plano →]                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: O Que Você Está Aproveitando

```
┌─────────────────────────────────────────────────────────────────┐
│  O que você está aproveitando                                   │
│                                                                 │
│  ✓ Relatório de Ausências                                       │
│  ✓ Relatório de Acidentes                                       │
│  ✓ Relatório de Advertências                                    │
│  ✓ Relatório de Atestados                                       │
│  ✓ Controle de EPIs                                             │
│  ✓ Ficha Cadastral                                              │
│  ✓ Aniversariantes                                              │
│  ✓ Funcionários ilimitados                                      │
│                                                                 │
│  Ao contratar, você escolhe o plano que melhor                  │
│  se adapta às necessidades da sua empresa.                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: Dados de Cobrança (Trial)

**Se já preencheu:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Dados de Cobrança                                              │
│                                                                 │
│  Configure seus dados para agilizar a contratação.              │
│                                                                 │
│  Razão Social: Empresa XYZ Ltda                                 │
│  CNPJ: 12.345.678/0001-90                                       │
│  Email: financeiro@empresa.com                                  │
│                                                                 │
│  [Editar dados]                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Se não preencheu:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Dados de Cobrança                                              │
│                                                                 │
│  Configure seus dados de cobrança para agilizar                 │
│  a contratação quando decidir.                                  │
│                                                                 │
│  [Configurar agora]                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Seção: Compare os Planos

```
┌─────────────────────────────────────────────────────────────────┐
│  Compare os planos                                              │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │  OURO   │  │ DIAMANTE│  │ PLATINA │                         │
│  │ R$ 299  │  │ R$ 499  │  │ R$ 699  │                         │
│  │         │  │⭐Popular│  │         │                         │
│  └─────────┘  └─────────┘  └─────────┘                         │
│                                                                 │
│  A partir de R$ 299/mês para até 10 funcionários                │
│                                                                 │
│  [Ver todos os planos →]                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Variações por Urgência

| Dias restantes | Visual | Tom |
|----------------|--------|-----|
| 8-14 dias | Sem alerta | Exploratório, positivo |
| 4-7 dias | Alerta amarelo | "Seu trial expira em X dias" |
| 1-3 dias | Alerta vermelho | "Seu trial expira em X dias!" |
| 0 (expirado) | Página especial | Foco total em conversão |

### Alerta: Trial Urgente (4-7 dias)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⏰ Seu trial expira em 5 dias                                  │
│  Contrate um plano para continuar usando o Synnerdata.          │
│                                                    [Ver planos] │
└─────────────────────────────────────────────────────────────────┘
```

### Alerta: Trial Crítico (1-3 dias)

```
┌─────────────────────────────────────────────────────────────────┐
│  🔴 Seu trial expira em 2 dias!                                 │
│  Não perca acesso aos seus relatórios e dados.                  │
│                                            [Contratar agora →]  │
└─────────────────────────────────────────────────────────────────┘
```

### Estado: Trial Expirado

Página com foco total em conversão:

```
┌─────────────────────────────────────────────────────────────────┐
│  Assinatura                                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─── ALERTA PRINCIPAL ────────────────────────────────────┐   │
│  │                                                          │   │
│  │  🔴 Seu trial expirou                                   │   │
│  │                                                          │   │
│  │  Contrate um plano para recuperar o acesso aos seus     │   │
│  │  relatórios e dados. Tudo continua salvo!               │   │
│  │                                                          │   │
│  │  [Ver planos e contratar →]                             │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─── SEUS DADOS ESTÃO SEGUROS ────────────────────────────┐   │
│  │                                                          │   │
│  │  • 45 funcionários cadastrados                          │   │
│  │  • 123 registros de ausências                           │   │
│  │  • 12 meses de histórico                                │   │
│  │                                                          │   │
│  │  Tudo será mantido por 90 dias aguardando sua decisão.  │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─── ESCOLHA SEU PLANO ───────────────────────────────────┐   │
│  │                                                          │   │
│  │  [Cards completos dos 3 planos inline]                  │   │
│  │                                                          │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │   │
│  │  │    OURO     │ │  DIAMANTE   │ │  PLATINA    │        │   │
│  │  │   Insights  │ │  Analytics  │ │   Vision    │        │   │
│  │  │             │ │  ⭐ Popular │ │             │        │   │
│  │  │  R$ 299/mês │ │  R$ 499/mês │ │  R$ 699/mês │        │   │
│  │  │             │ │             │ │             │        │   │
│  │  │ [Contratar] │ │ [Contratar] │ │ [Contratar] │        │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘        │   │
│  │                                                          │   │
│  │  Funcionários: [▼ Selecione a quantidade]               │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  💬 Dúvidas? Fale conosco: suporte@synnerdata.com              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Diferenças: Trial vs Ativo

| Seção | Trial | Ativo |
|-------|-------|-------|
| Alerta | Countdown do trial | Só se houver problema |
| Plano | Barra de dias + expira em | Barra de funcionários + próxima cobrança |
| Features | "O que você está aproveitando" | **Não mostra** |
| Método pagamento | **Não mostra** | Mostra cartão |
| Faturas | **Não mostra** | Mostra últimas 3 |
| Dados cobrança | Incentiva preencher | Mostra preenchido |
| Mini planos | Preview dos planos | **Não mostra** |
| Cancelar | **Não mostra** | Mostra link |

---

## 7. Resumo: Estados da Página

| Estado | Seções Visíveis | Alertas |
|--------|-----------------|---------|
| Trial ativo (8-14 dias) | Trial, Features, Dados, Mini planos | Nenhum |
| Trial urgente (4-7 dias) | Trial, Features, Dados, Mini planos | Amarelo |
| Trial crítico (1-3 dias) | Trial, Features, Dados, Mini planos | Vermelho |
| Trial expirado | Alerta, Dados salvos, Planos inline | Vermelho grande |
| Ativo | Plano, Pagamento, Cobrança, Faturas | Limite funcionários se > 80% |
| Past due | Todas | Alerta pagamento pendente |
| Cancelamento agendado | Todas | Banner cancelamento |
| Downgrade agendado | Todas | Banner downgrade |

---

## 8. Navegação

```
Settings
├── Assinatura (/settings/subscription)
│   ├── → Planos (/settings/plans)
│   ├── → Faturas (/settings/invoices)
│   ├── [Modal] Atualizar cartão
│   ├── [Modal] Editar dados cobrança
│   └── [Modal] Fluxo cancelamento
│
└── Planos (/settings/plans)
    ├── ← Assinatura
    ├── [Modal] Preview upgrade
    ├── [Modal] Preview downgrade
    └── → Checkout externo (Pagar.me)
```

---

## 9. Responsividade

### Desktop (> 1024px)
- Layout em grid/colunas
- Cards lado a lado na página de planos

### Tablet (768px - 1024px)
- Cards em 2 colunas
- Seções empilhadas

### Mobile (< 768px)
- Layout em coluna única
- Cards de planos em carrossel ou empilhados
- Modais viram sheets full-screen

---

## 10. Implementação

### MVP - Frontend

- [ ] Página `/settings/subscription` com todas as seções
- [ ] Página `/settings/plans` com seleção de planos
- [ ] Alertas condicionais (trial, pagamento, downgrade, cancelamento)
- [ ] Barra de progresso de funcionários
- [ ] Modal atualizar cartão
- [ ] Modal editar dados de cobrança
- [ ] Modal preview upgrade
- [ ] Modal preview downgrade
- [ ] Fluxo de cancelamento (3 passos)
- [ ] Download de faturas
- [ ] Estados diferentes da página (trial, ativo, past_due, etc.)
- [ ] Responsividade mobile

### Fase 2 - Frontend

- [ ] Página `/settings/invoices` dedicada (se necessário)
- [ ] Comparativo detalhado de features entre planos
- [ ] Animações e transições
- [ ] Gráfico de uso de funcionários ao longo do tempo
