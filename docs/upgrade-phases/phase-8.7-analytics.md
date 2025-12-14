# Fase 8.7: Métricas e Analytics

> **Prioridade:** Baixa
> **Complexidade:** Média
> **Status:** ⏳ Pendente

## Objetivo

Adicionar métricas para monitoramento de MRR, churn, conversão de trials e outros KPIs de pagamentos.

## Pré-requisitos

- Fases 1-7 completas
- Subscription e webhooks funcionando

---

## KPIs Principais

| Métrica | Descrição | Fórmula |
|---------|-----------|---------|
| **MRR** | Monthly Recurring Revenue | Soma de todas as subscriptions ativas |
| **ARR** | Annual Recurring Revenue | MRR × 12 |
| **Churn Rate** | Taxa de cancelamento | Cancelados / Total no início do período |
| **Net MRR** | MRR líquido | Novo MRR - Churned MRR + Expansion MRR |
| **Trial Conversion** | Conversão de trials | Convertidos / Total de trials |
| **ARPU** | Average Revenue Per User | MRR / Total de clientes |
| **LTV** | Lifetime Value | ARPU / Churn Rate |

---

## Eventos para Tracking

```typescript
// Exemplo com analytics genérico
analytics.track("subscription.upgraded", {
  organizationId,
  planId,
  mrr: plan.priceMonthly,
});

analytics.track("subscription.canceled", {
  organizationId,
  reason: "user_requested",
  mrr_lost: plan.priceMonthly,
});

analytics.track("trial.started", {
  organizationId,
  planId,
});

analytics.track("trial.converted", {
  organizationId,
  days_in_trial: daysInTrial,
});

analytics.track("trial.expired", {
  organizationId,
  planId,
});

analytics.track("payment.succeeded", {
  organizationId,
  amount,
  invoiceId,
});

analytics.track("payment.failed", {
  organizationId,
  amount,
  reason,
});
```

---

## Service de Métricas

**Arquivo:** `src/modules/payments/metrics/metrics.service.ts`

