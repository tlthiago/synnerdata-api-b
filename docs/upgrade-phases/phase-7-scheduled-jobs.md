# Fase 7: Jobs Agendados (Scheduled Jobs)

## Objetivo

Implementar jobs agendados para:
1. Expirar trials automaticamente
2. Notificar usuários sobre trial expirando (3 dias antes)

## Pré-requisitos

- **Fase 6 completa:** Email de confirmação funcionando
- **Decisão de infraestrutura:** Escolher mecanismo de agendamento

---

## Opções de Implementação

### Opção A: Cron Job Externo (Recomendado para início)

Usar scheduler externo (GitHub Actions, Render Cron, Railway Cron) que chama endpoints da API.

**Prós:**
- Simples de implementar
- Não precisa de dependências extras
- Fácil de monitorar

**Contras:**
- Depende de serviço externo
- Latência de cold start

### Opção B: Bun Cron (Built-in)

Usar `Bun.CronJob` para agendar tarefas no próprio processo.

**Prós:**
- Sem dependências externas
- Execução no mesmo processo

**Contras:**
- Perde agendamentos se o processo reiniciar
- Não ideal para múltiplas instâncias

### Opção C: Bull/BullMQ + Redis

Usar filas com Redis para jobs robustos.

**Prós:**
- Resiliente a falhas
- Suporta múltiplas instâncias
- Retry automático

**Contras:**
- Requer Redis
- Mais complexo

---

## 7.1 Criar endpoints para jobs

**Arquivo:** `src/modules/payments/jobs/index.ts`

```typescript
import { Elysia, t } from "elysia";
import { JobsService } from "./jobs.service";

export const jobsController = new Elysia({
  name: "payment-jobs",
  prefix: "/jobs",
  detail: { tags: ["Payments - Jobs"] },
})
  // Proteger com API key interna
  .guard(
    {
      headers: t.Object({
        "x-api-key": t.String(),
      }),
      beforeHandle: ({ headers, set }) => {
        if (headers["x-api-key"] !== process.env.INTERNAL_API_KEY) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
      },
    },
    (app) =>
      app
        .post("/expire-trials", async () => JobsService.expireTrials(), {
          detail: { summary: "Expire overdue trials" },
        })
        .post(
          "/notify-expiring-trials",
          async () => JobsService.notifyExpiringTrials(),
          {
            detail: { summary: "Notify trials expiring in 3 days" },
          }
        )
  );
```

---

## 7.2 Implementar JobsService

**Arquivo:** `src/modules/payments/jobs/jobs.service.ts`

```typescript
import { and, eq, lt, gt, between } from "drizzle-orm";
import { db } from "@/db";
import {
  orgSubscriptions,
  organizations,
  members,
  users,
} from "@/db/schema";
import { PaymentHooks } from "../hooks";
import { sendTrialExpiringEmail } from "@/lib/email";

export abstract class JobsService {
  /**
   * Expire all trials that have passed their end date.
   * Should run daily (e.g., at midnight).
   */
  static async expireTrials(): Promise<{
    processed: number;
    expired: string[];
  }> {
    const now = new Date();

    // Find trials that should be expired
    const trialsToExpire = await db.query.orgSubscriptions.findMany({
      where: and(
        eq(orgSubscriptions.status, "trial"),
        lt(orgSubscriptions.trialEnd, now)
      ),
    });

    const expiredIds: string[] = [];

    for (const subscription of trialsToExpire) {
      await db
        .update(orgSubscriptions)
        .set({ status: "expired" })
        .where(eq(orgSubscriptions.id, subscription.id));

      expiredIds.push(subscription.id);

      // Emit event
      PaymentHooks.emit("trial.expired", { subscription });
    }

    console.log(`[Jobs] Expired ${expiredIds.length} trials`);

    return {
      processed: trialsToExpire.length,
      expired: expiredIds,
    };
  }

  /**
   * Notify users whose trials expire in 3 days.
   * Should run daily (e.g., at 9am).
   */
  static async notifyExpiringTrials(): Promise<{
    processed: number;
    notified: string[];
  }> {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const fourDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

    // Find trials expiring in ~3 days (between 3 and 4 days from now)
    const expiringTrials = await db
      .select({
        subscription: orgSubscriptions,
        organization: organizations,
      })
      .from(orgSubscriptions)
      .innerJoin(
        organizations,
        eq(orgSubscriptions.organizationId, organizations.id)
      )
      .where(
        and(
          eq(orgSubscriptions.status, "trial"),
          between(orgSubscriptions.trialEnd, threeDaysFromNow, fourDaysFromNow)
        )
      );

    const notifiedIds: string[] = [];

    for (const { subscription, organization } of expiringTrials) {
      // Get owner email
      const [owner] = await db
        .select({ email: users.email, name: users.name })
        .from(members)
        .innerJoin(users, eq(members.userId, users.id))
        .where(
          and(
            eq(members.organizationId, subscription.organizationId),
            eq(members.role, "owner")
          )
        )
        .limit(1);

      if (!owner?.email) continue;

      // Calculate days remaining
      const daysRemaining = Math.ceil(
        (subscription.trialEnd!.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      try {
        await sendTrialExpiringEmail({
          to: owner.email,
          userName: owner.name ?? "Usuário",
          organizationName: organization.name,
          daysRemaining,
          trialEndDate: subscription.trialEnd!,
        });

        notifiedIds.push(subscription.id);

        // Emit event
        PaymentHooks.emit("trial.expiring", {
          subscription,
          daysRemaining,
        });
      } catch (error) {
        console.error(
          `[Jobs] Failed to notify trial expiring for ${subscription.id}:`,
          error
        );
      }
    }

    console.log(`[Jobs] Notified ${notifiedIds.length} expiring trials`);

    return {
      processed: expiringTrials.length,
      notified: notifiedIds,
    };
  }
}
```

