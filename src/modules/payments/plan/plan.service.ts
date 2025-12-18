import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { Retry } from "@/lib/utils/retry";
import {
  PlanNameAlreadyExistsError,
  PlanNotAvailableError,
  PlanNotFoundError,
} from "@/modules/payments/errors";
import { PagarmeClient } from "@/modules/payments/pagarme/client";
import type {
  CreatePlanData,
  CreatePlanInput,
  DeletePlanData,
  GetPlanData,
  ListPlansData,
  PlanData,
  SyncPlanData,
  UpdatePlanData,
  UpdatePlanInput,
} from "./plan.model";

export abstract class PlanService {
  static async list(): Promise<ListPlansData> {
    const plans = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(
        and(
          eq(schema.subscriptionPlans.isActive, true),
          eq(schema.subscriptionPlans.isPublic, true)
        )
      )
      .orderBy(schema.subscriptionPlans.sortOrder);

    // Fetch pricing tiers for all plans
    const tiers = await db
      .select()
      .from(schema.planPricingTiers)
      .orderBy(schema.planPricingTiers.minEmployees);

    // Group tiers by planId
    const tiersByPlan = new Map<
      string,
      {
        id: string;
        minEmployees: number;
        maxEmployees: number;
        priceMonthly: number;
        priceYearly: number;
      }[]
    >();
    for (const tier of tiers) {
      if (!tiersByPlan.has(tier.planId)) {
        tiersByPlan.set(tier.planId, []);
      }
      tiersByPlan.get(tier.planId)?.push({
        id: tier.id,
        minEmployees: tier.minEmployees,
        maxEmployees: tier.maxEmployees,
        priceMonthly: tier.priceMonthly,
        priceYearly: tier.priceYearly,
      });
    }

    return {
      plans: plans.map((plan) => {
        const planTiers = tiersByPlan.get(plan.id) ?? [];
        const startingPrice =
          planTiers.length > 0
            ? Math.min(...planTiers.map((t) => t.priceMonthly))
            : plan.priceMonthly;

        return {
          id: plan.id,
          name: plan.name,
          displayName: plan.displayName,
          description: plan.description,
          startingPrice,
          trialDays: plan.trialDays,
          limits: plan.limits,
          isActive: plan.isActive,
          isPublic: plan.isPublic,
          sortOrder: plan.sortOrder,
          pricingTiers: planTiers,
        };
      }),
    };
  }

  static async getById(planId: string): Promise<GetPlanData> {
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new PlanNotFoundError(planId);
    }