```typescript
export abstract class MetricsService {
  /**
   * Calculate MRR (Monthly Recurring Revenue).
   */
  static async calculateMRR(): Promise<number> {
    const [result] = await db
      .select({
        mrr: sql<number>`
          SUM(
            CASE
              WHEN ${schema.orgSubscriptions.billingCycle} = 'yearly'
              THEN ${schema.subscriptionPlans.priceYearly} / 12
              ELSE ${schema.subscriptionPlans.priceMonthly}
            END
          )
        `,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.status, "active"));

    return result?.mrr ?? 0;
  }

  /**
   * Calculate churn rate for a period.
   */
  static async calculateChurnRate(
    startDate: Date,
    endDate: Date
  ): Promise<{
    churnRate: number;
    churned: number;
    totalAtStart: number;
  }> {
    // Subscriptions ativas no início do período
    const [atStart] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.orgSubscriptions)
      .where(
        and(
          eq(schema.orgSubscriptions.status, "active"),
          lt(schema.orgSubscriptions.createdAt, startDate)
        )
      );

    // Subscriptions canceladas no período
    const [churned] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.orgSubscriptions)
      .where(
        and(
          eq(schema.orgSubscriptions.status, "canceled"),
          gte(schema.orgSubscriptions.canceledAt, startDate),
          lte(schema.orgSubscriptions.canceledAt, endDate)
        )
      );

    const totalAtStart = Number(atStart?.count ?? 0);
    const churnedCount = Number(churned?.count ?? 0);
    const churnRate = totalAtStart > 0 ? (churnedCount / totalAtStart) * 100 : 0;

    return {
      churnRate: Math.round(churnRate * 100) / 100,
      churned: churnedCount,
      totalAtStart,
    };
  }

  /**
   * Calculate trial conversion rate.
   */
  static async calculateTrialConversion(
    startDate: Date,
    endDate: Date
  ): Promise<{
    conversionRate: number;
    converted: number;
    expired: number;
    total: number;
  }> {
    // Trials que terminaram no período
    const trials = await db
      .select({
        status: schema.orgSubscriptions.status,
      })
      .from(schema.orgSubscriptions)
      .where(
        and(
          gte(schema.orgSubscriptions.trialEnd, startDate),
          lte(schema.orgSubscriptions.trialEnd, endDate)
        )
      );

    const total = trials.length;
    const converted = trials.filter((t) => t.status === "active").length;
    const expired = trials.filter((t) => t.status === "expired" || t.status === "canceled").length;
    const conversionRate = total > 0 ? (converted / total) * 100 : 0;

    return {
      conversionRate: Math.round(conversionRate * 100) / 100,
      converted,
      expired,
      total,
    };
  }

  /**
   * Get subscription counts by status.
   */
  static async getSubscriptionsByStatus(): Promise<Record<string, number>> {
    const results = await db
      .select({
        status: schema.orgSubscriptions.status,
        count: sql<number>`count(*)`,
      })
      .from(schema.orgSubscriptions)
      .groupBy(schema.orgSubscriptions.status);

    return results.reduce(
      (acc, { status, count }) => ({
        ...acc,
        [status]: Number(count),
      }),
      {} as Record<string, number>
    );
  }

  /**
   * Get MRR breakdown by plan.
   */
  static async getMRRByPlan(): Promise<
    Array<{
      planId: string;
      planName: string;
      mrr: number;
      subscriptions: number;
    }>
  > {
    const results = await db
      .select({
        planId: schema.subscriptionPlans.id,
        planName: schema.subscriptionPlans.displayName,
        mrr: sql<number>`
          SUM(
            CASE
              WHEN ${schema.orgSubscriptions.billingCycle} = 'yearly'
              THEN ${schema.subscriptionPlans.priceYearly} / 12
              ELSE ${schema.subscriptionPlans.priceMonthly}
            END
          )
        `,
        subscriptions: sql<number>`count(*)`,
      })
      .from(schema.orgSubscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
      )
      .where(eq(schema.orgSubscriptions.status, "active"))
      .groupBy(schema.subscriptionPlans.id, schema.subscriptionPlans.displayName);

    return results.map((r) => ({
      planId: r.planId,
      planName: r.planName,
      mrr: Number(r.mrr ?? 0),
      subscriptions: Number(r.subscriptions),
    }));
  }

  /**
   * Get all metrics summary.
   */
  static async getSummary(): Promise<MetricsSummary> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [mrr, subscriptionsByStatus, churn, trialConversion, mrrByPlan] =
      await Promise.all([
        MetricsService.calculateMRR(),
        MetricsService.getSubscriptionsByStatus(),
        MetricsService.calculateChurnRate(thirtyDaysAgo, now),
        MetricsService.calculateTrialConversion(thirtyDaysAgo, now),
        MetricsService.getMRRByPlan(),
      ]);

    const activeSubscriptions = subscriptionsByStatus.active ?? 0;
    const arpu = activeSubscriptions > 0 ? mrr / activeSubscriptions : 0;

    return {
      mrr,
      arr: mrr * 12,
      arpu: Math.round(arpu),
      activeSubscriptions,
      trialing: subscriptionsByStatus.trial ?? 0,
      pastDue: subscriptionsByStatus.past_due ?? 0,
      canceled: subscriptionsByStatus.canceled ?? 0,
      churnRate: churn.churnRate,
      trialConversionRate: trialConversion.conversionRate,
      mrrByPlan,
    };
  }
}

type MetricsSummary = {
  mrr: number;
  arr: number;
  arpu: number;
  activeSubscriptions: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  churnRate: number;
  trialConversionRate: number;
  mrrByPlan: Array<{
    planId: string;
    planName: string;
    mrr: number;
    subscriptions: number;
  }>;
};
```

---

## Endpoint de Métricas (Admin)

**Arquivo:** `src/modules/payments/metrics/index.ts`

```typescript
export const metricsController = new Elysia({
  name: "metrics",
  prefix: "/admin/payments/metrics",
  detail: { tags: ["Admin - Metrics"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async () => {
      const summary = await MetricsService.getSummary();

      return {
        success: true as const,
        data: summary,
      };
    },
    {
      auth: {
        role: "admin",
      },
      detail: {
        summary: "Get payment metrics",
        description: "Returns MRR, churn rate, trial conversion and other metrics.",
      },
    }
  )
  .get(
    "/mrr/history",
    async ({ query }) => {
      const days = query.days ?? 30;
      const history = await MetricsService.getMRRHistory(days);

      return {
        success: true as const,
        data: { history },
      };
    },
    {
      auth: {
        role: "admin",
      },
      query: t.Object({
        days: t.Optional(t.Number()),
      }),
      detail: {
        summary: "Get MRR history",
        description: "Returns daily MRR for the specified period.",
      },
    }
  );
```

### Response Example

```json
{
  "success": true,
  "data": {
    "mrr": 15000,
    "arr": 180000,
    "arpu": 1500,
    "activeSubscriptions": 10,
    "trialing": 5,
    "pastDue": 2,
    "canceled": 3,
    "churnRate": 2.5,
    "trialConversionRate": 45.0,
    "mrrByPlan": [
      {
        "planId": "plan-starter",
        "planName": "Starter",
        "mrr": 5000,
        "subscriptions": 5
      },
      {
        "planId": "plan-pro",
        "planName": "Pro",
        "mrr": 10000,
        "subscriptions": 5
      }
    ]
  }
}
```

