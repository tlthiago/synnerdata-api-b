# Decisões: Emails e Notificações

> Lista consolidada de todos os emails enviados pelo módulo de payments.

---

## 1. Emails de Trial

| Dia | Trigger | Assunto | Fase |
|-----|---------|---------|------|
| 1 | Criação da conta | "Bem-vindo ao Synnerdata!" | MVP |
| 3 | Job diário | "Empresas como a sua usam esses insights" | MVP |
| 7 | Job diário | "Você já explorou o relatório de [X]?" | MVP |
| 11 | Job diário (3 dias antes) | "Faltam 3 dias - escolha seu plano" | MVP |
| 14 | Job diário (expiração) | "Seu trial expirou - seus dados estão seguros" | MVP |

### Emails Pós-Expiração (Fase 2)

| Dia | Trigger | Assunto |
|-----|---------|---------|
| 17 | Job diário | "Sentimos sua falta - ainda dá tempo" |
| 21 | Job diário | "Seus dados continuam seguros" |
| 30 | Job diário | "Última chance - oferta especial" |

---

## 2. Emails de Checkout

| Evento | Trigger | Assunto | Fase |
|--------|---------|---------|------|
| Link de checkout | Usuário inicia checkout | "Complete sua assinatura" | MVP |
| Assinatura ativada | Webhook `subscription.created` | "Assinatura confirmada!" | MVP |

---

## 3. Emails de Pagamento

| Evento | Trigger | Assunto | Fase |
|--------|---------|---------|------|
| Pagamento confirmado | Webhook `charge.paid` | "Pagamento confirmado" | MVP |
| Pagamento falhou | Webhook `charge.payment_failed` | "Problema com seu pagamento" | MVP |
| Grace period - 5 dias | Job diário | "Lembrete: pagamento pendente" | MVP |
| Grace period - 10 dias | Job diário | "Urgente: 5 dias para suspensão" | MVP |
| Grace period - 14 dias | Job diário | "Último dia para regularizar" | MVP |

---

## 4. Emails de Upgrade

| Evento | Trigger | Assunto | Fase |
|--------|---------|---------|------|
| Link de pagamento | Usuário solicita upgrade | "Complete seu upgrade" | MVP |
| Upgrade confirmado | Webhook `subscription.created` | "Upgrade realizado com sucesso!" | MVP |

---

## 5. Emails de Downgrade

| Evento | Trigger | Assunto | Fase |
|--------|---------|---------|------|
| Downgrade agendado | Usuário confirma downgrade | "Mudança de plano agendada" | MVP |
| Lembrete - 7 dias | Job diário | "Lembrete: Seu plano mudará em 7 dias" | MVP |
| Lembrete - 3 dias | Job diário | "Sua mudança de plano acontece em 3 dias" | MVP |
| Lembrete - 1 dia | Job diário | "Amanhã seu plano será alterado" | MVP |
| Downgrade executado | Job diário | "Seu plano foi alterado" | MVP |
| Downgrade cancelado | Usuário cancela mudança | "Mudança de plano cancelada" | MVP |

---

## 6. Emails de Cancelamento

| Evento | Trigger | Assunto | Fase |
|--------|---------|---------|------|
| Cancelamento agendado | Usuário confirma cancelamento | "Cancelamento agendado" | MVP |
| Lembrete - 7 dias | Job diário | "Lembrete: Seu acesso termina em 7 dias" | MVP |
| Lembrete - 3 dias | Job diário | "Faltam 3 dias para o fim do acesso" | MVP |
| Lembrete - 1 dia | Job diário | "Amanhã seu acesso será encerrado" | MVP |
| Cancelamento executado | Job diário | "Sua assinatura foi cancelada" | MVP |
| Restauração | Usuário restaura assinatura | "Assinatura restaurada!" | MVP |

### Win-Back (Fase 2)

| Dia após cancelamento | Assunto | Oferta |
|-----------------------|---------|--------|
| 7 | "Sentimos sua falta" | - |
| 14 | "Novidades desde sua saída" | - |
| 30 | "Oferta especial de retorno" | 20% off |
| 60 | "Seus dados ainda estão seguros" | 30% off |
| 85 | "Última chance antes da exclusão" | 40% off |

---

## 7. Emails de Limite de Funcionários

| Evento | Trigger | Assunto | Fase |
|--------|---------|---------|------|
| 80% do limite | Job diário ou cadastro | "Você está usando 80% do limite" | MVP |
| 95% do limite | Job diário ou cadastro | "Atenção: limite quase atingido" | MVP |
| 100% do limite | Tentativa de cadastro | "Limite atingido - faça upgrade" | MVP |

---

## 8. Emails de Admin

| Evento | Trigger | Assunto | Fase |
|--------|---------|---------|------|
| Cancelamento pelo admin | Admin cancela assinatura | "Sua assinatura foi cancelada" | MVP |

---

## 9. Resumo por Fase

### MVP - 22 tipos de email

| Categoria | Quantidade |
|-----------|------------|
| Trial | 5 |
| Checkout | 2 |
| Pagamento | 5 |
| Upgrade | 2 |
| Downgrade | 6 |
| Cancelamento | 6 |
| Limite funcionários | 3 |
| Admin | 1 |

### Fase 2 - 8 tipos adicionais

| Categoria | Quantidade |
|-----------|------------|
| Trial pós-expiração | 3 |
| Win-back | 5 |

---

## 10. Jobs de Email

Jobs diários que enviam emails:

| Job | Emails |
|-----|--------|
| `notifyExpiringTrials` | Trial dias 3, 7, 11 |
| `expireTrials` | Trial expirado |
| `notifyGracePeriod` | Grace period 5, 10, 14 dias |
| `notifyUpcomingDowngrades` | Downgrade 7, 3, 1 dias |
| `processScheduledPlanChanges` | Downgrade executado |
| `notifyScheduledCancellations` | Cancelamento 7, 3, 1 dias |
| `processScheduledCancellations` | Cancelamento executado |
| `notifyEmployeeLimits` | Limite 80%, 95% |

---

## 11. Implementação

### Emails já implementados

- [x] Trial expirando (3 dias)
- [x] Trial expirado
- [x] Checkout link
- [x] Assinatura ativada (upgrade confirmation)
- [x] Pagamento falhou
- [x] Cancelamento agendado
- [x] Cancelamento executado
- [x] Downgrade executado

### Emails a implementar (MVP)

- [ ] Boas-vindas (dia 1)
- [ ] Trial valor (dia 3)
- [ ] Trial engajamento (dia 7)
- [ ] Pagamento confirmado
- [ ] Grace period lembretes (5, 10, 14 dias)
- [ ] Upgrade link
- [ ] Upgrade confirmado
- [ ] Downgrade agendado
- [ ] Downgrade lembretes (7, 3, 1 dias)
- [ ] Downgrade cancelado
- [ ] Cancelamento lembretes (7, 3, 1 dias)
- [ ] Restauração de assinatura
- [ ] Limite funcionários (80%, 95%, 100%)
- [ ] Cancelamento pelo admin