    return {
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      trialDays: plan.trialDays,
      limits: plan.limits,
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      sortOrder: plan.sortOrder,
    };
  }

  static async getByIdForCheckout(planId: string): Promise<PlanData> {
    const plan = await PlanService.getById(planId);

    if (!plan.isActive) {
      throw new PlanNotAvailableError(planId);
    }

    return plan;
  }

  static async getByName(name: string): Promise<PlanData | null> {
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.name, name))
      .limit(1);

    if (!plan) {
      return null;
    }

    return {
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      trialDays: plan.trialDays,
      limits: plan.limits,
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      sortOrder: plan.sortOrder,
    };
  }

  static async create(data: CreatePlanInput): Promise<CreatePlanData> {
    const [existingPlan] = await db
      .select({ id: schema.subscriptionPlans.id })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.name, data.name))
      .limit(1);

    if (existingPlan) {
      throw new PlanNameAlreadyExistsError(data.name);
    }

    const planId = `plan-${crypto.randomUUID()}`;

    const [plan] = await db
      .insert(schema.subscriptionPlans)
      .values({
        id: planId,
        name: data.name,
        displayName: data.displayName,
        priceMonthly: data.priceMonthly,
        priceYearly: data.priceYearly,
        trialDays: data.trialDays,
        limits: data.limits,
        isActive: data.isActive,
        isPublic: data.isPublic,
        sortOrder: data.sortOrder,
      })
      .returning();

    return {
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      trialDays: plan.trialDays,
      limits: plan.limits,
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      sortOrder: plan.sortOrder,
    };
  }

  static async update(
    planId: string,
    data: UpdatePlanInput
  ): Promise<UpdatePlanData> {
    const [existingPlan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (!existingPlan) {
      throw new PlanNotFoundError(planId);
    }

    if (data.name && data.name !== existingPlan.name) {
      const [planWithSameName] = await db
        .select({ id: schema.subscriptionPlans.id })
        .from(schema.subscriptionPlans)
        .where(
          and(
            eq(schema.subscriptionPlans.name, data.name),
            ne(schema.subscriptionPlans.id, planId)
          )
        )
        .limit(1);

      if (planWithSameName) {
        throw new PlanNameAlreadyExistsError(data.name);
      }
    }

    const [plan] = await db
      .update(schema.subscriptionPlans)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.displayName !== undefined && {
          displayName: data.displayName,
        }),
        ...(data.priceMonthly !== undefined && {
          priceMonthly: data.priceMonthly,
        }),
        ...(data.priceYearly !== undefined && {
          priceYearly: data.priceYearly,
        }),
        ...(data.trialDays !== undefined && { trialDays: data.trialDays }),
        ...(data.limits !== undefined && { limits: data.limits }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      })
      .where(eq(schema.subscriptionPlans.id, planId))
      .returning();

    return {
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      trialDays: plan.trialDays,
      limits: plan.limits,
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      sortOrder: plan.sortOrder,
    };
  }

  static async delete(planId: string): Promise<DeletePlanData> {
    const [existingPlan] = await db
      .select({ id: schema.subscriptionPlans.id })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (!existingPlan) {
      throw new PlanNotFoundError(planId);
    }

    await db
      .delete(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId));

    return {
      deleted: true,
    };
  }

  static async syncToPagarme(planId: string): Promise<SyncPlanData> {
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new PlanNotFoundError(planId);
    }

    let pagarmePlanIdMonthly = plan.pagarmePlanIdMonthly;
    let pagarmePlanIdYearly = plan.pagarmePlanIdYearly;

    if (!pagarmePlanIdMonthly) {
      const monthlyPlan = await Retry.withRetry(
        () =>
          PagarmeClient.createPlan(
            {
              name: `${plan.name}-monthly`,
              description: plan.displayName,
              currency: "BRL",
              interval: "month",
              interval_count: 1,
              billing_type: "prepaid",
              payment_methods: ["credit_card"],
              items: [
                {
                  name: plan.displayName,
                  quantity: 1,
                  pricing_scheme: {
                    price: plan.priceMonthly,
                    scheme_type: "unit",
                  },
                },
              ],
              metadata: {
                local_plan_id: plan.id,
                billing_cycle: "monthly",
              },
            },
            `create-plan-monthly-${plan.id}`
          ),
        { maxAttempts: 3, delayMs: 1000 }
      );
      pagarmePlanIdMonthly = monthlyPlan.id;
    }

    if (!pagarmePlanIdYearly && plan.priceYearly > 0) {
      const yearlyPlan = await Retry.withRetry(
        () =>
          PagarmeClient.createPlan(
            {
              name: `${plan.name}-yearly`,
              description: `${plan.displayName} (Anual)`,
              currency: "BRL",
              interval: "year",
              interval_count: 1,
              billing_type: "prepaid",
              payment_methods: ["credit_card"],
              items: [
                {
                  name: `${plan.displayName} (Anual)`,
                  quantity: 1,
                  pricing_scheme: {
                    price: plan.priceYearly,
                    scheme_type: "unit",
                  },
                },
              ],
              metadata: {
                local_plan_id: plan.id,
                billing_cycle: "yearly",
              },
            },
            `create-plan-yearly-${plan.id}`
          ),
        { maxAttempts: 3, delayMs: 1000 }
      );
      pagarmePlanIdYearly = yearlyPlan.id;
    }

    await db
      .update(schema.subscriptionPlans)
      .set({ pagarmePlanIdMonthly, pagarmePlanIdYearly })
      .where(eq(schema.subscriptionPlans.id, planId));

    return {
      id: plan.id,
      pagarmePlanIdMonthly,
      pagarmePlanIdYearly,
    };
  }

  static async ensureSynced(planId: string): Promise<
    PlanData & {
      pagarmePlanIdMonthly: string | null;
      pagarmePlanIdYearly: string | null;
    }
  > {
    const plan = await PlanService.getById(planId);

    if (!plan.isActive) {
      throw new PlanNotAvailableError(planId);
    }

    const [dbPlan] = await db
      .select({
        pagarmePlanIdMonthly: schema.subscriptionPlans.pagarmePlanIdMonthly,
        pagarmePlanIdYearly: schema.subscriptionPlans.pagarmePlanIdYearly,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (dbPlan?.pagarmePlanIdMonthly) {
      return {
        ...plan,
        pagarmePlanIdMonthly: dbPlan.pagarmePlanIdMonthly,
        pagarmePlanIdYearly: dbPlan.pagarmePlanIdYearly,
      };
    }

    const syncResponse = await PlanService.syncToPagarme(planId);
    return {
      ...plan,
      pagarmePlanIdMonthly: syncResponse.pagarmePlanIdMonthly,
      pagarmePlanIdYearly: syncResponse.pagarmePlanIdYearly,
    };
  }
}