---

## Histórico de MRR

Para tracking de evolução do MRR ao longo do tempo:

**Arquivo:** `src/db/schema/payments.ts`

```typescript
export const mrrSnapshots = pgTable("mrr_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey(),
  date: date("date").notNull().unique(),
  mrr: integer("mrr").notNull(),
  activeSubscriptions: integer("active_subscriptions").notNull(),
  newMrr: integer("new_mrr").default(0),
  churnedMrr: integer("churned_mrr").default(0),
  expansionMrr: integer("expansion_mrr").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Job diário:**

```typescript
static async recordDailyMRR(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Verificar se já registrou hoje
  const existing = await db.query.mrrSnapshots.findFirst({
    where: eq(mrrSnapshots.date, today),
  });

  if (existing) return;

  const mrr = await MetricsService.calculateMRR();
  const { active: activeSubscriptions } = await MetricsService.getSubscriptionsByStatus();

  await db.insert(mrrSnapshots).values({
    id: crypto.randomUUID(),
    date: today,
    mrr,
    activeSubscriptions: activeSubscriptions ?? 0,
  });
}

static async getMRRHistory(days: number): Promise<
  Array<{
    date: string;
    mrr: number;
    activeSubscriptions: number;
  }>
> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return db.query.mrrSnapshots.findMany({
    where: gte(mrrSnapshots.date, startDate.toISOString().split("T")[0]),
    orderBy: asc(mrrSnapshots.date),
  });
}
```

---

## Integração com Serviços Externos

### Exemplo: Segment/Mixpanel

```typescript
// src/lib/analytics.ts
export const analytics = {
  track: async (event: string, properties: Record<string, unknown>) => {
    if (!env.ANALYTICS_ENABLED) return;

    // Segment
    if (env.SEGMENT_WRITE_KEY) {
      await fetch("https://api.segment.io/v1/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa(env.SEGMENT_WRITE_KEY + ":")}`,
        },
        body: JSON.stringify({
          event,
          properties,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  },

  identify: async (userId: string, traits: Record<string, unknown>) => {
    if (!env.ANALYTICS_ENABLED) return;

    // Segment
    if (env.SEGMENT_WRITE_KEY) {
      await fetch("https://api.segment.io/v1/identify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa(env.SEGMENT_WRITE_KEY + ":")}`,
        },
        body: JSON.stringify({
          userId,
          traits,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  },
};
```

---

## Model Schemas

**Arquivo:** `src/modules/payments/metrics/metrics.model.ts`

```typescript
export const metricsSummarySchema = z.object({
  mrr: z.number().describe("Monthly Recurring Revenue in cents"),
  arr: z.number().describe("Annual Recurring Revenue in cents"),
  arpu: z.number().describe("Average Revenue Per User in cents"),
  activeSubscriptions: z.number(),
  trialing: z.number(),
  pastDue: z.number(),
  canceled: z.number(),
  churnRate: z.number().describe("Churn rate percentage"),
  trialConversionRate: z.number().describe("Trial conversion percentage"),
  mrrByPlan: z.array(
    z.object({
      planId: z.string(),
      planName: z.string(),
      mrr: z.number(),
      subscriptions: z.number(),
    })
  ),
});

export const mrrHistorySchema = z.array(
  z.object({
    date: z.string(),
    mrr: z.number(),
    activeSubscriptions: z.number(),
  })
);
```

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/modules/payments/metrics/metrics.service.ts` | Service com cálculos de métricas |
| `src/modules/payments/metrics/metrics.model.ts` | Schemas Zod |
| `src/modules/payments/metrics/index.ts` | Controller admin |
| `src/db/schema/payments.ts` | Adicionar tabela `mrr_snapshots` |
| `src/lib/analytics.ts` | Helper para tracking (opcional) |

---

## Checklist de Implementação

- [ ] Implementar `MetricsService` com cálculos básicos
- [ ] Endpoint `GET /admin/payments/metrics`
- [ ] Tabela `mrr_snapshots` para histórico
- [ ] Job diário para registrar MRR
- [ ] Endpoint `GET /admin/payments/metrics/mrr/history`
- [ ] Integração com analytics externo (opcional)
- [ ] Dashboard admin (frontend)
- [ ] Testes unitários

---

> **Dependências:** Subscriptions funcionando
> **Impacto:** Visibilidade de negócio, tomada de decisões
