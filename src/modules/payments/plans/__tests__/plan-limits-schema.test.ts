import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { planLimits, subscriptionPlans } from "@/db/schema/payments";

const SEED_PLAN_IDS = {
  trial: "plan-trial",
  gold: "plan-gold",
  diamond: "plan-diamond",
  platinum: "plan-platinum",
} as const;

describe("plan_limits schema", () => {
  describe("seed data", () => {
    test("should have trial plan with max_employees = 10", async () => {
      const result = await db
        .select()
        .from(planLimits)
        .where(eq(planLimits.planId, SEED_PLAN_IDS.trial));

      expect(result.length).toBe(1);
      expect(result[0].limitKey).toBe("max_employees");
      expect(result[0].limitValue).toBe(10);
    });

    test("paid plans should not have seeded limits", async () => {
      for (const planId of [
        SEED_PLAN_IDS.gold,
        SEED_PLAN_IDS.diamond,
        SEED_PLAN_IDS.platinum,
      ]) {
        const result = await db
          .select()
          .from(planLimits)
          .where(eq(planLimits.planId, planId));

        expect(result.length).toBe(0);
      }
    });
  });

  describe("FK constraints", () => {
    let tempPlanId: string;

    beforeAll(async () => {
      tempPlanId = `plan-limits-test-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: tempPlanId,
        name: `limits-test-${tempPlanId.slice(-8)}`,
        displayName: "Limits Test Plan",
        isActive: true,
        isPublic: false,
        isTrial: false,
        sortOrder: 99,
      });

      await db.insert(planLimits).values({
        planId: tempPlanId,
        limitKey: "max_employees",
        limitValue: 50,
      });
    });

    test("should allow inserting a valid plan limit", async () => {
      const result = await db
        .select()
        .from(planLimits)
        .where(eq(planLimits.planId, tempPlanId));

      expect(result.length).toBe(1);
      expect(result[0].limitKey).toBe("max_employees");
      expect(result[0].limitValue).toBe(50);
    });

    test("should allow multiple limit keys for the same plan", async () => {
      const extraPlanId = `plan-multi-limits-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: extraPlanId,
        name: `multi-limits-${extraPlanId.slice(-8)}`,
        displayName: "Multi Limits Plan",
        isActive: true,
        isPublic: false,
        isTrial: false,
        sortOrder: 99,
      });

      await db.insert(planLimits).values([
        { planId: extraPlanId, limitKey: "max_employees", limitValue: 100 },
        { planId: extraPlanId, limitKey: "max_members", limitValue: 5 },
        { planId: extraPlanId, limitKey: "max_branches", limitValue: 3 },
      ]);

      const result = await db
        .select()
        .from(planLimits)
        .where(eq(planLimits.planId, extraPlanId));

      expect(result.length).toBe(3);

      const keys = result.map((r) => r.limitKey).sort();
      expect(keys).toEqual(["max_branches", "max_employees", "max_members"]);
    });

    test("ON DELETE CASCADE: deleting a plan should remove its plan_limits", async () => {
      const deletablePlanId = `plan-cascade-limits-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: deletablePlanId,
        name: `cascade-limits-${deletablePlanId.slice(-8)}`,
        displayName: "Cascade Limits Test",
        isActive: false,
        isPublic: false,
        isTrial: false,
        sortOrder: 999,
      });

      await db.insert(planLimits).values([
        { planId: deletablePlanId, limitKey: "max_employees", limitValue: 20 },
        { planId: deletablePlanId, limitKey: "max_members", limitValue: 3 },
      ]);

      const beforeDelete = await db
        .select()
        .from(planLimits)
        .where(eq(planLimits.planId, deletablePlanId));
      expect(beforeDelete.length).toBe(2);

      await db
        .delete(subscriptionPlans)
        .where(eq(subscriptionPlans.id, deletablePlanId));

      const afterDelete = await db
        .select()
        .from(planLimits)
        .where(eq(planLimits.planId, deletablePlanId));
      expect(afterDelete.length).toBe(0);
    });

    test("composite PK: should prevent duplicate plan-limit_key combination", async () => {
      await expect(async () => {
        await db.insert(planLimits).values({
          planId: tempPlanId,
          limitKey: "max_employees",
          limitValue: 999,
        });
      }).toThrow();
    });

    test("FK: should reject plan_limits with non-existent plan_id", async () => {
      await expect(async () => {
        await db.insert(planLimits).values({
          planId: "plan-nonexistent",
          limitKey: "max_employees",
          limitValue: 10,
        });
      }).toThrow();
    });
  });

  describe("limit_value semantics", () => {
    test("should accept -1 as unlimited value", async () => {
      const unlimitedPlanId = `plan-unlimited-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: unlimitedPlanId,
        name: `unlimited-${unlimitedPlanId.slice(-8)}`,
        displayName: "Unlimited Test",
        isActive: true,
        isPublic: false,
        isTrial: false,
        sortOrder: 99,
      });

      await db.insert(planLimits).values({
        planId: unlimitedPlanId,
        limitKey: "max_employees",
        limitValue: -1,
      });

      const [result] = await db
        .select({ limitValue: planLimits.limitValue })
        .from(planLimits)
        .where(eq(planLimits.planId, unlimitedPlanId));

      expect(result.limitValue).toBe(-1);
    });

    test("should accept 0 as a valid limit value", async () => {
      const zeroPlanId = `plan-zero-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: zeroPlanId,
        name: `zero-${zeroPlanId.slice(-8)}`,
        displayName: "Zero Test",
        isActive: true,
        isPublic: false,
        isTrial: false,
        sortOrder: 99,
      });

      await db.insert(planLimits).values({
        planId: zeroPlanId,
        limitKey: "max_branches",
        limitValue: 0,
      });

      const [result] = await db
        .select({ limitValue: planLimits.limitValue })
        .from(planLimits)
        .where(eq(planLimits.planId, zeroPlanId));

      expect(result.limitValue).toBe(0);
    });
  });
});
