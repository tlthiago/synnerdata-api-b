# Decisões: Cancelamento

> Documento de decisões para cancelamento de assinaturas.

---

## 1. Tipos de Cancelamento

| Tipo | Descrição | Comportamento |
|------|-----------|---------------|
| Soft Cancel | Usuário solicita cancelamento | Agenda para fim do período atual |
| Hard Cancel | Via Pagar.me webhook | Executa imediatamente |
| Grace Period Expire | Inadimplência após período de carência | Suspende acesso |
| Refund | Estorno de cobrança | Cancela imediatamente |

---

## 2. Fluxo de Cancelamento (Soft Cancel)

```
Usuário clica "Cancelar assinatura"
    ↓
Exibe tela de retenção (ver seção 3)
    ↓
[Usuário confirma cancelamento]
    ↓
Coleta motivo do cancelamento (obrigatório)
    ↓
Define cancelAtPeriodEnd = true
    ↓
Envia email de confirmação do agendamento
    ↓
Usuário mantém acesso até fim do período
    ↓
Lembretes antes da execução (ver seção 4)
    ↓
Job executa cancelamento na data de renovação
    ↓
Cancela subscription no Pagar.me
    ↓
Status muda para "canceled"
    ↓
Envia email de cancelamento executado
```

---

## 3. Estratégias de Retenção

### 3.1 Oferta de Downgrade

Antes de cancelar, sugerir plano mais barato:

```
┌─────────────────────────────────────────────────────────┐
│  Antes de ir...                                         │
│                                                         │
│  Que tal um plano mais acessível?                      │
│                                                         │
│  Seu plano atual: Diamond Analytics - R$ 499/mês       │
│                                                         │
│  Alternativa:                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Ouro Insights - R$ 299/mês                     │   │
│  │  ✓ Relatórios básicos                           │   │
│  │  ✓ Até 50 funcionários                          │   │
│  │  [Mudar para este plano]                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Continuar cancelando]                                 │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Oferta de Desconto (Fase 2)

Para clientes de alto valor, oferecer desconto temporário:

```
┌─────────────────────────────────────────────────────────┐
│  Queremos você conosco!                                 │
│                                                         │
│  Oferta especial: 30% de desconto nos próximos 3 meses │
│                                                         │
│  De R$ 499/mês → R$ 349/mês                            │
│                                                         │
│  [Aceitar oferta]    [Não, quero cancelar]             │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Pausa da Assinatura (Fase 2)

Permitir pausar por até 3 meses:

```
┌─────────────────────────────────────────────────────────┐
│  Precisa de um tempo?                                   │
│                                                         │
│  Pause sua assinatura por até 3 meses.                 │
│  Seus dados ficam seguros e você não será cobrado.     │
│                                                         │
│  [Pausar por 1 mês]                                    │
│  [Pausar por 3 meses]                                  │
│  [Continuar cancelando]                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Coleta de Motivo do Cancelamento

### Opções de Motivo

| Código | Motivo |
|--------|--------|
| `too_expensive` | Muito caro para minha empresa |
| `not_using` | Não estou usando o suficiente |
| `missing_features` | Faltam funcionalidades que preciso |
| `switching_competitor` | Vou usar outro sistema |
| `company_closing` | Empresa encerrando atividades |
| `temporary` | Pausa temporária |
| `bad_experience` | Experiência ruim com o sistema |
| `other` | Outro motivo |

### Interface

```
┌─────────────────────────────────────────────────────────┐
│  Por que você está cancelando?                          │
│                                                         │
│  ○ Muito caro para minha empresa                       │
│  ○ Não estou usando o suficiente                       │
│  ○ Faltam funcionalidades que preciso                  │
│  ○ Vou usar outro sistema                              │
│  ○ Empresa encerrando atividades                       │
│  ○ Pausa temporária                                    │
│  ○ Experiência ruim com o sistema                      │
│  ○ Outro motivo                                        │
│                                                         │
│  Comentário adicional (opcional):                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Voltar]              [Confirmar cancelamento]         │
└─────────────────────────────────────────────────────────┘
```

### Armazenamento

```typescript
// Novo campo em orgSubscriptions ou tabela separada
interface CancellationFeedback {
  organizationId: string;
  subscriptionId: string;
  reason: CancellationReason;
  comment?: string;
  canceledAt: Date;
  retentionOffered?: string;
  retentionAccepted: boolean;
}
```

---

## 5. Lembretes Antes da Execução

Enviar lembretes antes do cancelamento ser executado.

### Sequência de Emails

| Dias antes | Email |
|------------|-------|
| 7 dias | "Lembrete: Seu acesso termina em 7 dias" |
| 3 dias | "Faltam 3 dias para o fim do seu acesso" |
| 1 dia | "Amanhã seu acesso será encerrado" |

### Conteúdo do Email

```
Olá [Nome],

