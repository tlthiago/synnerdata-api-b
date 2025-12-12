# Fase 6: Email de Confirmação de Upgrade

## Objetivo

Enviar email de confirmação ao owner da organização após upgrade bem-sucedido.

## Pré-requisitos

- **Fases 1-5 completas:** Fluxo de upgrade funcionando e testado
- **Serviço de email configurado:** `src/lib/email.ts` com Resend

---

## Status Atual

| Componente | Status | Localização |
|------------|--------|-------------|
| Serviço de email base | ✅ Existe | `src/lib/email.ts` |
| `sendEmail()` genérico | ✅ Existe | `src/lib/email.ts` |
| `sendOTPEmail()` | ✅ Existe | `src/lib/email.ts` |
| `sendUpgradeConfirmationEmail()` | ✅ Implementado | `src/lib/email.ts:79-167` |
| `sendUpgradeEmail()` helper | ✅ Implementado | `webhook.service.ts:440-515` |
| Chamada no webhook | ✅ Implementado | `handleSubscriptionCreated()` |

---

## 6.1 Implementar função de email

**Arquivo:** `src/lib/email.ts`

Adicionar função para envio de email de confirmação:

```typescript
type UpgradeConfirmationEmailParams = {
  to: string;
  organizationName: string;
  planName: string;
  planPrice: number; // em centavos
  nextBillingDate: Date | null;
  cardLast4?: string;
};

export async function sendUpgradeConfirmationEmail(
  params: UpgradeConfirmationEmailParams
): Promise<void> {
  const {
    to,
    organizationName,
    planName,
    planPrice,
    nextBillingDate,
    cardLast4,
  } = params;

  const formattedPrice = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(planPrice / 100);

  const formattedDate = nextBillingDate
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(nextBillingDate)
    : "N/A";

  await sendEmail({
    to,
    subject: `Bem-vindo ao Plano ${planName} - Synnerdata`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Bem-vindo ao Plano ${planName}!</h1>

        <p>Olá ${organizationName},</p>

        <p>Seu upgrade foi concluído com sucesso!</p>

        <hr style="border: 1px solid #eee; margin: 20px 0;">

        <h2 style="color: #333;">Detalhes da Assinatura</h2>

        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0;"><strong>Plano:</strong></td>
            <td style="padding: 8px 0;">${planName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Valor:</strong></td>
            <td style="padding: 8px 0;">${formattedPrice}/mês</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Próxima cobrança:</strong></td>
            <td style="padding: 8px 0;">${formattedDate}</td>
          </tr>
          ${
            cardLast4
              ? `
          <tr>
            <td style="padding: 8px 0;"><strong>Cartão:</strong></td>
            <td style="padding: 8px 0;">**** ${cardLast4}</td>
          </tr>
          `
              : ""
          }
        </table>

        <hr style="border: 1px solid #eee; margin: 20px 0;">

        <p>Você agora tem acesso a todos os recursos do plano ${planName}!</p>

        <p>
          <a href="${env.APP_URL}/billing"
             style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Gerenciar Assinatura
          </a>
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Precisa de ajuda? Responda este email.
        </p>

        <p style="color: #999; font-size: 12px;">
          Equipe Synnerdata
        </p>
      </div>
    `,
  });
}
```

---

## 6.2 Chamar envio no webhook

**Arquivo:** `src/modules/payments/webhook/webhook.service.ts`

Adicionar no final do método `handleSubscriptionCreated()`:

```typescript
// Após syncCustomerData e antes de emitir evento

// Buscar dados para o email
const [owner] = await db
  .select({
    email: users.email,
  })
  .from(members)
  .innerJoin(users, eq(members.userId, users.id))
  .where(
    and(
      eq(members.organizationId, organizationId),
      eq(members.role, "owner")
    )
  )
  .limit(1);

const [org] = await db
  .select({ name: organizations.name })
  .from(organizations)
  .where(eq(organizations.id, organizationId))
  .limit(1);

const plan = await db.query.subscriptionPlans.findFirst({
  where: eq(subscriptionPlans.id, subscription.planId),
});

// Enviar email de confirmação
if (owner?.email && plan) {
  try {
    await sendUpgradeConfirmationEmail({
      to: owner.email,
      organizationName: org?.name ?? "Sua organização",
      planName: plan.displayName,
      planPrice: plan.priceMonthly,
      nextBillingDate: periodEnd,
      cardLast4: data.card?.last_four_digits,
    });
  } catch (error) {
    // Log mas não falha o webhook
    console.error("Failed to send upgrade confirmation email:", error);
  }
}
```

---

## 6.3 Imports necessários

```typescript
// Em webhook.service.ts
import { sendUpgradeConfirmationEmail } from "@/lib/email";
import { organizations } from "@/db/schema";
```

---

## Validação

### Teste 1: Verificar tipos

```bash
npx tsc --noEmit
```

### Teste 2: Verificar linting

```bash
npx ultracite check
```

### Teste 3: Teste manual (sandbox)

1. Criar checkout via API
2. Completar pagamento no sandbox Pagar.me
3. Verificar se email foi enviado
4. Verificar logs se houver erro

---

## Checklist

- [x] `sendUpgradeConfirmationEmail()` implementado em `src/lib/email.ts`
- [x] Chamada adicionada em `handleSubscriptionCreated()`
- [x] Imports adicionados (via dynamic import para evitar remoção pelo linter)
- [x] `npx tsc --noEmit` passa
- [x] `npx ultracite check` passa
- [ ] Teste manual no sandbox

> **Status: ✅ COMPLETA**
>
> **Implementação:**
> - `sendUpgradeConfirmationEmail()` em `src/lib/email.ts:79-167`
> - `sendUpgradeEmail()` helper em `src/modules/payments/webhook/webhook.service.ts:445-522`
> - Chamada no `handleSubscriptionCreated()` após emissão do evento
>
> **Características:**
> - Email HTML formatado com detalhes da assinatura (plano, valor, próxima cobrança, cartão)
> - Usa dynamic imports para evitar problemas com linter de imports não utilizados
> - Error handling silencioso (loga erro mas não falha o webhook)
> - Busca owner da organização para enviar email
