import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  features,
  planFeatures,
  subscriptionPlans,
} from "@/db/schema/payments";

const SEED_PLAN_IDS = {
  trial: "plan-trial",
  gold: "plan-gold",
  diamond: "plan-diamond",
  platinum: "plan-platinum",
} as const;

const ALL_FEATURE_IDS = [
  "terminated_employees",
  "absences",
  "medical_certificates",
  "accidents",
  "warnings",
  "employee_status",
  "birthdays",
  "ppe",
  "employee_record",
  "payroll",
] as const;

const PLAN_FEATURE_IDS = {
  trial: [...ALL_FEATURE_IDS],
  gold: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
  ],
  diamond: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
  ],
  platinum: [...ALL_FEATURE_IDS],
} as const;

describe("features and plan_features schema", () => {
  describe("features table — seed data", () => {
    test("should have 10 seeded features", async () => {
      const result = await db.select().from(features);
      expect(result.length).toBe(10);
    });

    test("should have correct feature IDs", async () => {
      const result = await db.select({ id: features.id }).from(features);
      const ids = result.map((r) => r.id).sort();
      expect(ids).toEqual([...ALL_FEATURE_IDS].sort());
    });

    test("should have correct display names", async () => {
      const expectedNames: Record<string, string> = {
        terminated_employees: "Demitidos",
        absences: "Faltas",
        medical_certificates: "Atestados",
        accidents: "Acidentes",
        warnings: "Advertências",
        employee_status: "Status do Trabalhador",
        birthdays: "Aniversariantes",
        ppe: "EPI",
        employee_record: "Ficha Cadastral",
        payroll: "Folha",
      };

      const result = await db
        .select({ id: features.id, displayName: features.displayName })
        .from(features);

      for (const row of result) {
        expect(row.displayName).toBe(expectedNames[row.id]);
      }
    });

    test("should have 6 default features (is_default = true)", async () => {
      const result = await db
        .select()
        .from(features)
        .where(eq(features.isDefault, true));
      expect(result.length).toBe(6);

      const defaultIds = result.map((r) => r.id).sort();
      expect(defaultIds).toEqual(
        [
          "terminated_employees",
          "absences",
          "medical_certificates",
          "accidents",
          "warnings",
          "employee_status",
        ].sort()
      );
    });

    test("should have 2 premium features (is_premium = true)", async () => {
      const result = await db
        .select()
        .from(features)
        .where(eq(features.isPremium, true));
      expect(result.length).toBe(2);

      const premiumIds = result.map((r) => r.id).sort();
      expect(premiumIds).toEqual(["employee_record", "payroll"].sort());
    });

    test("should have all features active by default", async () => {
      const result = await db
        .select()
        .from(features)
        .where(eq(features.isActive, true));
      expect(result.length).toBe(10);
    });

    test("should have sequential sort_order", async () => {
      const result = await db
        .select({ id: features.id, sortOrder: features.sortOrder })
        .from(features);

      const sortOrders = result
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r) => r.sortOrder);

      expect(sortOrders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe("plan_features table — seed associations", () => {
    test("trial plan should have all 10 features", async () => {
      const result = await db
        .select({ featureId: planFeatures.featureId })
        .from(planFeatures)
        .where(eq(planFeatures.planId, SEED_PLAN_IDS.trial));

      const featureIds = result.map((r) => r.featureId).sort();
      expect(featureIds).toEqual([...PLAN_FEATURE_IDS.trial].sort());
    });

    test("gold plan should have 6 default features", async () => {
      const result = await db
        .select({ featureId: planFeatures.featureId })
        .from(planFeatures)
        .where(eq(planFeatures.planId, SEED_PLAN_IDS.gold));

      const featureIds = result.map((r) => r.featureId).sort();
      expect(featureIds).toEqual([...PLAN_FEATURE_IDS.gold].sort());
    });

    test("diamond plan should have gold + birthdays, ppe, employee_record", async () => {
      const result = await db
        .select({ featureId: planFeatures.featureId })
        .from(planFeatures)
        .where(eq(planFeatures.planId, SEED_PLAN_IDS.diamond));

      const featureIds = result.map((r) => r.featureId).sort();
      expect(featureIds).toEqual([...PLAN_FEATURE_IDS.diamond].sort());
    });

    test("platinum plan should have diamond + payroll", async () => {
      const result = await db
        .select({ featureId: planFeatures.featureId })
        .from(planFeatures)
        .where(eq(planFeatures.planId, SEED_PLAN_IDS.platinum));

      const featureIds = result.map((r) => r.featureId).sort();
      expect(featureIds).toEqual([...PLAN_FEATURE_IDS.platinum].sort());
    });

    test("feature count should increase with plan tier", async () => {
      const counts: Record<string, number> = {};

      for (const [name, planId] of Object.entries(SEED_PLAN_IDS)) {
        const result = await db
          .select({ featureId: planFeatures.featureId })
          .from(planFeatures)
          .where(eq(planFeatures.planId, planId));
        counts[name] = result.length;
      }

      expect(counts.gold).toBeLessThan(counts.diamond);
      expect(counts.diamond).toBeLessThan(counts.platinum);
      expect(counts.platinum).toBe(counts.trial);
    });
  });

  describe("FK constraints", () => {
    let tempPlanId: string;

    beforeAll(async () => {
      tempPlanId = `plan-fk-test-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: tempPlanId,
        name: `fk-test-${tempPlanId.slice(-8)}`,
        displayName: "FK Test Plan",
        isActive: true,
        isPublic: false,
        isTrial: false,
        sortOrder: 99,
      });

      await db.insert(planFeatures).values({
        planId: tempPlanId,
        featureId: "absences",
      });
    });

    test("ON DELETE CASCADE: deleting a plan should remove its plan_features", async () => {
      const deletablePlanId = `plan-cascade-${crypto.randomUUID()}`;
      await db.insert(subscriptionPlans).values({
        id: deletablePlanId,
        name: `cascade-test-${deletablePlanId.slice(-8)}`,
        displayName: "Cascade Test",
        isActive: false,
        isPublic: false,
        isTrial: false,
        sortOrder: 999,
      });

      await db.insert(planFeatures).values([
        { planId: deletablePlanId, featureId: "absences" },
        { planId: deletablePlanId, featureId: "warnings" },
      ]);

      const beforeDelete = await db
        .select()
        .from(planFeatures)
        .where(eq(planFeatures.planId, deletablePlanId));
      expect(beforeDelete.length).toBe(2);

      await db
        .delete(subscriptionPlans)
        .where(eq(subscriptionPlans.id, deletablePlanId));

      const afterDelete = await db
        .select()
        .from(planFeatures)
        .where(eq(planFeatures.planId, deletablePlanId));
      expect(afterDelete.length).toBe(0);
    });

    test("ON DELETE RESTRICT: should prevent deleting a feature that is associated to a plan", async () => {
      await expect(async () => {
        await db.delete(features).where(eq(features.id, "absences"));
      }).toThrow();
    });

    test("composite PK: should prevent duplicate plan-feature association", async () => {
      await expect(async () => {
        await db.insert(planFeatures).values({
          planId: tempPlanId,
          featureId: "absences",
        });
      }).toThrow();
    });

    test("FK: should reject plan_features with non-existent plan_id", async () => {
      await expect(async () => {
        await db.insert(planFeatures).values({
          planId: "plan-nonexistent",
          featureId: "absences",
        });
      }).toThrow();
    });

    test("FK: should reject plan_features with non-existent feature_id", async () => {
      await expect(async () => {
        await db.insert(planFeatures).values({
          planId: tempPlanId,
          featureId: "nonexistent_feature",
        });
      }).toThrow();
    });
  });

  describe("features table — column defaults", () => {
    test("should set created_at and updated_at automatically", async () => {
      const result = await db
        .select({
          id: features.id,
          createdAt: features.createdAt,
          updatedAt: features.updatedAt,
        })
        .from(features)
        .where(eq(features.id, "absences"));

      expect(result.length).toBe(1);
      expect(result[0].createdAt).toBeInstanceOf(Date);
      expect(result[0].updatedAt).toBeInstanceOf(Date);
    });

    test("should default sort_order to 0 for new features", async () => {
      const testId = `test-default-sort-${crypto.randomUUID().slice(0, 8)}`;

      try {
        await db.insert(features).values({
          id: testId,
          displayName: "Test Default Sort",
        });

        const [result] = await db
          .select({ sortOrder: features.sortOrder })
          .from(features)
          .where(eq(features.id, testId));

        expect(result.sortOrder).toBe(0);
      } finally {
        await db.execute(sql`DELETE FROM "features" WHERE "id" = ${testId}`);
      }
    });
  });
});