Seu acesso ao Synnerdata termina em [X dias/amanhã].

Você ainda pode voltar atrás! Basta clicar no botão abaixo
para manter sua assinatura.

[Manter assinatura]

Se mudar de ideia depois, pode voltar a qualquer momento.
Seus dados serão mantidos por 90 dias.
```

---

## 6. Restauração de Assinatura

### Antes do Período Terminar

Enquanto `cancelAtPeriodEnd = true` e período não expirou:

```typescript
// SubscriptionService.restore() - Já implementado
- cancelAtPeriodEnd = false
- canceledAt = null
- Mantém todos os dados
```

### Após Cancelamento Executado (Reativação)

Quando status = "canceled":

```typescript
// Nova funcionalidade: SubscriptionService.reactivate()
// Cria nova assinatura via checkout normal
// Dados históricos são mantidos
```

---

## 7. Grace Period (Inadimplência)

### Configuração Atual

| Item | Valor |
|------|-------|
| Duração | 15 dias |
| Comportamento | Mantém acesso durante período |
| Após período | Status muda para "canceled" |

### Fluxo

```
Cobrança falha
    ↓
Status → "past_due"
    ↓
Define gracePeriodEnds (+ 15 dias)
    ↓
Envia email de falha de pagamento
    ↓
[Dentro do grace period]
    → Usuário tem acesso
    → Retries automáticos de cobrança
    → Notificações de atualização de cartão
    ↓
[Grace period expira]
    ↓
Job suspendExpiredGracePeriods()
    ↓
Status → "canceled"
    ↓
Acesso bloqueado
```

### Emails Durante Grace Period

| Dia | Email |
|-----|-------|
| 0 | "Falha no pagamento - atualize seus dados" |
| 5 | "Lembrete: seu pagamento está pendente" |
| 10 | "Urgente: 5 dias para suspensão do acesso" |
| 14 | "Último dia para regularizar pagamento" |

---

## 8. Retenção de Dados

### Política

| Período | Comportamento |
|---------|---------------|
| 0-90 dias | Dados mantidos integralmente |
| 90-180 dias | Dados em cold storage |
| 180+ dias | Dados excluídos permanentemente |

### Comunicação

- Informar no cancelamento: "Seus dados serão mantidos por 90 dias"
- Email em 60 dias: "Seus dados serão excluídos em 30 dias"
- Email em 85 dias: "Última chance - dados serão excluídos em 5 dias"

---

## 9. Win-Back (Reconquista)

### Sequência de Emails Pós-Cancelamento

| Dia | Email | Oferta |
|-----|-------|--------|
| 7 | "Sentimos sua falta" | - |
| 14 | "Novidades desde sua saída" | - |
| 30 | "Oferta especial de retorno" | 20% off 3 meses |
| 60 | "Seus dados ainda estão seguros" | 30% off 3 meses |
| 85 | "Última chance antes da exclusão" | 40% off 3 meses |

### Conteúdo do Email (30 dias)

```
Olá [Nome],

Faz 30 dias que você cancelou sua assinatura do Synnerdata.

Desde então, adicionamos:
- [Nova feature 1]
- [Nova feature 2]

Queremos você de volta! Use o cupom VOLTE30 para
30% de desconto nos próximos 3 meses.

[Reativar com desconto]

Seu plano anterior: [Plano] - R$ [Preço]/mês
Com desconto: R$ [Preço com desconto]/mês
```

---

## 10. Interface de Cancelamento Agendado

Quando há cancelamento agendado, exibir na página de assinatura:

```
┌─────────────────────────────────────────────────────────┐
│  ⚠️ Cancelamento agendado                               │
│                                                         │
│  Seu acesso termina em 15/02/2025.                     │
│  Após essa data, você não poderá acessar               │
│  seus relatórios e dados.                              │
│                                                         │
│  Mudou de ideia?                                        │
│  [Manter assinatura]                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 11. Cancelamento pelo Admin (Backoffice)

### Capacidades do Admin

| Ação | Descrição |
|------|-----------|
| Cancelar imediatamente | Encerra acesso na hora |
| Agendar cancelamento | Igual ao fluxo do usuário |
| Restaurar assinatura | Reverter cancelamento agendado |
| Estender período | Dar dias extras de acesso |

### Motivos de Cancelamento Admin

| Código | Motivo |
|--------|--------|
| `admin_request` | Solicitação do cliente (suporte) |
| `fraud` | Atividade fraudulenta |
| `chargeback` | Contestação de cobrança |
| `terms_violation` | Violação dos termos de uso |
| `non_payment` | Inadimplência prolongada |
| `other_admin` | Outro motivo (requer comentário) |

### Interface Admin

