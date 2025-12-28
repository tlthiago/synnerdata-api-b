# Decisões: Onboarding, Trial e Planos

> Documento de decisões para o módulo de payments - MVP e evolução futura.

---

## 1. Estratégia de Trial

| Item | Decisão |
|------|---------|
| Plano do trial | Plano "Trial" separado (não Platinum) |
| Duração | 14 dias |
| Cartão obrigatório | Não (foco em volume para MVP) |
| Trial no Pagar.me | Não, apenas local |

---

## 2. Pré-Signup

| Item | Decisão |
|------|---------|
| Vídeo demo | Landing page com vídeo mostrando sistema com dados reais |
| Página de planos | Exibir relatórios disponíveis em cada plano |

---

## 3. Pós-Signup (Sistema Vazio)

| Item | Decisão |
|------|---------|
| Placeholders | Dados fictícios com visual diferenciado (opacidade/marca d'água) |
| CTA nos placeholders | "Estes são dados de exemplo. [Cadastrar meus dados →]" |
| Remoção do placeholder | Ao cadastrar 1º dado real daquele tipo |
| Badge nos relatórios | Indicar em quais planos o relatório está disponível |

---

## 4. Cadastro de Dados

| Item | Decisão |
|------|---------|
| Fluxo de dependências | setores → filiais → cargos → funcionários |
| Import em massa | Botão inativo + ícone "?" com tooltip das dependências |
| Criação inline | Considerar para fase 2 |

---

## 5. Fluxo de Onboarding (Modal)

| Passo | Conteúdo |
|-------|----------|
| 1 | Cadastrar nome do usuário |
| 2 | Cadastrar nome da organização |
| 3 | Boas-vindas + CTAs direcionados |

### Passo 3 - CTAs:
- "Cadastrar funcionários"
- "Explorar relatórios de exemplo"
- "Começar do zero" (fechar)

---

## 6. Banner de Trial (Sidebar)

| Item | Decisão |
|------|---------|
| Informações | Nome do plano + dias restantes + "Ver planos" |
| Visual dinâmico por urgência | Sim |

### Cores por urgência:

| Dias restantes | Visual |
|----------------|--------|
| 14-8 dias | Normal |
| 7-4 dias | Amarelo/warning |
| 3-1 dias | Vermelho/urgente |
| Expirado | Vermelho + "Trial expirado" |

---

## 7. Checklist de Primeiros Passos (Fase 2)

| Item | Decisão |
|------|---------|
| Localização | Sidebar ou dashboard |
| Itens | Criar org → Acessar plataforma → Cadastrar setores → Cadastrar funcionários → Ver relatório |

---

## 8. Sequência de Emails - Trial Ativo

| Dia | Foco | Assunto |
|-----|------|---------|
| 1 | Boas-vindas | "Bem-vindo! Comece por aqui" |
| 3 | Valor | "Empresas como a sua usam esses insights para reduzir acidentes" |
| 7 | Engajamento | "Você já explorou o relatório de [X]?" |
| 11 | Conversão | "Faltam 3 dias - escolha o plano ideal para você" |
| 14 | Expiração | "Seu trial expirou - seus dados estão seguros" |

---

## 9. Sequência de Emails - Pós-Expiração (Fase 2)

| Dia | Foco | Assunto |
|-----|------|---------|
| 17 | Reconquistar | "Sentimos sua falta - ainda dá tempo de voltar" |
| 21 | Reter dados | "Seus dados continuam seguros - volte quando quiser" |
| 30 | Última tentativa | "Última chance - oferta especial para você" |

---

## 10. Personalização por Comportamento (Fase 2)

| Comportamento | Email Alternativo |
|---------------|-------------------|
| Não logou após signup | "Precisa de ajuda para começar?" |
| Logou mas não cadastrou dados | "Falta pouco para seu primeiro relatório" |
| Cadastrou dados mas não viu relatório | "Seu relatório está pronto - veja agora!" |

---

## 11. Estrutura de Planos

| Item | Decisão |
|------|---------|
| Plano Trial | Plano separado no banco, não no Pagar.me |
| Planos pagos | Gold, Diamond, Platinum (sincronizados com Pagar.me) |
| Flag de identificação | `isTrial: boolean` no plano |
| Visibilidade | Trial: `isPublic: false`, Pagos: `isPublic: true` |

---

## 12. Estrutura de Limits

| Item | Decisão |
|------|---------|
| Formato | JSON no campo `limits` do plano |
| MVP | `features` + `maxEmployees` |
| Fase 2 | `maxStorageGB`, `maxProjects`, etc. |

### Estrutura do JSON:
```json
{
  "features": ["absences", "warnings", "accidents", "..."],
  "maxEmployees": 50
}
```

---

## 13. Plano Trial (Configuração)

| Campo | Valor |
|-------|-------|
| `name` | "Trial" |
| `isPublic` | `false` |
| `isTrial` | `true` |
| `trialDays` | 14 |
| `limits.features` | Todas as features (igual Platinum) |
| `limits.maxEmployees` | `null` (sem limite) |

---

## 14. Pricing Tiers vs Limits

| Tabela | Propósito |
|--------|-----------|
| `subscriptionPlans.limits` | Define o que o plano permite (features, maxEmployees) |
| `planPricingTiers` | Define preços por range de funcionários |

### Fluxo:
1. Usuário escolhe plano (Gold)
2. Informa quantidade de funcionários (35)
3. Sistema encontra pricing tier (31-50 = R$199)
4. `maxEmployees` do tier (50) vira limite da assinatura

---

## 15. Enforcement de Limites

| Item | Decisão |
|------|---------|
| Tipo de bloqueio | Hard block (impede cadastro) |
| Momento | No endpoint de cadastro de funcionário |
| Mensagem | "Limite de funcionários atingido. Faça upgrade para cadastrar mais." |

---

## 16. Downgrade com Excedente

| Item | Decisão |
|------|---------|
| Comportamento | Bloquear downgrade |
| Mensagem | "Você tem X funcionários. Para mudar para este plano (máx Y), primeiro remova Z funcionários." |

---

## Implementação Necessária

### MVP - Backend

**Onboarding & Trial:**
- [ ] Criar plano Trial no banco (seed)
- [ ] Ajustar `SubscriptionService.createTrial()` para usar plano Trial
- [ ] Novos jobs para emails dos dias 1, 3, 7
- [ ] Ajustar `notifyExpiringTrials` (dia 11)
- [ ] Email de expiração (dia 14)

**Planos & Limits:**
- [ ] Adicionar campo `isTrial` na tabela de planos
- [ ] Adicionar `maxEmployees` nos limits dos planos
- [ ] Criar `LimitsService.checkEmployeeLimit()`
- [ ] Enforcement no endpoint de cadastro de funcionário
- [ ] Validação de downgrade (bloquear se exceder limite)

### MVP - Frontend

- [ ] CTAs no passo 3 do modal de onboarding
- [ ] Banner dinâmico por urgência (cores)
- [ ] Indicador de "dados de exemplo" nos placeholders
- [ ] Mensagem de erro quando limite de funcionários atingido
- [ ] Mostrar uso atual vs limite (ex: "35/50 funcionários")
- [ ] Bloquear botão de downgrade se exceder

### Fase 2 - Backend

- [ ] Jobs para emails pós-expiração (dias 17, 21, 30)
- [ ] Tracking de comportamento do usuário
- [ ] Lógica de personalização de emails
- [ ] Painel admin para gerenciar planos
- [ ] Limits avançados (storage, projetos)

### Fase 2 - Frontend

- [ ] Checklist de primeiros passos
- [ ] Painel admin de planos
