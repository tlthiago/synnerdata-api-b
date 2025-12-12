import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import {
  PlanNameAlreadyExistsError,
  PlanNotAvailableError,
  PlanNotFoundError,
} from "../errors";
import { PagarmeClient } from "../pagarme/client";
import type {
  CreatePlanRequest,
  PlanResponse,
  UpdatePlanRequest,
} from "./plan.model";

export abstract class PlanService {
  static async list(): Promise<PlanResponse[]> {
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.isActive, true),
          eq(subscriptionPlans.isPublic, true)
        )
      )
      .orderBy(subscriptionPlans.sortOrder);

    return plans.map((plan) => ({
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
    }));
  }

  static async getById(planId: string): Promise<PlanResponse> {
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
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

  static async getByIdForCheckout(planId: string): Promise<PlanResponse> {
    const plan = await PlanService.getById(planId);

    if (!plan.isActive) {
      throw new PlanNotAvailableError(planId);
    }

    return plan;
  }

  static async getByName(name: string): Promise<PlanResponse | null> {
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, name))
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

  /**
   * Create a new plan.
   */
  static async create(data: CreatePlanRequest): Promise<PlanResponse> {
    // Check if plan with same name already exists
    const [existingPlan] = await db
      .select({ id: subscriptionPlans.id })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, data.name))
      .limit(1);

    if (existingPlan) {
      throw new PlanNameAlreadyExistsError(data.name);
    }

    const planId = `plan-${crypto.randomUUID()}`;

    const [plan] = await db
      .insert(subscriptionPlans)
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

  /**
   * Update an existing plan.
   */
  static async update(
    planId: string,
    data: UpdatePlanRequest
  ): Promise<PlanResponse> {
    // Check if plan exists
    const [existingPlan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);

    if (!existingPlan) {
      throw new PlanNotFoundError(planId);
    }

    // Check if name is being changed and if new name already exists
    if (data.name && data.name !== existingPlan.name) {
      const [planWithSameName] = await db
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(
          and(
            eq(subscriptionPlans.name, data.name),
            ne(subscriptionPlans.id, planId)
          )
        )
        .limit(1);

      if (planWithSameName) {
        throw new PlanNameAlreadyExistsError(data.name);
      }
    }

    const [plan] = await db
      .update(subscriptionPlans)
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
      .where(eq(subscriptionPlans.id, planId))
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

  /**
   * Delete a plan.
   */
  static async delete(planId: string): Promise<void> {
    // Check if plan exists
    const [existingPlan] = await db
      .select({ id: subscriptionPlans.id })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);

    if (!existingPlan) {
      throw new PlanNotFoundError(planId);
    }

    await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
  }

  /**
   * Sync a local plan to Pagarme.
   * Creates the plan in Pagarme if it doesn't exist and stores the pagarmePlanId.
   */
  static async syncToPagarme(planId: string): Promise<string> {
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new PlanNotFoundError(planId);
    }

    // Already synced
    if (plan.pagarmePlanId) {
      return plan.pagarmePlanId;
    }

    // Create plan in Pagarme
    const pagarmePlan = await PagarmeClient.createPlan(
      {
        name: plan.name,
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
        },
      },
      `create-plan-${plan.id}`
    );

    // Save pagarmePlanId
    await db
      .update(subscriptionPlans)
      .set({ pagarmePlanId: pagarmePlan.id })
      .where(eq(subscriptionPlans.id, planId));

    return pagarmePlan.id;
  }

  /**
   * Ensure plan is synced to Pagarme before creating payment links.
   * Returns the plan with guaranteed pagarmePlanId.
   */
  static async ensureSynced(
    planId: string
  ): Promise<PlanResponse & { pagarmePlanId: string }> {
    const plan = await PlanService.getById(planId);

    if (!plan.isActive) {
      throw new PlanNotAvailableError(planId);
    }

    // Check if already has pagarmePlanId
    const [dbPlan] = await db
      .select({ pagarmePlanId: subscriptionPlans.pagarmePlanId })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);

    if (dbPlan?.pagarmePlanId) {
      return { ...plan, pagarmePlanId: dbPlan.pagarmePlanId };
    }

    // Sync to Pagarme
    const pagarmePlanId = await PlanService.syncToPagarme(planId);
    return { ...plan, pagarmePlanId };
  }
}
