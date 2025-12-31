import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

export type Subscription = typeof schema.orgSubscriptions.$inferSelect;
export type Plan = typeof schema.subscriptionPlans.$inferSelect;

export const GRACE_PERIOD_DAYS = 15;
export const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Busca subscription com dados do plano (join) por organizationId.
 * Usado por: getByOrganizationId, cancel, hasPaidSubscription, checkAccess
 */
export async function findWithPlan(
  organizationId: string
): Promise<{ subscription: Subscription; plan: Plan } | null> {
  const [result] = await db
    .select({
      subscription: schema.orgSubscriptions,
      plan: schema.subscriptionPlans,
    })
    .from(schema.orgSubscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
    )
    .where(eq(schema.orgSubscriptions.organizationId, organizationId))
    .limit(1);

  return result ?? null;
}

/**
 * Busca subscription com dados do plano (join) por subscriptionId.
 * Usado por: expireTrial
 */
export async function findByIdWithPlan(
  subscriptionId: string
): Promise<{ subscription: Subscription; plan: Plan } | null> {
  const [result] = await db
    .select({
      subscription: schema.orgSubscriptions,
      plan: schema.subscriptionPlans,
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
 * Busca subscription simples por organizationId (sem join).
 */
export async function findByOrganizationId(
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
 * Busca subscription simples por subscriptionId (sem join).
 */
export async function findById(
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
 * Busca subscription por pagarmeSubscriptionId.
 */
export async function findByPagarmeId(
  pagarmeSubscriptionId: string
): Promise<Subscription | null> {
  const [subscription] = await db
    .select()
    .from(schema.orgSubscriptions)
    .where(
      eq(schema.orgSubscriptions.pagarmeSubscriptionId, pagarmeSubscriptionId)
    )
    .limit(1);

  return subscription ?? null;
}

/**
 * Atualiza subscription por ID e retorna a subscription atualizada.
 */
export async function updateById(
  subscriptionId: string,
  updates: Partial<Subscription>
): Promise<Subscription | null> {
  await db
    .update(schema.orgSubscriptions)
    .set(updates)
    .where(eq(schema.orgSubscriptions.id, subscriptionId));

  return findById(subscriptionId);
}

/**
 * Atualiza subscription por organizationId e retorna a subscription atualizada.
 */
export async function updateByOrganizationId(
  organizationId: string,
  updates: Partial<Subscription>
): Promise<Subscription | null> {
  await db
    .update(schema.orgSubscriptions)
    .set(updates)
    .where(eq(schema.orgSubscriptions.organizationId, organizationId));

  return findByOrganizationId(organizationId);
}
