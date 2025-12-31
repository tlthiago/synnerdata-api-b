import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

export type Subscription = typeof schema.orgSubscriptions.$inferSelect;
export type Plan = typeof schema.subscriptionPlans.$inferSelect;
export type PricingTier = typeof schema.planPricingTiers.$inferSelect;

/**
 * Busca subscription com plan e tier por organizationId.
 * Usado pelo changeSubscription() para obter contexto completo.
 */
export async function findSubscriptionWithPlanAndTier(
  organizationId: string
): Promise<{
  subscription: Subscription;
  plan: Plan;
  tier: PricingTier | null;
} | null> {
  const [result] = await db
    .select({
      subscription: schema.orgSubscriptions,
      plan: schema.subscriptionPlans,
      tier: schema.planPricingTiers,
    })
    .from(schema.orgSubscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
    )
    .leftJoin(
      schema.planPricingTiers,
      eq(schema.orgSubscriptions.pricingTierId, schema.planPricingTiers.id)
    )
    .where(eq(schema.orgSubscriptions.organizationId, organizationId))
    .limit(1);

  return result ?? null;
}

/**
 * Busca subscription com pending plan por organizationId.
 * Usado pelo getScheduledChange() para mostrar mudança agendada.
 */
export async function findSubscriptionWithPendingPlan(
  organizationId: string
): Promise<{
  subscription: Subscription;
  pendingPlan: Plan | null;
} | null> {
  const [result] = await db
    .select({
      subscription: schema.orgSubscriptions,
      pendingPlan: schema.subscriptionPlans,
    })
    .from(schema.orgSubscriptions)
    .leftJoin(
      schema.subscriptionPlans,
      eq(schema.orgSubscriptions.pendingPlanId, schema.subscriptionPlans.id)
    )
    .where(eq(schema.orgSubscriptions.organizationId, organizationId))
    .limit(1);

  return result ?? null;
}

/**
 * Busca subscription com current plan por subscriptionId.
 * Usado pelo executeScheduledChange() para executar mudança agendada.
 */
export async function findSubscriptionWithCurrentPlan(
  subscriptionId: string
): Promise<{
  subscription: Subscription;
  currentPlan: Plan;
} | null> {
  const [result] = await db
    .select({
      subscription: schema.orgSubscriptions,
      currentPlan: schema.subscriptionPlans,
    })
    .from(schema.orgSubscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
    )
    .where(eq(schema.orgSubscriptions.id, subscriptionId))
    .limit(1);

  return result ?? null;
}

/**
 * Busca subscription simples por organizationId.
 */
export async function findSubscriptionByOrgId(
  organizationId: string
): Promise<Subscription | null> {
  const [subscription] = await db
    .select()
    .from(schema.orgSubscriptions)
    .where(eq(schema.orgSubscriptions.organizationId, organizationId))
    .limit(1);

  return subscription ?? null;
}

/**
 * Busca subscription simples por ID.
 */
export async function findSubscriptionById(
  subscriptionId: string
): Promise<Subscription | null> {
  const [subscription] = await db
    .select()
    .from(schema.orgSubscriptions)
    .where(eq(schema.orgSubscriptions.id, subscriptionId))
    .limit(1);

  return subscription ?? null;
}

/**
 * Busca plan por ID.
 */
export async function findPlanById(planId: string): Promise<Plan | null> {
  const [plan] = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .limit(1);

  return plan ?? null;
}