---

## 7.3 Implementar email de trial expirando

**Arquivo:** `src/lib/email.ts`

Adicionar função:

```typescript
type TrialExpiringEmailParams = {
  to: string;
  userName: string;
  organizationName: string;
  daysRemaining: number;
  trialEndDate: Date;
};

export async function sendTrialExpiringEmail(
  params: TrialExpiringEmailParams
): Promise<void> {
  const { to, userName, organizationName, daysRemaining, trialEndDate } =
    params;

  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(trialEndDate);

  await sendEmail({
    to,
    subject: `Seu trial expira em ${daysRemaining} dias - Synnerdata`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Seu trial está acabando!</h1>

        <p>Olá ${userName},</p>

        <p>
          O período de trial da organização <strong>${organizationName}</strong>
          expira em <strong>${daysRemaining} dias</strong> (${formattedDate}).
        </p>

        <p>
          Para continuar usando todos os recursos do Synnerdata,
          faça o upgrade para um plano pago.
        </p>

        <p>
          <a href="${env.APP_URL}/billing/upgrade"
             style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Fazer Upgrade Agora
          </a>
        </p>

        <hr style="border: 1px solid #eee; margin: 20px 0;">

        <p style="color: #666; font-size: 14px;">
          Após o trial, você perderá acesso às funcionalidades premium.
          Seus dados serão mantidos por 30 dias.
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

## 7.4 Registrar controller

**Arquivo:** `src/modules/payments/index.ts`

Adicionar:

```typescript
import { jobsController } from "./jobs";

// Na definição do paymentsController, adicionar:
.use(jobsController)
```

---

## 7.5 Configurar cron externo

### GitHub Actions (exemplo)

**Arquivo:** `.github/workflows/scheduled-jobs.yml`

```yaml
name: Scheduled Jobs

on:
  schedule:
    # Expirar trials - meia-noite UTC
    - cron: "0 0 * * *"
    # Notificar trials expirando - 9am BRT (12pm UTC)
    - cron: "0 12 * * *"
  workflow_dispatch: # Permite execução manual

jobs:
  expire-trials:
    if: github.event.schedule == '0 0 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Expire trials
        run: |
          curl -X POST "${{ secrets.API_URL }}/v1/payments/jobs/expire-trials" \
            -H "x-api-key: ${{ secrets.INTERNAL_API_KEY }}" \
            -H "Content-Type: application/json"

  notify-expiring:
    if: github.event.schedule == '0 12 * * *' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - name: Notify expiring trials
        run: |
          curl -X POST "${{ secrets.API_URL }}/v1/payments/jobs/notify-expiring-trials" \
            -H "x-api-key: ${{ secrets.INTERNAL_API_KEY }}" \
            -H "Content-Type: application/json"
```

---

## 7.6 Variáveis de ambiente

Adicionar ao `.env`:

```env
# API key para autenticar jobs internos
INTERNAL_API_KEY=sua-chave-secreta-aqui
```

---

## Validação

### Teste 1: Testar endpoint de expiração

```bash
curl -X POST http://localhost:3000/v1/payments/jobs/expire-trials \
  -H "x-api-key: $INTERNAL_API_KEY"
```

### Teste 2: Testar endpoint de notificação

```bash
curl -X POST http://localhost:3000/v1/payments/jobs/notify-expiring-trials \
  -H "x-api-key: $INTERNAL_API_KEY"
```

### Teste 3: Verificar tipos

```bash
npx tsc --noEmit
```

---

## Checklist

- [ ] `JobsService` implementado
- [ ] `jobsController` implementado com autenticação
- [ ] `sendTrialExpiringEmail()` implementado
- [ ] Controller registrado no `paymentsController`
- [ ] `INTERNAL_API_KEY` configurado no `.env`
- [ ] Cron externo configurado (GitHub Actions ou similar)
- [ ] `npx tsc --noEmit` passa
- [ ] Teste manual dos endpoints

> **Status: ⏳ PENDENTE**
>
> **Estimativa:** 3-4 horas
>
> **Prioridade:** Média
>
> **Dependências:**
> - Fase 6 (emails) completa
> - Decisão sobre mecanismo de cron