```
┌─────────────────────────────────────────────────────────┐
│  Cancelar Assinatura - [Nome da Empresa]                │
│                                                         │
│  Plano atual: Diamond Analytics                         │
│  Status: Ativo                                          │
│  Próxima cobrança: 15/02/2025                          │
│                                                         │
│  Tipo de cancelamento:                                  │
│  ○ Agendar para fim do período (15/02/2025)            │
│  ○ Cancelar imediatamente                              │
│                                                         │
│  Motivo:                                                │
│  [Dropdown com motivos admin]                           │
│                                                         │
│  Comentário interno:                                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ☑ Notificar cliente por email                         │
│                                                         │
│  [Cancelar]              [Confirmar cancelamento]       │
└─────────────────────────────────────────────────────────┘
```

### Notificação ao Cliente

Quando admin cancela, enviar email:

```
Olá [Nome],

Sua assinatura do Synnerdata foi cancelada.

[Se agendado]
Você terá acesso até [DATA].

[Se imediato]
O acesso foi encerrado.

Se você tiver dúvidas, entre em contato com nosso suporte.
```

### Logs e Auditoria

Registrar todas as ações de admin:
- Quem cancelou (admin ID)
- Quando
- Motivo selecionado
- Comentário interno
- Se cliente foi notificado

---

## 12. Métricas de Cancelamento

### KPIs a Monitorar

| Métrica | Descrição |
|---------|-----------|
| Churn Rate | % de cancelamentos por mês |
| Retention Rate | % de restaurações antes da execução |
| Reason Distribution | Distribuição de motivos |
| Win-Back Rate | % de reativações após cancelamento |
| Average Lifetime | Tempo médio de assinatura |

### Dashboard Admin (Fase 2)

- Gráfico de churn ao longo do tempo
- Top motivos de cancelamento
- Efetividade das ofertas de retenção
- Cohort analysis de clientes

---

## Implementação Necessária

### MVP - Backend

- [ ] Adicionar campo `cancellationReason` em `orgSubscriptions` ou criar tabela `cancellationFeedback`
- [ ] Endpoint para coletar motivo do cancelamento
- [ ] Job `notifyScheduledCancellations()` para lembretes (7, 3, 1 dias antes)
- [ ] Endpoint para listar motivos disponíveis
- [ ] Sugerir downgrade antes de confirmar cancelamento (lógica para selecionar plano menor)

### MVP - Frontend

- [ ] Tela de retenção com oferta de downgrade
- [ ] Formulário de coleta de motivo (obrigatório)
- [ ] Card de cancelamento agendado na página de assinatura
- [ ] Botão "Manter assinatura" para restaurar

### MVP - Backend (Admin)

- [ ] Endpoint admin para cancelar assinatura (imediato ou agendado)
- [ ] Endpoint admin para restaurar assinatura
- [ ] Endpoint admin para estender período
- [ ] Tabela/campos para motivos de cancelamento admin
- [ ] Logs de auditoria para ações admin
- [ ] Email de notificação ao cliente (opcional)

### MVP - Frontend (Admin)

- [ ] Tela de cancelamento admin com opções
- [ ] Dropdown de motivos admin
- [ ] Campo de comentário interno
- [ ] Checkbox de notificação ao cliente
- [ ] Lista de histórico de ações admin

### Fase 2 - Backend

- [ ] Ofertas de desconto para retenção
- [ ] Pausar assinatura (1-3 meses)
- [ ] Sequência de win-back emails
- [ ] Métricas e dashboard de cancelamento
- [ ] Cold storage e exclusão programada de dados
- [ ] Endpoint `reactivate()` para ex-clientes
- [ ] Sistema de reembolsos (política, cálculo proporcional, integração Pagar.me)
- [ ] LGPD: Endpoint para solicitação de exclusão de dados (direito ao esquecimento)

### Fase 2 - Frontend

- [ ] Tela de pausa de assinatura
- [ ] Modal de oferta de desconto
- [ ] Dashboard admin de métricas de cancelamento

---

## Estrutura do Banco

### Campos Existentes em `orgSubscriptions`

| Campo | Uso |
|-------|-----|
| `status` | "active", "trial", "past_due", "canceled", "expired" |
| `cancelAtPeriodEnd` | true = cancelamento agendado |
| `canceledAt` | Data em que o cancelamento foi solicitado |
| `currentPeriodEnd` | Data em que o acesso termina |
| `pastDueSince` | Início da inadimplência |
| `gracePeriodEnds` | Fim do período de carência |

### Novos Campos/Tabela a Criar

```typescript
// Opção 1: Adicionar em orgSubscriptions
cancellationReason: text;
cancellationComment: text;

// Opção 2: Tabela separada (recomendado para histórico)
cancellationFeedback: {
  id: string;
  organizationId: string;
  subscriptionId: string;
  reason: enum;
  comment?: string;
  retentionOffered?: string;
  retentionAccepted: boolean;
  createdAt: Date;
}
```
