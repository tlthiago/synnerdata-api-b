import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  InvalidTierCountError,
  InvalidTierRangeError,
  PlanHasActiveSubscriptionsError,
  PlanNameAlreadyExistsError,
  PlanNotAvailableError,
  PlanNotFoundError,
  PricingTierNotFoundError,
  TierGapError,
  TierMinExceedsMaxError,
  TierNegativeMinError,
  TierOverlapError,
  TrialPlanNotFoundError,
} from "@/modules/payments/errors";
import { PagarmePlanHistoryService } from "@/modules/payments/pagarme/pagarme-plan-history.service";

import { calculateYearlyPrice, TRIAL_TIER } from "./plans.constants";
import type {
  CreatePlanData,
  CreatePlanInput,
  DeletePlanData,
  GetPlanData,
  ListPlansData,
  PlanWithTiersData,
  PricingTierData,
  TierPriceInput,
  UpdatePlanData,
  UpdatePlanInput,
} from "./plans.model";

export abstract class PlansService {
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

    const tiers = await db
      .select()
      .from(schema.planPricingTiers)
      .orderBy(schema.planPricingTiers.minEmployees);

    const tiersByPlan = PlansService.groupTiersByPlan(tiers);

    return {
      plans: plans.map((plan) =>
        PlansService.mapPlanWithTiers(plan, tiersByPlan.get(plan.id) ?? [])
      ),
    };
  }

  static async listAll(): Promise<ListPlansData> {
    const plans = await db
      .select()
      .from(schema.subscriptionPlans)
      .orderBy(schema.subscriptionPlans.sortOrder);

    const tiers = await db
      .select()
      .from(schema.planPricingTiers)
      .orderBy(schema.planPricingTiers.minEmployees);

    const tiersByPlan = PlansService.groupTiersByPlan(tiers);

    return {
      plans: plans.map((plan) =>
        PlansService.mapPlanWithTiers(plan, tiersByPlan.get(plan.id) ?? [])
      ),
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

    const tiers = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.planId, planId))
      .orderBy(schema.planPricingTiers.minEmployees);

    return PlansService.mapPlanWithTiers(plan, tiers);
  }

  static async getAvailableById(planId: string): Promise<PlanWithTiersData> {
    const plan = await PlansService.getById(planId);

    if (!plan.isActive) {
      throw new PlanNotAvailableError(planId);
    }

    return plan;
  }

  static async getTrialPlan(): Promise<PlanWithTiersData> {
    const { desc } = await import("drizzle-orm");
    const [plan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.isTrial, true))
      .orderBy(desc(schema.subscriptionPlans.id))
      .limit(1);

    if (!plan) {
      throw new TrialPlanNotFoundError();
    }

    const tiers = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.planId, plan.id))
      .orderBy(schema.planPricingTiers.minEmployees);

    return PlansService.mapPlanWithTiers(plan, tiers);
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

    if (data.pricingTiers) {
      PlansService.validateTierRanges(data.pricingTiers, data.isTrial ?? false);
    }

    const planId = `plan-${crypto.randomUUID()}`;

    return db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(schema.subscriptionPlans)
        .values({
          id: planId,
          name: data.name,
          displayName: data.displayName,
          description: data.description,
          trialDays: data.trialDays ?? 0,
          limits: data.limits,
          isActive: data.isActive ?? true,
          isPublic: data.isPublic ?? true,
          isTrial: data.isTrial ?? false,
          sortOrder: data.sortOrder ?? 0,
        })
        .returning();

      let tiers: PricingTierData[] = [];

      if (data.pricingTiers && data.pricingTiers.length > 0) {
        const tierRecords = data.pricingTiers.map((tier) => ({
          id: `tier-${crypto.randomUUID()}`,
          planId: plan.id,
          minEmployees: tier.minEmployees,
          maxEmployees: tier.maxEmployees,
          priceMonthly: tier.priceMonthly,
          priceYearly: calculateYearlyPrice(tier.priceMonthly),
        }));

        const insertedTiers = await tx
          .insert(schema.planPricingTiers)
          .values(tierRecords)
          .returning();

        tiers = insertedTiers.map((t) => ({
          id: t.id,
          minEmployees: t.minEmployees,
          maxEmployees: t.maxEmployees,
          priceMonthly: t.priceMonthly,
          priceYearly: t.priceYearly,
        }));
      }

      return PlansService.mapPlanWithTiers(plan, tiers);
    });
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

    if (data.pricingTiers) {
      PlansService.validateTierRanges(data.pricingTiers, existingPlan.isTrial);
    }

    const updateFields = PlansService.buildUpdateFields(data);
    const tierInput = data.pricingTiers;

    return db.transaction(async (tx) => {
      const [plan] = await tx
        .update(schema.subscriptionPlans)
        .set(updateFields)
        .where(eq(schema.subscriptionPlans.id, planId))
        .returning();

      const tiers = tierInput?.length
        ? await PlansService.replaceTiers(tx, plan.id, tierInput)
        : await PlansService.getExistingTiers(tx, planId);

      return PlansService.mapPlanWithTiers(plan, tiers);
    });
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

    const [activeSubscription] = await db
      .select({ id: schema.orgSubscriptions.id })
      .from(schema.orgSubscriptions)
      .where(
        and(
          eq(schema.orgSubscriptions.planId, planId),
          ne(schema.orgSubscriptions.status, "canceled"),
          ne(schema.orgSubscriptions.status, "expired")
        )
      )
      .limit(1);

    if (activeSubscription) {
      throw new PlanHasActiveSubscriptionsError(planId);
    }

    await db
      .delete(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId));

    return { deleted: true };
  }

  private static validateTierRanges(
    tiers: TierPriceInput[],
    isTrial: boolean
  ): void {
    if (isTrial) {
      PlansService.validateTrialTiers(tiers);
    } else {
      PlansService.validatePaidPlanTiers(tiers);
    }
  }

  private static validateTrialTiers(tiers: TierPriceInput[]): void {
    const expectedCount = 1;
    if (tiers.length !== expectedCount) {
      throw new InvalidTierCountError(tiers.length, expectedCount);
    }

    const tier = tiers[0];

    if (
      tier.minEmployees !== TRIAL_TIER.min ||
      tier.maxEmployees !== TRIAL_TIER.max
    ) {
      throw new InvalidTierRangeError(
        0,
        { min: tier.minEmployees, max: tier.maxEmployees },
        { min: TRIAL_TIER.min, max: TRIAL_TIER.max }
      );
    }
  }

  private static validatePaidPlanTiers(tiers: TierPriceInput[]): void {
    if (tiers.length < 1) {
      throw new InvalidTierCountError(tiers.length, 1);
    }

    const sorted = [...tiers].sort((a, b) => a.minEmployees - b.minEmployees);

    for (let i = 0; i < sorted.length; i++) {
      const tier = sorted[i];

      if (tier.minEmployees < 0) {
        throw new TierNegativeMinError(i, tier.minEmployees);
      }

      if (tier.minEmployees > tier.maxEmployees) {
        throw new TierMinExceedsMaxError(
          i,
          tier.minEmployees,
          tier.maxEmployees
        );
      }

      if (i > 0) {
        const prev = sorted[i - 1];
        const expectedMin = prev.maxEmployees + 1;

        if (tier.minEmployees < expectedMin) {
          throw new TierOverlapError(i, prev.maxEmployees, tier.minEmployees);
        }

        if (tier.minEmployees > expectedMin) {
          throw new TierGapError(i, expectedMin, tier.minEmployees);
        }
      }
    }

    if (sorted[0].minEmployees !== 0) {
      throw new TierGapError(0, 0, sorted[0].minEmployees);
    }
  }

  private static buildUpdateFields(
    data: UpdatePlanInput
  ): Record<string, unknown> {
    const fields: Record<string, unknown> = { updatedAt: new Date() };

    if (data.displayName !== undefined) {
      fields.displayName = data.displayName;
    }
    if (data.description !== undefined) {
      fields.description = data.description;
    }
    if (data.trialDays !== undefined) {
      fields.trialDays = data.trialDays;
    }
    if (data.limits !== undefined) {
      fields.limits = data.limits;
    }
    if (data.isActive !== undefined) {
      fields.isActive = data.isActive;
    }
    if (data.isPublic !== undefined) {
      fields.isPublic = data.isPublic;
    }
    if (data.sortOrder !== undefined) {
      fields.sortOrder = data.sortOrder;
    }

    return fields;
  }

  private static async replaceTiers(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    planId: string,
    tiers: TierPriceInput[]
  ): Promise<PricingTierData[]> {
    const oldTiers = await tx
      .select({ id: schema.planPricingTiers.id })
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.planId, planId));

    for (const oldTier of oldTiers) {
      await PagarmePlanHistoryService.deactivateByTierId(oldTier.id);
    }

    await tx
      .delete(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.planId, planId));

    const tierRecords = tiers.map((tier) => ({
      id: `tier-${crypto.randomUUID()}`,
      planId,
      minEmployees: tier.minEmployees,
      maxEmployees: tier.maxEmployees,
      priceMonthly: tier.priceMonthly,
      priceYearly: calculateYearlyPrice(tier.priceMonthly),
    }));

    const inserted = await tx
      .insert(schema.planPricingTiers)
      .values(tierRecords)
      .returning();

    return inserted.map((t) => ({
      id: t.id,
      minEmployees: t.minEmployees,
      maxEmployees: t.maxEmployees,
      priceMonthly: t.priceMonthly,
      priceYearly: t.priceYearly,
    }));
  }

  private static async getExistingTiers(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    planId: string
  ): Promise<PricingTierData[]> {
    const tiers = await tx
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.planId, planId))
      .orderBy(schema.planPricingTiers.minEmployees);

    return tiers.map((t) => ({
      id: t.id,
      minEmployees: t.minEmployees,
      maxEmployees: t.maxEmployees,
      priceMonthly: t.priceMonthly,
      priceYearly: t.priceYearly,
    }));
  }

  private static groupTiersByPlan(
    tiers: {
      planId: string;
      id: string;
      minEmployees: number;
      maxEmployees: number;
      priceMonthly: number;
      priceYearly: number;
    }[]
  ): Map<string, PricingTierData[]> {
    const tiersByPlan = new Map<string, PricingTierData[]>();

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

    return tiersByPlan;
  }

  private static mapPlanWithTiers(
    plan: {
      id: string;
      name: string;
      displayName: string;
      description: string | null;
      trialDays: number;
      limits: { features: string[] } | null;
      isActive: boolean;
      isPublic: boolean;
      isTrial: boolean;
      sortOrder: number;
    },
    tiers: PricingTierData[]
  ): PlanWithTiersData {
    const startingPriceMonthly =
      tiers.length > 0 ? Math.min(...tiers.map((t) => t.priceMonthly)) : 0;
    const startingPriceYearly =
      tiers.length > 0 ? Math.min(...tiers.map((t) => t.priceYearly)) : 0;

    return {
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      description: plan.description,
      trialDays: plan.trialDays,
      limits: plan.limits,
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      isTrial: plan.isTrial,
      sortOrder: plan.sortOrder,
      startingPriceMonthly,
      startingPriceYearly,
      pricingTiers: tiers,
    };
  }

  static async getTierById(tierId: string): Promise<PricingTierData> {
    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tierId))
      .limit(1);

    if (!tier) {
      throw new PricingTierNotFoundError("unknown", tierId);
    }

    return {
      id: tier.id,
      minEmployees: tier.minEmployees,
      maxEmployees: tier.maxEmployees,
      priceMonthly: tier.priceMonthly,
      priceYearly: tier.priceYearly,
    };
  }
}
