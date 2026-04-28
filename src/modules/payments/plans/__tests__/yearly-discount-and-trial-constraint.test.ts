import { describe, expect, test } from "bun:test";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema/payments";

const SEED_PLAN_IDS = {
  trial: "plan-trial",
  gold: "plan-gold",
  diamond: "plan-diamond",
  platinum: "plan-platinum",
} as const;

describe("yearly_discount_percent column and unique trial constraint", () => {
  describe("seed data", () => {
    test("all seeded plans should have yearly_discount_percent = 20", async () => {
      for (const planId of Object.values(SEED_PLAN_IDS)) {
        const [result] = await db
          .select({
            yearlyDiscountPercent: subscriptionPlans.yearlyDiscountPercent,
          })
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, planId));

        expect(result.yearlyDiscountPercent).toBe(20);
      }
    });
  });

  describe("column defaults", () => {
    test("should default yearly_discount_percent to 20 for new plans", async () => {
      const tempPlanId = `plan-default-discount-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: tempPlanId,
        name: `default-discount-${tempPlanId.slice(-8)}`,
        displayName: "Default Discount Test",
        isActive: true,
        isPublic: false,
        isTrial: false,
        sortOrder: 99,
      });

      const [result] = await db
        .select({
          yearlyDiscountPercent: subscriptionPlans.yearlyDiscountPercent,
        })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, tempPlanId));

      expect(result.yearlyDiscountPercent).toBe(20);
    });

    test("should allow custom yearly_discount_percent values", async () => {
      const tempPlanId = `plan-custom-discount-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: tempPlanId,
        name: `custom-discount-${tempPlanId.slice(-8)}`,
        displayName: "Custom Discount Test",
        isActive: true,
        isPublic: false,
        isTrial: false,
        sortOrder: 99,
        yearlyDiscountPercent: 15,
      });

      const [result] = await db
        .select({
          yearlyDiscountPercent: subscriptionPlans.yearlyDiscountPercent,
        })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, tempPlanId));

      expect(result.yearlyDiscountPercent).toBe(15);
    });

    test("should allow yearly_discount_percent = 0 (no discount)", async () => {
      const tempPlanId = `plan-zero-discount-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: tempPlanId,
        name: `zero-discount-${tempPlanId.slice(-8)}`,
        displayName: "Zero Discount Test",
        isActive: true,
        isPublic: false,
        isTrial: false,
        sortOrder: 99,
        yearlyDiscountPercent: 0,
      });

      const [result] = await db
        .select({
          yearlyDiscountPercent: subscriptionPlans.yearlyDiscountPercent,
        })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, tempPlanId));

      expect(result.yearlyDiscountPercent).toBe(0);
    });
  });

  describe("unique trial constraint", () => {
    test("should prevent creating a second active trial plan", async () => {
      // Self-contained precondition: ensure exactly one active public trial
      // exists before asserting the constraint. Factories like PlanFactory
      // may archive the seed trial and not restore it, so we reset state here.
      await db
        .update(subscriptionPlans)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(subscriptionPlans.isTrial, true),
            isNull(subscriptionPlans.archivedAt),
            isNull(subscriptionPlans.organizationId)
          )
        );

      const firstTrialId = `plan-first-trial-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: firstTrialId,
        name: `first-trial-${firstTrialId.slice(-8)}`,
        displayName: "First Trial",
        isActive: true,
        isPublic: false,
        isTrial: true,
        sortOrder: 99,
      });

      const duplicateTrialId = `plan-dup-trial-${crypto.randomUUID()}`;
      await expect(async () => {
        await db.insert(subscriptionPlans).values({
          id: duplicateTrialId,
          name: `dup-trial-${duplicateTrialId.slice(-8)}`,
          displayName: "Duplicate Trial",
          isActive: true,
          isPublic: false,
          isTrial: true,
          sortOrder: 99,
        });
      }).toThrow();
    });

    test("should allow an archived trial plan alongside the active one", async () => {
      const archivedTrialId = `plan-archived-trial-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: archivedTrialId,
        name: `archived-trial-${archivedTrialId.slice(-8)}`,
        displayName: "Archived Trial",
        isActive: true,
        isPublic: false,
        isTrial: true,
        sortOrder: 99,
        archivedAt: new Date(),
      });

      const [result] = await db
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, archivedTrialId));

      expect(result.id).toBe(archivedTrialId);
    });

    test("should allow multiple non-trial plans", async () => {
      const planIds = [
        `plan-non-trial-a-${crypto.randomUUID()}`,
        `plan-non-trial-b-${crypto.randomUUID()}`,
      ];

      for (const planId of planIds) {
        await db.insert(subscriptionPlans).values({
          id: planId,
          name: `non-trial-${planId.slice(-8)}`,
          displayName: `Non-Trial ${planId.slice(-4)}`,
          isActive: true,
          isPublic: false,
          isTrial: false,
          sortOrder: 99,
        });
      }

      const results = await db
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(
          sql`${subscriptionPlans.id} IN (${sql.raw(planIds.map((id) => `'${id}'`).join(","))})`
        );

      expect(results.length).toBe(2);
    });
  });
});
