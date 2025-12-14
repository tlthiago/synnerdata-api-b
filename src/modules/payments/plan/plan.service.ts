import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  PlanNameAlreadyExistsError,
  PlanNotAvailableError,
  PlanNotFoundError,
} from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type {
  CreatePlanInput,
  CreatePlanResponse,
  DeletePlanResponse,
  GetPlanResponse,
  ListPlansResponse,
  PlanData,
  SyncPlanResponse,
  UpdatePlanInput,
  UpdatePlanResponse,
} from "./plan.model";

export abstract class PlanService {
  static async list(): Promise<ListPlansResponse> {
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

    return {
      success: true as const,
      data: {
        plans: plans.map((plan) => {
          const monthlyEquivalent =
            plan.priceYearly > 0
              ? Math.round(plan.priceYearly / 12)
              : plan.priceMonthly;
          const savingsYearly = plan.priceMonthly * 12 - plan.priceYearly;

          return {
            id: plan.id,
            name: plan.name,
            displayName: plan.displayName,
            priceMonthly: plan.priceMonthly,
            priceYearly: plan.priceYearly,
            monthlyEquivalent,
            savingsYearly: savingsYearly > 0 ? savingsYearly : 0,
            savingsPercent:
              savingsYearly > 0
                ? Math.round((savingsYearly / (plan.priceMonthly * 12)) * 100)
                : 0,
            trialDays: plan.trialDays,
            limits: plan.limits,
            isActive: plan.isActive,
            isPublic: plan.isPublic,
            sortOrder: plan.sortOrder,
          };
        }),
      },
    };
  }

  static async getById(planId: string): Promise<GetPlanResponse> {
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new PlanNotFoundError(planId);
    }

    return {
      success: true as const,
      data: {
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
      },
    };
  }

  static async getByIdForCheckout(planId: string): Promise<PlanData> {
    const response = await PlanService.getById(planId);
    const plan = response.data;

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

  static async create(data: CreatePlanInput): Promise<CreatePlanResponse> {
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
      success: true as const,
      data: {
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
      },
    };
  }

  static async update(
    planId: string,
    data: UpdatePlanInput
  ): Promise<UpdatePlanResponse> {
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
      success: true as const,
      data: {
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
      },
    };
  }

  static async delete(planId: string): Promise<DeletePlanResponse> {
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
      success: true as const,
      data: {
        deleted: true,
      },
    };
  }

  static async syncToPagarme(planId: string): Promise<SyncPlanResponse> {
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
      const monthlyPlan = await PagarmeClient.createPlan(
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
      );
      pagarmePlanIdMonthly = monthlyPlan.id;
    }

    if (!pagarmePlanIdYearly && plan.priceYearly > 0) {
      const yearlyPlan = await PagarmeClient.createPlan(
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
      );
      pagarmePlanIdYearly = yearlyPlan.id;
    }

    await db
      .update(schema.subscriptionPlans)
      .set({ pagarmePlanIdMonthly, pagarmePlanIdYearly })
      .where(eq(schema.subscriptionPlans.id, planId));

    return {
      success: true as const,
      data: {
        id: plan.id,
        pagarmePlanIdMonthly,
        pagarmePlanIdYearly,
      },
    };
  }

  static async ensureSynced(planId: string): Promise<
    PlanData & {
      pagarmePlanIdMonthly: string | null;
      pagarmePlanIdYearly: string | null;
    }
  > {
    const response = await PlanService.getById(planId);
    const plan = response.data;

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
      pagarmePlanIdMonthly: syncResponse.data.pagarmePlanIdMonthly,
      pagarmePlanIdYearly: syncResponse.data.pagarmePlanIdYearly,
    };
  }
}
