# Price Adjustment Module

Reajuste de preço de assinaturas pelo admin: individual (uma subscription) ou bulk (todas de um tier + billing cycle).

## Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/payments/price-adjustments/subscriptions/:subscriptionId` | Reajuste individual de uma subscription |
| POST | `/payments/price-adjustments/bulk` | Reajuste em massa por tier + billing cycle |
| GET | `/payments/price-adjustments/subscriptions/:subscriptionId/history` | Historico de reajustes (paginado) |

Todos os endpoints sao `requireAdmin: true` e hidden em producao (`detail.hide: isProduction`).

## Regras de Negocio

### Input: sempre `newPriceMonthly`

- O admin informa o preco **mensal** em centavos (min: 100 = R$ 1,00)
- Para subscriptions `yearly`, o servico calcula automaticamente via `calculateYearlyPrice(monthly, discountPercent)`
- O `yearlyDiscountPercent` vem do plano associado (fallback: 20%)

### Subscriptions Ajustaveis

Uma subscription so pode ser ajustada se:
1. Existe no banco
2. `status === "active"`
3. `priceAtPurchase !== null` (nao e trial)

Qualquer violacao lanca `SubscriptionNotAdjustableError`.

### Individual (`adjustIndividual`)

Fluxo:
1. Valida subscription (regras acima)
2. Busca plano para `yearlyDiscountPercent`
3. Calcula `effectiveNewPrice` (monthly ou yearly conforme `billingCycle`)
4. Atualiza item da subscription no Pagarme via `updateSubscriptionItem` (se `pagarmeSubscriptionId` existir)
5. Atualiza `orgSubscriptions`: `priceAtPurchase = effectiveNewPrice`, `isCustomPrice = true`
6. Insere registro em `price_adjustments` (tipo `individual`)
7. Emite hook `subscription.priceAdjusted`

### Bulk (`adjustBulk`)

Fluxo:
1. Valida que o tier existe e pertence ao plano
2. Busca plano para `yearlyDiscountPercent` e `displayName`
3. Calcula `effectiveNewPrice`
4. Atualiza catalogo Pagarme (`updatePlan`) — afeta **novas** assinaturas
5. Busca todas subscriptions ativas do tier + billingCycle
6. Para cada subscription com `pagarmeSubscriptionId`: chama `updateSubscriptionItem` — afeta **existentes**
7. Transacao atomica (`db.transaction`):
   - Atualiza tier: `priceMonthly` **e** `priceYearly` (sempre o par, independente do billingCycle)
   - Para cada subscription: atualiza `priceAtPurchase` + `isCustomPrice: true`, insere `price_adjustments`
8. Emite hooks `subscription.priceAdjusted` para cada subscription (apos commit)

### Historico (`getHistory`)

- Paginado com `page` e `limit` (default: page=1, limit=20)
- Ordenado por `createdAt` DESC
- Retorna shape flat `{ success, data: [], pagination: { total, limit, offset } }` (usa `paginatedResponseSchema`, **nao** `wrapSuccess()`)

## Integracao Pagarme

### `updatePlan` vs `updateSubscriptionItem`

- `PagarmeClient.updatePlan(planId, ...)` atualiza o **catalogo** — afeta apenas novas assinaturas criadas a partir desse plano
- `PagarmeClient.updateSubscriptionItem(subId, itemId, ...)` atualiza o preco de uma subscription **existente** — aplica no proximo ciclo de cobranca com pro-rata
- O metodo privado `updatePagarmeSubscriptionItemPrice(pagarmeSubscriptionId, newPrice)` e reutilizado por `adjustIndividual` e `adjustBulk`
- Se a subscription Pagarme nao tem items (`items` vazio), o update e silenciosamente pulado

### Campos do `updateSubscriptionItem`

```typescript
{
  description: currentItem.name || plan.name || "Assinatura",
  quantity: currentItem.quantity,
  status: currentItem.status,
  pricing_scheme: { price: newPrice, scheme_type: "unit" }
}
```

## Estrategia de Transacao (Bulk)

- Chamadas Pagarme (externas, nao-rollbackable) acontecem **fora** da transacao DB
- Escritas locais (tier + subscriptions + adjustments) sao atomicas dentro de `db.transaction()`
- Se uma chamada Pagarme falhar no meio do loop, a transacao DB faz rollback — subscriptions ja atualizadas no Pagarme ficarao com preco novo la, mas o DB local nao tera registro. Isso e aceitavel porque o DB e a source of truth para exibicao, e um retry do bulk corrigira

## Hook: `subscription.priceAdjusted`

Emitido via `PaymentHooks.emit()` com payload:

```typescript
{
  subscription: { ...originalSubscription, priceAtPurchase: newPrice, isCustomPrice: true },
  oldPrice: number,
  newPrice: number,
  reason: string,
  adjustmentType: "individual" | "bulk",
  adminId: string
}
```

## Tabela: `price_adjustments`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | text PK | `price-adj-<uuid>` |
| subscriptionId | text FK | Referencia `org_subscriptions.id` |
| organizationId | text | ID da org |
| oldPrice | integer | Preco anterior (centavos) |
| newPrice | integer | Novo preco (centavos) |
| reason | text | Motivo informado pelo admin |
| adjustmentType | enum | `individual` \| `bulk` |
| billingCycle | text | `monthly` \| `yearly` |
| pricingTierId | text nullable | Tier associado (pode ser null) |
| adminId | text | Admin que executou |
| createdAt | timestamp | Data do reajuste |

## Campos em `org_subscriptions` relacionados

- `priceAtPurchase` (integer, nullable) — preco vigente em centavos. `null` = trial
- `isCustomPrice` (boolean) — `true` quando preco foi reajustado (individual ou bulk)
- `pagarmeSubscriptionId` (text, nullable) — ID da subscription no Pagarme. Quando ausente, nenhuma chamada Pagarme e feita

## Erros

| Classe | Status | Code | Quando |
|--------|--------|------|--------|
| `SubscriptionNotAdjustableError` | 400 | `SUBSCRIPTION_NOT_ADJUSTABLE` | Subscription nao encontrada, nao ativa, ou trial |
| `TierNotFoundForAdjustmentError` | 404 | `TIER_NOT_FOUND_FOR_ADJUSTMENT` | Tier nao existe ou nao pertence ao plano |

## Dependencias

- `PagarmeClient` — `getSubscription()`, `updateSubscriptionItem()`, `updatePlan()`
- `calculateYearlyPrice()` — de `plans/plans.constants`
- `PaymentHooks` — emissao de eventos
- `paginatedResponseSchema` / `successResponseSchema` — de `@/lib/responses/response.types`
